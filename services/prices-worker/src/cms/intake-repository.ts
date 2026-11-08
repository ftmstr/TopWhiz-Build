/**
 * Inject into private-intake handler with a dedicated tw_cms_intake DB user.
 * The role can EXECUTE only cms_ingest_draft, not inspect other drafts or
 * insert approval/review/published records.
 */
import type {Pool} from "pg";
interface Draft {type:"news"|"phone";slug:string;[key:string]:unknown}
export class CmsIntakeRepository{
  constructor(private readonly pool:Pool){}
  async submit(externalKey:string,payload:Draft){
    if(!payload||!["news","phone"].includes(payload.type)||
       typeof payload.slug!=="string")throw Error("invalid_draft");
    const raw=JSON.stringify(payload);
    if(raw.length>65536)throw Error("invalid_draft_size");
    const {rows}=await this.pool.query<{
      id:string;revision_no:number;state:string;replay:boolean
    }>(
      "SELECT * FROM cms_ingest_draft($1::varchar,$2::varchar,$3::varchar,$4::jsonb)",
      [externalKey,payload.type,payload.slug,raw]);
    if(rows.length!==1)throw Error("draft_insert_failed");
    return {id:rows[0].id,revision:rows[0].revision_no,
      state:rows[0].state,replay:rows[0].replay};
  }
}
