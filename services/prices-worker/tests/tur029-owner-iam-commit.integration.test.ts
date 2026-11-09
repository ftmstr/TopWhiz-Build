import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

// Real disposable PG16. No production access or claim of independent IAM enforcement.
const URI = process.env.TEST_DATABASE_URL;
if (!URI || !/127\.0\.0\.1|localhost/.test(new URL(URI).hostname)) throw Error('TUR029 requires explicit LOCAL disposable TEST_DATABASE_URL');
test('TUR029 PG16: separate owner, rights-admin and runtime logins; owner bypass and COMMIT uncertainty', async () => {
 const suffix=randomBytes(5).toString('hex');
 const schema='tw029_'+suffix;
 const admin=new pg.Client({connectionString:URI}); await admin.connect();
 const names=['owner','rights','runtime','outsider'].map(x=>'tw029_'+x+'_'+suffix);
 const passwords=names.map(()=>randomBytes(18).toString('hex'));
 const login=async(i:number)=>{const u=new URL(URI!);u.username=names[i];u.password=passwords[i];const c=new pg.Client({connectionString:u.toString()});await c.connect();assert.equal((await c.query('SELECT session_user AS u')).rows[0].u,names[i]);return c;};
 let owner:pg.Client|undefined,rights:pg.Client|undefined,runtime:pg.Client|undefined,outsider:pg.Client|undefined;
 try {
  for(let i=0;i<names.length;i++)await admin.query('CREATE ROLE '+names[i]+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD $1'.replace('$1',"'"+passwords[i]+"'"));
  await admin.query('CREATE SCHEMA '+schema+' AUTHORIZATION '+names[0]);
  owner=await login(0);rights=await login(1);runtime=await login(2);outsider=await login(3);
  await owner.query('CREATE TABLE '+schema+'.rights (id int PRIMARY KEY, approved boolean NOT NULL, generation bigint NOT NULL)');
  await owner.query('INSERT INTO '+schema+'.rights VALUES (1,true,1)');
  await owner.query('REVOKE ALL ON SCHEMA '+schema+' FROM PUBLIC');
  await owner.query('GRANT USAGE ON SCHEMA '+schema+' TO '+names[1]+','+names[2]);
  await owner.query('GRANT SELECT ON '+schema+'.rights TO '+names[1]+','+names[2]);
  await owner.query('GRANT UPDATE(approved,generation) ON '+schema+'.rights TO '+names[1]);
  await assert.rejects(runtime.query('UPDATE '+schema+'.rights SET approved=false WHERE id=1'),/permission denied/);
  await assert.rejects(outsider.query('SELECT * FROM '+schema+'.rights'),/permission denied/);
  await assert.rejects(runtime.query('CREATE TABLE '+schema+'.evil (x int)'),/permission denied/);
  await admin.query('GRANT CREATE ON SCHEMA '+schema+' TO '+names[3]);
  await outsider.query('CREATE TABLE '+schema+'.evil (x int)');
  await admin.query('REVOKE CREATE ON SCHEMA '+schema+' FROM '+names[3]);
  // Revoking CREATE does not delete an object already created under drift.
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname='evil'",[schema])).rows[0].n,1);
  await owner.query('DROP TABLE '+schema+'.evil');
  // Out-of-band schema-owner writes bypass application rights-admin policy.
  await owner.query('UPDATE '+schema+'.rights SET approved=false WHERE id=1');
  assert.equal((await runtime.query('SELECT approved,generation FROM '+schema+'.rights WHERE id=1')).rows[0].approved,false);
  await owner.query('UPDATE '+schema+'.rights SET approved=true WHERE id=1');
  // COMMIT response deliberately discarded AFTER real server COMMIT; reconnect and reconcile.
  await rights.query('BEGIN');
  await rights.query('UPDATE '+schema+'.rights SET approved=false,generation=generation+1 WHERE id=1');
  await rights.query('COMMIT');
  await rights.end();rights=undefined;
  const reconnect=await login(1);
  try{const state=(await reconnect.query('SELECT approved,generation FROM '+schema+'.rights WHERE id=1')).rows[0];assert.deepEqual(state,{approved:false,generation:'2'});}
  finally{await reconnect.end();}
  // Rollback leaves no durable generation bump; simulated process restart.
  await owner.query('UPDATE '+schema+'.rights SET approved=true WHERE id=1');
  const retry=await login(1);
  await retry.query('BEGIN');await retry.query('UPDATE '+schema+'.rights SET approved=false,generation=generation+1 WHERE id=1');await retry.query('ROLLBACK');await retry.end();
  assert.deepEqual((await runtime.query('SELECT approved,generation FROM '+schema+'.rights WHERE id=1')).rows[0],{approved:true,generation:'2'});
  console.log(JSON.stringify({suite:'TUR029_REAL_PG16_OWNER_IAM_NEGATIVE',independentLogins:4,ownerBypass:true,createAclDrift:true,commitAckDroppedAfterRealCommit:true,rollbackRestart:true,externalIAM:'NOT_PROVEN',securityDefinerInherited:'TUR021',lastNetworkByte:'NOT_PROVEN',release:'NO_GO'}));
 }finally{
  for(const c of [outsider,runtime,rights,owner])if(c)await c.end().catch(()=>{});
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE').catch(()=>{});
  for(const n of names.reverse())await admin.query('DROP ROLE IF EXISTS '+n).catch(()=>{});
  await admin.end();
 }
});
