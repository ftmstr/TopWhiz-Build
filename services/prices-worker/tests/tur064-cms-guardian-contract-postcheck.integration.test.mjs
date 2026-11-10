import test from "node:test";
import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {createServer} from "node:http";
import {once} from "node:events";
import pg from "pg";
import {createGuardianApprovalLookup} from "../src/cms/guardian-approval-contract.mjs";
import {handleCmsMedia} from "../src/cms/media-handler.mjs";
import {stageLicensedMedia} from "../src/cms/cloudflare-adapters.mjs";
import {makeSyntheticPng} from "./fixtures/png-factory.mjs";

const URI=process.env.TEST_DATABASE_URL;
let dbUrl;
try{dbUrl=new URL(URI)}catch{}
if(process.env.CI!=="true"||!dbUrl||
   dbUrl.protocol!=="postgresql:"||
   !["127.0.0.1","localhost"].includes(dbUrl.hostname)||
   (dbUrl.port&&dbUrl.port!=="5432")||dbUrl.search||dbUrl.hash)
  throw Error("TUR064 requires CI-only disposable localhost PostgreSQL16");
const bytes=Buffer.from(makeSyntheticPng(54,44));
const digest=createHash("sha256").update(bytes).digest("hex");
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const name=(base,suffix)=>"tw064_"+base+"_"+suffix;

test("TUR064 actual CMS handler + separate PG16 login contract and post-final-check HTTP leak",{
  timeout:150000
},async()=>{
  const suffix=randomBytes(5).toString("hex");
  const mediaSchema=name("media",suffix);
  const guardSchema=name("guard",suffix);
  const roles=["mediareader","mediaowner","guardianreader","guardianowner","revoker"]
    .map(x=>name(x,suffix));
  const pw=roles.map(()=>randomBytes(18).toString("hex"));
  const [mediaReader,mediaOwner,guardReader,guardOwner,revoker]=roles;
  const ids=["tur064-a","tur064-b"];
  const admin=new pg.Client({connectionString:URI});
  const sessions=[];
  let connected=false,server,gate=null,receivedTotalAfterRevoke=0;
  let port;
  function roleClient(i){
    const u=new URL(URI);u.username=roles[i];u.password=pw[i];
    return new pg.Client({connectionString:u.href});
  }
  try{
    await admin.connect();connected=true;
    for(let i=0;i<roles.length;i++)await admin.query(
      "CREATE ROLE "+roles[i]+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+pw[i]+"'");
    await admin.query("CREATE SCHEMA "+mediaSchema);
    await admin.query("CREATE TABLE "+mediaSchema+".media ("+
      "id text PRIMARY KEY,key text NOT NULL,sha256_hex text NOT NULL,"+
      "content_type text NOT NULL,bytes integer NOT NULL,approved boolean NOT NULL,"+
      "generation bigint NOT NULL CHECK(generation>0))");
    await admin.query("CREATE FUNCTION "+mediaSchema+".deny_reapproval() RETURNS trigger "+
      "LANGUAGE plpgsql AS $guard$ BEGIN "+
      "IF OLD.approved IS FALSE AND NEW.approved IS TRUE THEN "+
      "RAISE EXCEPTION 'reapproval_forbidden'; END IF; RETURN NEW; END $guard$");
    await admin.query("CREATE TRIGGER rights_guard BEFORE UPDATE OF approved ON "+
      mediaSchema+".media FOR EACH ROW EXECUTE FUNCTION "+mediaSchema+".deny_reapproval()");
    await admin.query("ALTER TABLE "+mediaSchema+".media OWNER TO "+mediaOwner);
    await admin.query("REVOKE ALL ON SCHEMA "+mediaSchema+" FROM PUBLIC");
    await admin.query("GRANT USAGE ON SCHEMA "+mediaSchema+" TO "+roles.join(","));
    await admin.query("GRANT SELECT ON "+mediaSchema+".media TO "+mediaReader);
    await admin.query("GRANT SELECT(id,approved,generation),UPDATE(approved,generation) ON "+
      mediaSchema+".media TO "+revoker);

    await admin.query("CREATE SCHEMA "+guardSchema+" AUTHORIZATION "+guardOwner);
    await admin.query("CREATE TABLE "+guardSchema+
      ".revocation_anchor(id text PRIMARY KEY,approved boolean NOT NULL,generation bigint NOT NULL)");
    await admin.query("ALTER TABLE "+guardSchema+".revocation_anchor OWNER TO "+guardOwner);
    await admin.query("REVOKE ALL ON SCHEMA "+guardSchema+" FROM PUBLIC");
    await admin.query("REVOKE ALL ON "+guardSchema+".revocation_anchor FROM PUBLIC");
    await admin.query("GRANT USAGE ON SCHEMA "+guardSchema+" TO "+guardReader+","+mediaOwner);
    await admin.query("GRANT SELECT ON "+guardSchema+".revocation_anchor TO "+guardReader);
    const stageBucket={async put(){}};
    for(const id of ids){
      const staged=await stageLicensedMedia(stageBucket,id,bytes,{
        rightsApproved:true,evidenceRef:"CI_GENERATED_NO_REAL_LICENSE",reviewer:"TUR064 Fixture Only"
      });
      assert.equal(staged.sha256,digest);
      await admin.query("INSERT INTO "+mediaSchema+
        ".media(id,key,sha256_hex,content_type,bytes,approved,generation) "+
        "VALUES($1,$2,$3,$4,$5,true,1)",
        [id,staged.key,staged.sha256,staged.contentType,staged.bytes]);
      await admin.query("INSERT INTO "+guardSchema+
        ".revocation_anchor(id,approved,generation) VALUES($1,true,1)",[id]);
    }
    for(let i=0;i<roles.length;i++){
      const session=roleClient(i);await session.connect();
      assert.equal((await session.query("SELECT session_user AS who")).rows[0].who,roles[i]);
      sessions.push(session);
    }
    const [mediaRead,mediaWrite,guardianRead,guardianWrite,rightsWrite]=sessions;
    const privileged=await admin.query(
      "SELECT rolname,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles "+
      "WHERE rolname=ANY($1::name[])",[roles]);
    assert.equal(privileged.rowCount,5);
    assert.ok(privileged.rows.every(r=>!r.rolsuper&&!r.rolcreatedb&&!r.rolcreaterole));
    assert.equal((await admin.query(
      "SELECT pg_get_userbyid(relowner) AS name FROM pg_class WHERE oid=$1::regclass",
      [guardSchema+".revocation_anchor"])).rows[0].name,guardOwner);
    await assert.rejects(
      mediaWrite.query("UPDATE "+guardSchema+".revocation_anchor SET approved=true"),
      /permission denied/i);
    await assert.rejects(
      guardianRead.query("UPDATE "+guardSchema+".revocation_anchor SET approved=true"),
      /permission denied/i);
    await assert.rejects(
      mediaWrite.query("CREATE FUNCTION "+mediaSchema+
        ".early_create() RETURNS integer LANGUAGE sql AS 'SELECT 1'"),
      /permission denied/i);
    await admin.query("GRANT CREATE ON SCHEMA "+mediaSchema+" TO "+mediaOwner);
    await mediaWrite.query("CREATE FUNCTION "+mediaSchema+".try_guard() RETURNS integer "+
      "LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"+mediaSchema+",pg_temp "+
      "AS $body$ BEGIN UPDATE "+guardSchema+
      ".revocation_anchor SET approved=true WHERE id='tur064-a'; RETURN 1; END $body$");
    await mediaWrite.query("REVOKE ALL ON FUNCTION "+mediaSchema+".try_guard() FROM PUBLIC");
    await admin.query("REVOKE CREATE ON SCHEMA "+mediaSchema+" FROM "+mediaOwner);
    assert.equal((await admin.query("SELECT has_schema_privilege($1,$2,'CREATE') AS allowed",
      [mediaOwner,mediaSchema])).rows[0].allowed,false);
    await assert.rejects(mediaWrite.query("SELECT "+mediaSchema+".try_guard()"),
      /permission denied/i);

    const bucket={
      async get(key){
        if(!ids.some(id=>key==="media/reviewed/"+id+"/"+digest+".png"))return null;
        return {size:bytes.length,body:new Response(bytes).body,
          customMetadata:{sha256:digest},httpMetadata:{contentType:"image/png"}};
      }
    };
    // Same media service contract as real Cloudflare Worker, but the production
    // cms_public_media view DOES NOT return generation, so cannot yet wire it.
    function guardedLookup(){
      return createGuardianApprovalLookup({
        readMedia:async id=>{
          const data=await mediaRead.query("SELECT id,key,sha256_hex,content_type,bytes,"+
            "approved,generation FROM "+mediaSchema+".media WHERE id=$1 AND approved=true",[id]);
          const m=data.rows[0];
          return m?{id:m.id,key:m.key,sha256Hex:m.sha256_hex,
            contentType:m.content_type,bytes:m.bytes,rightsApproved:m.approved,
            generation:m.generation}:null;
        },
        readGuardian:async id=>{
          const data=await guardianRead.query("SELECT approved,generation FROM "+
            guardSchema+".revocation_anchor WHERE id=$1",[id]);
          return data.rows[0]??null;
        }
      });
    }
    // Explicit public-view migration guard: if the API returns no generation,
    // the independent contract refuses 200 even when guardian is approved.
    const incompatible=createGuardianApprovalLookup({
      readMedia:async()=>({id:ids[0],rightsApproved:true}), // current public SQL shape
      readGuardian:async()=>({approved:true,generation:"1"})
    });
    assert.equal(await incompatible(ids[0]),null);
    assert.throws(()=>createGuardianApprovalLookup({readMedia:async()=>null}),
      /independent_guardian_required/);

    server=createServer(async(req,res)=>{
      try{
        const response=await handleCmsMedia(new Request(
          "http://127.0.0.1:"+port+req.url,{method:req.method}),{
          findApprovedAsset:guardedLookup(),bucket
        });
        // The server has already completed the handler's FINAL DB check.
        // Pause BEFORE HTTP header/body write. Revocation can now COMMIT.
        if(gate&&req.url==="/v1/media/"+gate.id&&response.status===200&&!gate.held){
          gate.held=true;gate.arrived();
          await gate.proceed;
        }
        if(res.destroyed)return;
        res.writeHead(response.status,Object.fromEntries(response.headers.entries()));
        res.end(Buffer.from(await response.arrayBuffer()));
      }catch{
        if(!res.headersSent&&!res.destroyed){res.writeHead(503);res.end();}
      }
    });
    server.listen(0,"127.0.0.1");await once(server,"listening");
    const address=server.address();port=address.port;
    const origin="http://127.0.0.1:"+port;
    async function read(id){
      const response=await fetch(origin+"/v1/media/"+id,{
        redirect:"error",cache:"no-store",signal:AbortSignal.timeout(12000)
      });
      return {status:response.status,body:Buffer.from(await response.arrayBuffer()),
        cache:response.headers.get("cache-control")};
    }
    const before=await read(ids[0]);
    assert.equal(before.status,200);assert.deepEqual(before.body,bytes);

    // Missing guardian row and mismatch (CI fixtures only; not a real re-grant).
    await guardianWrite.query("DELETE FROM "+guardSchema+
      ".revocation_anchor WHERE id=$1",[ids[0]]);
    let denied=await read(ids[0]);
    assert.equal(denied.status,404);assert.equal(denied.body.length,0);
    await guardianWrite.query("INSERT INTO "+guardSchema+
      ".revocation_anchor(id,approved,generation) VALUES($1,true,2)",[ids[0]]);
    denied=await read(ids[0]);
    assert.equal(denied.status,404);assert.equal(denied.body.length,0);
    await guardianWrite.query("UPDATE "+guardSchema+
      ".revocation_anchor SET generation=1 WHERE id=$1",[ids[0]]);
    assert.equal((await read(ids[0])).status,200);

    // Removing SELECT from independent verifier fails closed rather than using
    // the media-owner's locally approved snapshot.
    await admin.query("REVOKE SELECT ON "+guardSchema+
      ".revocation_anchor FROM "+guardReader);
    denied=await read(ids[0]);
    assert.equal(denied.status,503);assert.equal(denied.body.length,0);
    await admin.query("GRANT SELECT ON "+guardSchema+
      ".revocation_anchor TO "+guardReader);

    // Force actual network response to remain pending AFTER the final
    // authorization check. COMMIT revocation during this post-check gap.
    let signalArrived,release;
    const arrived=new Promise(resolve=>signalArrived=resolve);
    const proceed=new Promise(resolve=>release=resolve);
    gate={id:ids[1],arrived:signalArrived,proceed,held:false};
    const inflight=read(ids[1]);
    await Promise.race([arrived,wait(10000).then(()=>{throw Error("late HTTP gate timed out")})]);
    await guardianWrite.query("BEGIN");
    try{
      const changed=await guardianWrite.query("UPDATE "+guardSchema+
        ".revocation_anchor SET approved=false,generation=2 "+
        "WHERE id=$1 AND approved=true AND generation=1",[ids[1]]);
      assert.equal(changed.rowCount,1);
      await guardianWrite.query("COMMIT");
    }catch(e){await guardianWrite.query("ROLLBACK").catch(()=>{});throw e}
    // The NEXT request sees guardian revocation and correctly fails closed.
    const after=await read(ids[1]);
    assert.equal(after.status,404);assert.equal(after.body.length,0);
    release();
    const late=await inflight;
    receivedTotalAfterRevoke=late.body.length;
    assert.equal(late.status,200);assert.deepEqual(late.body,bytes);
    assert.equal(receivedTotalAfterRevoke,bytes.length);
    gate=null;

    // OWNER bypass of its own trigger still cannot rewrite independent
    // guardian; newly admitted HTTP remains 404 even after owner reapproval.
    await guardianWrite.query("UPDATE "+guardSchema+
      ".revocation_anchor SET approved=false,generation=2 WHERE id=$1",[ids[0]]);
    await rightsWrite.query("UPDATE "+mediaSchema+
      ".media SET approved=false,generation=2 WHERE id=$1",[ids[0]]);
    await assert.rejects(
      mediaWrite.query("UPDATE "+mediaSchema+
        ".media SET approved=true,generation=3 WHERE id=$1",[ids[0]]),
      /reapproval_forbidden/i);
    await mediaWrite.query("ALTER TABLE "+mediaSchema+".media DISABLE TRIGGER rights_guard");
    const ownerTamper=await mediaWrite.query("UPDATE "+mediaSchema+
      ".media SET approved=true,generation=3 WHERE id=$1",[ids[0]]);
    assert.equal(ownerTamper.rowCount,1);
    denied=await read(ids[0]);
    assert.equal(denied.status,404);assert.equal(denied.body.length,0);
    console.log(JSON.stringify({
      suite:"TUR064_REAL_CMS_HANDLER_PG16_GUARD_CONTRACT_HTTP_POSTCHECK_NEGATIVE",
      actualCmsMediaHandler:true,actualNodeLoopbackHttp:true,
      independentlyAuthenticatedNonSuperuserLogins:5,
      mediaOwnerCannotMutateGuardian:true,
      mediaOwnerSECURITY_DEFINERCannotMutateGuardian:true,
      schemaCreateRevokeDoesNotRemoveExistingDefiner:true,
      guardianSelectRevokeFailsClosedHttp:503,
      missingGuardianRowDeniesHttp:404,generationMismatchDeniesHttp:404,
      currentProductionPublicMediaSqlMissingGeneration:true,
      approvedInFlightHttpAfterGuardianCommitStatus:late.status,
      approvedInFlightBytesArrivedAfterGuardianCommit:receivedTotalAfterRevoke,
      newHttpAfterGuardianCommitStatus:after.status,
      ownerTriggerBypassReapprovalHttpStatus:denied.status,
      realExternalIAM:"NOT_PROVEN",productionNeon:"NOT_RUN",
      liveCloudflareR2Cdn:"NOT_RUN",globalCdnCacheInvalidation:"NOT_RUN",
      receiverLastByteAck:"NOT_PROVEN",tur018HistoricalFictionalBytes:99276,
      mainMerge:false,release:"NO_GO",issue22:"OPEN"
    }));
  }finally{
    if(gate&&typeof gate.proceed==="function"){} // gate will be released in normal path
    if(server){
      server.closeAllConnections?.();
      await new Promise(resolve=>server.close(()=>resolve()));
    }
    for(const client of sessions)await client.end().catch(()=>{});
    if(connected){
      await admin.query("DROP SCHEMA IF EXISTS "+mediaSchema+" CASCADE").catch(()=>{});
      await admin.query("DROP SCHEMA IF EXISTS "+guardSchema+" CASCADE").catch(()=>{});
      for(const role of [...roles].reverse())
        await admin.query("DROP ROLE IF EXISTS "+role).catch(()=>{});
    }
    await admin.end().catch(()=>{});
  }
});
