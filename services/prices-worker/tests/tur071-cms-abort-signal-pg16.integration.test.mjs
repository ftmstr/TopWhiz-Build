import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {randomBytes,createHash} from 'node:crypto';
import pg from 'pg';
import {handleCmsMedia} from '../src/cms/media-handler.mjs';
import {createGuardianApprovalLookup} from '../src/cms/guardian-approval-contract.mjs';
import {stageLicensedMedia} from '../src/cms/cloudflare-adapters.mjs';
import {makeSyntheticPng} from './fixtures/png-factory.mjs';

/**
 * TUR071: the OPT-IN abortSignal of the original CMS handler is connected to
 * a REAL physical Node TCP close before response headers. The pending original
 * R2-like stream's second pull must be cancelled, not consumed as in TUR068.
 * Four independent PG16 LOGINs guard a real COMMIT. Original TUR068 without
 * abortSignal remains a separate negative regression. Not live R2 or CDN.
 */
const URI=process.env.TEST_DATABASE_URL;
let db;
try{db=new URL(URI)}catch{}
if(process.env.CI!=='true'||!db||db.protocol!=='postgresql:'||
  !['127.0.0.1','localhost'].includes(db.hostname)||
  (db.port&&db.port!=='5432')||db.search||db.hash)
  throw Error('TUR071 requires disposable PostgreSQL16 localhost CI only');

function deferred(){
  let resolve,reject;
  const promise=new Promise((ok,no)=>{resolve=ok;reject=no});
  return {promise,resolve,reject};
}
function timed(p,label,ms=12000){
  return Promise.race([p,new Promise((_,reject)=>{
    const handle=setTimeout(()=>reject(Error(label+' timed out')),ms);
    p.finally(()=>clearTimeout(handle)).catch(()=>{});
  })]);
}
const bytes=Buffer.from(makeSyntheticPng(54,44));
const digest=createHash('sha256').update(bytes).digest('hex');

test('TUR071 original CMS handler: socket abort does not cancel in-flight R2 verification; independent PG16 revoke COMMIT still governs fresh requests',{
  timeout:100000
},async()=>{
  const suffix=randomBytes(5).toString('hex');
  const m='tw071_media_'+suffix, g='tw071_guard_'+suffix;
  const roles=['mediareader','mediaowner','guardreader','guardowner'].map(s=>'tw071_'+s+'_'+suffix);
  const pass=roles.map(()=>randomBytes(18).toString('hex'));
  const id='tur071-media';
  const admin=new pg.Client({connectionString:URI}), sessions=[];
  let connected=false,server,port;
  const startStall=deferred(),resClosed=deferred(),handlerEnded=deferred(),releaseBody=deferred();
  const aborter=new AbortController();
  let slowMode=false,streamCancel=0,streamFinished=0,bytesReadFromBucket=0;
  let clientBytes=0,respFinish=0,handlerStatus,closeBeforeFinish=false,closedSeen=false;
  let finalRightsReadAfterAbort=false,authReads=0;
  let client;
  try{
    await admin.connect();connected=true;
    for(let i=0;i<roles.length;i++)
      await admin.query('CREATE ROLE '+roles[i]+
        " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+pass[i]+"'");
    await admin.query('CREATE SCHEMA '+m);
    await admin.query('CREATE TABLE '+m+'.media (id text PRIMARY KEY,key text NOT NULL,'+
      'sha256_hex text NOT NULL,content_type text NOT NULL,bytes integer NOT NULL,'+
      'approved boolean NOT NULL,generation bigint NOT NULL)');
    await admin.query('ALTER TABLE '+m+'.media OWNER TO '+roles[1]);
    await admin.query('REVOKE ALL ON SCHEMA '+m+' FROM PUBLIC');
    await admin.query('GRANT USAGE ON SCHEMA '+m+' TO '+roles[0]);
    await admin.query('GRANT SELECT ON '+m+'.media TO '+roles[0]);
    await admin.query('CREATE SCHEMA '+g+' AUTHORIZATION '+roles[3]);
    await admin.query('CREATE TABLE '+g+'.anchor '+
      '(id text PRIMARY KEY,approved boolean NOT NULL,generation bigint NOT NULL)');
    await admin.query('ALTER TABLE '+g+'.anchor OWNER TO '+roles[3]);
    await admin.query('REVOKE ALL ON SCHEMA '+g+' FROM PUBLIC');
    await admin.query('REVOKE ALL ON '+g+'.anchor FROM PUBLIC');
    await admin.query('GRANT USAGE ON SCHEMA '+g+' TO '+roles[2]);
    await admin.query('GRANT SELECT ON '+g+'.anchor TO '+roles[2]);
    const fixture=await stageLicensedMedia({async put(){}},id,bytes,{
      rightsApproved:true,evidenceRef:'CI_ORIGINAL_SYNTHETIC_FIXTURE',
      reviewer:'TUR071 Synthetic Reviewer'
    });
    assert.equal(fixture.sha256,digest);
    await admin.query('INSERT INTO '+m+'.media '+
      '(id,key,sha256_hex,content_type,bytes,approved,generation) '+
      'VALUES($1,$2,$3,$4,$5,true,1)',
      [id,fixture.key,fixture.sha256,fixture.contentType,fixture.bytes]);
    await admin.query('INSERT INTO '+g+'.anchor VALUES($1,true,1)',[id]);
    for(let i=0;i<roles.length;i++){
      const url=new URL(URI);url.username=roles[i];url.password=pass[i];
      const c=new pg.Client({connectionString:url.href});await c.connect();sessions.push(c);
      assert.equal((await c.query('SELECT session_user AS actor')).rows[0].actor,roles[i]);
      assert.equal((await c.query('SELECT rolsuper FROM pg_roles WHERE rolname=session_user')).rows[0].rolsuper,false);
    }
    const [mediaReader,mediaOwner,guardianReader,guardianOwner]=sessions;
    await assert.rejects(mediaOwner.query('UPDATE '+g+'.anchor SET approved=true WHERE id=$1',[id]),
      /permission denied/i);
    await assert.rejects(guardianReader.query('UPDATE '+g+'.anchor SET approved=true WHERE id=$1',[id]),
      /permission denied/i);
    const readMedia=async target=>{
      const result=await mediaReader.query(
        'SELECT id,key,sha256_hex,content_type,bytes,approved,generation '+
        'FROM '+m+'.media WHERE id=$1 AND approved=true',[target]);
      const row=result.rows[0];
      return row?{id:row.id,key:row.key,sha256Hex:row.sha256_hex,
        contentType:row.content_type,bytes:row.bytes,rightsApproved:row.approved,
        generation:row.generation}:null;
    };
    const readGuardian=async target=>{
      authReads++;
      if(closedSeen)finalRightsReadAfterAbort=true;
      const result=await guardianReader.query(
        'SELECT approved,generation FROM '+g+'.anchor WHERE id=$1',[target]);
      return result.rows[0]??null;
    };
    const bucket={
      async get(key){
        if(key!==fixture.key)return null;
        if(!slowMode){
          return {size:bytes.length,body:new Response(bytes).body,
            customMetadata:{sha256:digest},httpMetadata:{contentType:'image/png'}};
        }
        const chunk=bytes.subarray(0,Math.floor(bytes.length/2));
        return {size:bytes.length,body:new ReadableStream({
          start(controller){
            controller.enqueue(chunk);bytesReadFromBucket+=chunk.byteLength;
            startStall.resolve();
          },
          async pull(controller){
            await releaseBody.promise;
            if(aborter.signal.aborted)return; // cancellation may occur inside blocked pull
            const tail=bytes.subarray(chunk.byteLength);
            controller.enqueue(tail);
            bytesReadFromBucket+=tail.byteLength;
            controller.close();streamFinished++;
          },
          cancel(){streamCancel++}
        }),customMetadata:{sha256:digest},httpMetadata:{contentType:'image/png'}};
      }
    };
    server=http.createServer(async(req,res)=>{
      res.once('finish',()=>{respFinish++});
      res.once('close',()=>{
        if(!res.writableFinished){
          closedSeen=true;closeBeforeFinish=true;aborter.abort('http_consumer_disconnected');resClosed.resolve();
        }
      });
      try{
        const r=await handleCmsMedia(
          new Request('http://127.0.0.1:'+port+req.url,{method:req.method}),{
            findApprovedAsset:createGuardianApprovalLookup({readMedia,readGuardian}),bucket,
            ...(slowMode?{abortSignal:aborter.signal}:{})
          });
        handlerStatus=r.status;
        if(!res.destroyed){
          res.writeHead(r.status,Object.fromEntries(r.headers.entries()));
          res.end(Buffer.from(await r.arrayBuffer()));
        }
      }catch{
        handlerStatus=503;
        if(!res.destroyed&&!res.headersSent){res.writeHead(503);res.end()}
      }finally{if(slowMode)handlerEnded.resolve()}
    });
    server.listen(0,'127.0.0.1');await once(server,'listening');
    port=server.address().port;
    const origin='http://127.0.0.1:'+port+'/v1/media/'+id;
    const before=await fetch(origin,{signal:AbortSignal.timeout(10000)});
    assert.equal(before.status,200);
    assert.deepEqual(Buffer.from(await before.arrayBuffer()),bytes);
    assert.equal(respFinish,1);
    slowMode=true;
    handlerStatus=undefined;
    // Test-only Node HTTP adapter bridges physical connection loss to the
    // handler's explicit abortSignal. Production Worker does not wire this.
    client=http.get({hostname:'127.0.0.1',port,path:'/v1/media/'+id},res=>{
      res.on('data',x=>{clientBytes+=x.length});
      res.resume();
    });
    client.on('error',()=>{}); // ECONNRESET is expected after deliberate abort
    await timed(startStall.promise,'R2 stream gate');
    client.destroy();
    await timed(resClosed.promise,'server observed physical client close');
    assert.equal(closeBeforeFinish,true);
    assert.equal(clientBytes,0);
    await timed(handlerEnded.promise,'abort must resolve handler before stalled body releases');
    assert.equal(handlerStatus,503,'aborted handler denies without delivering body');
    assert.equal(streamCancel,1,'abort must actively cancel upstream ReadableStream');
    await guardianOwner.query('BEGIN');
    try{
      const updated=await guardianOwner.query('UPDATE '+g+
        '.anchor SET approved=false,generation=2 WHERE id=$1 AND approved=true AND generation=1',[id]);
      assert.equal(updated.rowCount,1);
      await guardianOwner.query('COMMIT');
    }catch(e){await guardianOwner.query('ROLLBACK').catch(()=>{});throw e}
    const durable=(await guardianReader.query('SELECT approved,generation FROM '+g+
      '.anchor WHERE id=$1',[id])).rows[0];
    assert.deepEqual(durable,{approved:false,generation:'2'});
    // The committed guardian denial is independent of whether the client read
    // any bytes or a server-side ACK was ever possible.
    // Only after the handler has finished due to abort do we release the
    // blocked synthetic R2-like source. The body must not be read to EOF.
    releaseBody.resolve();
    await Promise.resolve();
    assert.equal(streamFinished,0);
    assert.equal(bytesReadFromBucket,Math.floor(bytes.length/2),
      'upstream was cancelled before second half; TUR068 used to consume all');
    assert.equal(streamCancel,1);
    assert.equal(finalRightsReadAfterAbort,false,
      'abort should prevent final guardian SQL handoff after disconnect');
    assert.equal(handlerStatus,503);
    assert.equal(clientBytes,0);
    assert.equal(respFinish,1,'only pre-abort baseline response finished');
    slowMode=false;
    const fresh=await fetch(origin,{signal:AbortSignal.timeout(10000)});
    assert.equal(fresh.status,404);
    assert.equal((await fresh.arrayBuffer()).byteLength,0);
    assert.equal(fresh.headers.get('cache-control'),'no-store');
    // A local response finish is NOT a separately verified receiver ACK.
    // There is no receiver ACK operation in this runtime contract.
    console.log(JSON.stringify({
      suite:'TUR071_REAL_CMS_PG16_SOCKET_ABORT_UPSTREAM_CANCELLED',
      actualCmsMediaHandler:true,actualLocalNodeTcp:true,
      independentPasswordLogins:4,independentGuardianOwner:true,
      originalFictionalPngSha256:digest,
      baselineHttpStatus:200,physicalClientDisconnectBeforeHeaders:true,
      originalHandlerFinalGuardianReadAfterDisconnect:false,
      originalHandlerStatusOnAbort:handlerStatus,
      fictionalUpstreamBytesReadBeforeCancel:bytesReadFromBucket,
      baselineTUR068UpstreamBytesWithoutSignal:bytes.length,
      upstreamReadableStreamCancelCount:streamCancel,
      explicitNodeTransportAbortBridge:true,
      productionAbortBridge:'NOT_WIRED',
      actualSocketDeliveredBytesOnAbortedRequest:clientBytes,
      newRequestAfterCommitStatus:fresh.status,
      guardianCommitAck:'ACKNOWLEDGED_LOCAL_PG16',
      transportCutUnknownCommit:'INHERITED_TUR030_NOT_THIS_TEST',
      queueOutboxShaAndLease:'INHERITED_CI',
      receiverAck:'NOT_IMPLEMENTED_OR_PROVEN',
      liveR2Cdn:'NOT_RUN',externalIAM:'NOT_PROVEN',
      finalByteGlobalZeroLeak:'NOT_PROVEN',
      issue22:'OPEN',release:'NO_GO'
    }));
  }finally{
    releaseBody.resolve();
    if(client)client.destroy();
    if(server){
      server.closeAllConnections?.();
      await new Promise(resolve=>server.close(resolve));
    }
    for(const s of sessions)await s.end().catch(()=>{});
    if(connected){
      await admin.query('DROP SCHEMA IF EXISTS '+m+' CASCADE').catch(()=>{});
      await admin.query('DROP SCHEMA IF EXISTS '+g+' CASCADE').catch(()=>{});
      for(const role of [...roles].reverse())
        await admin.query('DROP ROLE IF EXISTS '+role).catch(()=>{});
    }
    await admin.end().catch(()=>{});
  }
});
