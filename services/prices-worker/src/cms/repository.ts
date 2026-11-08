/**
 * Trusted Node.js Postgres transaction writer. Never import into the public
 * Cloudflare GET Worker. Only authenticated review infrastructure calls this.
 */
import type { Pool, PoolClient } from "pg";
import { assessPublishableContent } from "../../../content/publish-policy.mjs";

type Payload={type:"news"|"phone";slug:string;title:string;sources:string[];coverMediaId?:string|null;[key:string]:unknown};
type Submission={id:string;external_key:string;content_type:string;slug:string;payload:Payload;state:string;revision_no:number};
type Outbox={id:string;submission_id:string;revision_no:number;event_kind:"published"|"withdrawn";routes:string[]};
const KEY=/^[a-zA-Z0-9_.:-]{1,160}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function checkId(id:string){if(!UUID.test(id??""))throw Error("invalid_submission_id")}
function checkPayload(p:Payload){
  if(!p||!["news","phone"].includes(p.type)||typeof p.slug!=="string"||
      p.slug.length>100||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug))throw Error("invalid_content_identity");
  const json=JSON.stringify(p);
  if(json.length>65536)throw Error("content_too_large");
  return json;
}
async function tx<T>(pool:Pool,fn:(c:PoolClient)=>Promise<T>):Promise<T>{
  const c=await pool.connect();
  try{await c.query("BEGIN");const result=await fn(c);await c.query("COMMIT");return result}
  catch(e){await c.query("ROLLBACK");throw e}
  finally{c.release()}
}
async function locked(c:PoolClient,id:string):Promise<Submission>{
  checkId(id);
  const {rows}=await c.query<Submission>("SELECT * FROM content_submissions WHERE id=$1 FOR UPDATE",[id]);
  if(!rows[0])throw Error("content_not_found");return rows[0];
}
/** All trust originates from independently restricted DB tables, never model fields. */
async function trusted(c:PoolClient,row:Submission,now:Date){
  const sources=Array.isArray(row.payload.sources)?row.payload.sources:[];
  const unique=new Set(sources);
  const found=sources.length? (await c.query<{id:string;source_type:string;rights_ref:string;rights_approved:boolean;source_label:string;source_url:string}>(
    "SELECT id,source_type,rights_ref,rights_approved,source_label,source_url FROM cms_trusted_sources WHERE id=ANY($1::varchar[])",[sources])).rows:[];
  const validSources=sources.length>0&&unique.size===sources.length&&found.length===sources.length&&
    found.every(s=>s.rights_approved);
  const asset=row.payload.coverMediaId?(await c.query<{id:string;r2_key:string;license_evidence_ref:string;rights_approved:boolean}>(
    "SELECT * FROM cms_media_assets WHERE id=$1",[row.payload.coverMediaId])).rows[0]:undefined;
  const grant=(await c.query<{approved:boolean;editorial_verified:boolean;originality_verified:boolean;specifications_verified:boolean;verified_at:Date;verified_by:string;credited_author:string}>(
    "SELECT * FROM cms_review_grants WHERE submission_id=$1 AND revision_no=$2",[row.id,row.revision_no])).rows[0];
  const grantAge=grant?now.getTime()-new Date(grant.verified_at).getTime():Infinity;
  const permitted=grant?.approved===true&&grantAge>=-300000&&grantAge<=30*86400000;
  return {
    sourceRightsApproved:validSources,
    sourceRightsRef:validSources?found[0].rights_ref:"",
    approvedSourceIds:validSources?sources:[],
    approvedMediaIds:asset?.rights_approved&&row.payload.coverMediaId?[row.payload.coverMediaId]:[],
    editorialVerification:permitted&&grant.editorial_verified?"verified":"pending",
    originalityChecked:!!(permitted&&grant.originality_verified),
    specificationsVerified:!!(permitted&&grant.specifications_verified),
    sourceType:validSources?found[0].source_type:"",
    reviewer:permitted?grant.verified_by:null,
    creditedAuthor:permitted?grant.credited_author:null,
    mediaRightsRef:asset?.rights_approved?asset.license_evidence_ref:null,
    publicSourceLinks: validSources?sources.map(id=>{
      const entry=found.find(x=>x.id===id);
      return {id,label:entry!.source_label,url:entry!.source_url};
    }):[]
  };
}
export class CmsRepository{
  constructor(private readonly pool:Pool){}
  async submit(externalKey:string,payload:Payload){
    if(!KEY.test(externalKey??""))throw Error("invalid_external_key");
    const json=checkPayload(payload);
    return tx(this.pool,async c=>{
      const {rows}=await c.query<Submission>(
        "INSERT INTO content_submissions(external_key,content_type,slug,payload,state) VALUES($1,$2,$3,$4::jsonb,'pending_review') ON CONFLICT(external_key) DO NOTHING RETURNING *",
        [externalKey,payload.type,payload.slug,json]);
      if(rows[0])return {id:rows[0].id,revision:1,state:"pending_review",replay:false};
      const old=(await c.query<Submission>("SELECT * FROM content_submissions WHERE external_key=$1 FOR UPDATE",[externalKey])).rows[0];
      if(!old)throw Error("concurrent_submission_retry");
      const same=(await c.query<{same:boolean}>(
        "SELECT payload=$1::jsonb AS same FROM content_submissions WHERE id=$2",[json,old.id])).rows[0];
      if(!same?.same)throw Error("external_key_conflict");
      return {id:old.id,revision:old.revision_no,state:old.state,replay:true};
    });
  }
  /** Draft revisions leave last publicly approved snapshot unchanged. */
  async revise(id:string,expectedRevision:number,payload:Payload){
    const json=checkPayload(payload);
    return tx(this.pool,async c=>{
      const old=await locked(c,id);
      if(old.revision_no!==expectedRevision)throw Error("revision_conflict");
      if(old.content_type!==payload.type||old.slug!==payload.slug)throw Error("immutable_content_identity");
      if(old.state==="withdrawn")throw Error("withdrawn_requires_explicit_reactivation");
      const next=expectedRevision+1;
      await c.query("UPDATE content_submissions SET payload=$1::jsonb,revision_no=$2,updated_at=now(),quarantine_reasons='[]'::jsonb WHERE id=$3",[json,next,id]);
      return {id,revision:next,state:old.state};
    });
  }
  async publish(id:string,expectedRevision:number,now=new Date()){
    return tx(this.pool,async c=>{
      const row=await locked(c,id);
      if(row.revision_no!==expectedRevision)throw Error("revision_conflict");
      if(row.state==="withdrawn")throw Error("withdrawn_requires_explicit_reactivation");
      const earlier=await c.query("SELECT 1 FROM published_content_versions WHERE submission_id=$1 AND version=$2",[id,expectedRevision]);
      if(earlier.rowCount)return {id,state:"published",version:expectedRevision,replay:true};
      const authorization=await trusted(c,row,now);
      const checked=assessPublishableContent(row.payload,authorization,now);
      if(checked.status!=="ready_for_auto_publish"){
        const persistent=row.state==="published"?"published":"quarantined";
        await c.query("UPDATE content_submissions SET state=$1,quarantine_reasons=$2::jsonb,updated_at=now() WHERE id=$3",
          [persistent,JSON.stringify(checked.failures),id]);
        return {id,state:"quarantined",failures:checked.failures,version:null};
      }
      const prior=(await c.query<{public_path:string}>("SELECT public_path FROM published_route_bindings WHERE submission_id=$1",[id]))
        .rows.map(r=>r.public_path);
      const safe:Record<string,unknown>={...row.payload,
        sources:authorization.publicSourceLinks.map(({label,url})=>({label,url})),
        publishedAt:now.toISOString(),
        author:authorization.creditedAuthor};
      delete safe.mediaPath;delete safe.mediaUrl;
      if(!authorization.approvedMediaIds.length)delete safe.coverMediaId;
      if(row.content_type==="phone" && Array.isArray(row.payload.specifications)){
        const sourceNames=new Map(authorization.publicSourceLinks.map(item=>[
          item.id,item.label
        ]));
        safe.specifications=row.payload.specifications.map(item=>{
          const field=item as {label:string;value:string;sourceId:string};
          return {label:field.label,value:field.value,
            sourceLabel:sourceNames.get(field.sourceId)??"Verified source"};
        });
      }
      await c.query("INSERT INTO published_content_versions(submission_id,version,public_payload) VALUES($1,$2,$3::jsonb)",
        [id,expectedRevision,JSON.stringify(safe)]);
      // Rights dependencies belong to THIS immutable published version,
      // not to the mutable current draft or copied public source credits.
      for(const sourceId of row.payload.sources){
        await c.query(
          "INSERT INTO cms_public_dependencies(submission_id,version,resource_kind,resource_id) VALUES($1,$2,'source',$3)",
          [id,expectedRevision,sourceId]);
      }
      if(typeof safe.coverMediaId==="string"){
        await c.query(
          "INSERT INTO cms_public_dependencies(submission_id,version,resource_kind,resource_id) VALUES($1,$2,'media',$3)",
          [id,expectedRevision,safe.coverMediaId]);
      }
      await c.query("DELETE FROM published_route_bindings WHERE submission_id=$1",[id]);
      for(const route of checked.destinations)
        await c.query("INSERT INTO published_route_bindings(submission_id,public_path) VALUES($1,$2)",[id,route]);
      const rightsRefs=[authorization.sourceRightsRef,authorization.mediaRightsRef].filter(Boolean);
      for(const rightsRef of new Set(rightsRefs))
        await c.query("INSERT INTO content_rights_audit(submission_id,evidence_ref,evidence_type,verification_actor) VALUES($1,$2,$3,$4)",
          [id,rightsRef,rightsRef===authorization.mediaRightsRef?"image":"source",authorization.reviewer]);
      await c.query("UPDATE content_submissions SET state='published',quarantine_reasons='[]'::jsonb,updated_at=now() WHERE id=$1",[id]);
      const routes=[...new Set([...prior,...checked.destinations])];
      const event=(await c.query<Outbox>(
        "INSERT INTO cms_delivery_outbox(submission_id,revision_no,event_kind,routes) VALUES($1,$2,'published',$3::jsonb) RETURNING *",
        [id,expectedRevision,JSON.stringify(routes)])).rows[0];
      return {id,state:"published",version:expectedRevision,eventId:event.id,replay:false,routes};
    });
  }
  async withdraw(id:string,expectedRevision:number){
    return tx(this.pool,async c=>{
      const row=await locked(c,id);
      if(row.revision_no!==expectedRevision)throw Error("revision_conflict");
      if(row.state==="withdrawn")return {id,state:"withdrawn",replay:true};
      const routes=(await c.query<{public_path:string}>("SELECT public_path FROM published_route_bindings WHERE submission_id=$1",[id]))
        .rows.map(x=>x.public_path);
      const next=expectedRevision+1;
      await c.query("UPDATE content_submissions SET state='withdrawn',revision_no=$2,updated_at=now() WHERE id=$1",[id,next]);
      await c.query("DELETE FROM published_route_bindings WHERE submission_id=$1",[id]);
      const event=(await c.query<Outbox>(
        "INSERT INTO cms_delivery_outbox(submission_id,revision_no,event_kind,routes) VALUES($1,$2,'withdrawn',$3::jsonb) RETURNING *",
        [id,next,JSON.stringify(routes)])).rows[0];
      return {id,state:"withdrawn",version:next,eventId:event.id,replay:false,routes};
    });
  }
  async pendingOutbox(limit=20):Promise<Outbox[]>{
    if(!Number.isInteger(limit)||limit<1||limit>100)throw Error("invalid_outbox_limit");
    return (await this.pool.query<Outbox>(
      "SELECT id,submission_id,revision_no,event_kind,routes FROM cms_delivery_outbox WHERE status='pending' ORDER BY created_at,id LIMIT $1",[limit])).rows;
  }
  async markDelivered(eventId:string){
    checkId(eventId);
    const r=await this.pool.query("UPDATE cms_delivery_outbox SET status='delivered',delivered_at=now() WHERE id=$1 AND status='pending'",[eventId]);
    return (r.rowCount??0)>0;
  }
}
