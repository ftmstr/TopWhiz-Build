import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

// Disposable PostgreSQL16 only. This intentionally proves a NO-GO owner ACL bypass.
const uri=process.env.TEST_DATABASE_URL;
if(process.env.CI!=='true'||!uri||!['127.0.0.1','localhost'].includes(new URL(uri).hostname))
  throw Error('TUR057 requires CI-only disposable loopback PostgreSQL16');
test('TUR057: independent table owner can regrant rights after administrator REVOKE', {timeout:60000}, async()=>{
  const suffix=randomBytes(5).toString('hex');
  const schema='tw057_'+suffix;
  const owner=schema+'_owner', reader=schema+'_reader';
  const password=randomBytes(16).toString('hex');
  const admin=new pg.Client({connectionString:uri});
  let connected=false; let session;
  try{
    await admin.connect();connected=true;
    await admin.query('CREATE ROLE '+owner+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '+ "'"+password+"'");
    await admin.query('CREATE ROLE '+reader+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '+ "'"+password+"'");
    await admin.query('CREATE SCHEMA '+schema);
    await admin.query('CREATE TABLE '+schema+'.media (id text PRIMARY KEY, approved boolean NOT NULL)');
    await admin.query('INSERT INTO '+schema+".media VALUES ('fictional',false)");
    await admin.query('REVOKE ALL ON SCHEMA '+schema+' FROM PUBLIC');
    await admin.query('GRANT USAGE ON SCHEMA '+schema+' TO '+owner+','+reader);
    await admin.query('ALTER TABLE '+schema+'.media OWNER TO '+owner);
    await admin.query('REVOKE ALL ON '+schema+'.media FROM PUBLIC,'+reader);
    const link=new URL(uri);link.username=owner;link.password=password;
    session=new pg.Client({connectionString:link.href});await session.connect();
    assert.equal((await session.query('SELECT session_user AS actor')).rows[0].actor,owner);
    const flags=(await admin.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1',[owner])).rows[0];
    assert.ok(!flags.rolsuper&&!flags.rolcreatedb&&!flags.rolcreaterole);
    assert.equal((await admin.query('SELECT has_table_privilege($1,$2,$3) AS allowed',[reader,schema+'.media','SELECT'])).rows[0].allowed,false);
    await session.query('GRANT SELECT ON '+schema+'.media TO '+reader);
    assert.equal((await admin.query('SELECT has_table_privilege($1,$2,$3) AS allowed',[reader,schema+'.media','SELECT'])).rows[0].allowed,true);
    await admin.query('REVOKE SELECT ON '+schema+'.media FROM '+reader);
    assert.equal((await admin.query('SELECT has_table_privilege($1,$2,$3) AS allowed',[reader,schema+'.media','SELECT'])).rows[0].allowed,false);
    // A second owner-issued grant defeats a one-time ACL revocation.
    await session.query('GRANT SELECT ON '+schema+'.media TO '+reader);
    assert.equal((await admin.query('SELECT has_table_privilege($1,$2,$3) AS allowed',[reader,schema+'.media','SELECT'])).rows[0].allowed,true);
    console.log(JSON.stringify({suite:'TUR057_PG16_OWNER_REGRANT_NEGATIVE',independentOwner:true,superuser:false,
      adminRevokeDurableAgainstOwner:false,productionNeon:'NOT_RUN',issue22:'OPEN',release:'NO_GO'}));
  }finally{
    if(session)await session.end().catch(()=>{});
    if(connected){
      await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE').catch(()=>{});
      await admin.query('DROP ROLE IF EXISTS '+reader).catch(()=>{});
      await admin.query('DROP ROLE IF EXISTS '+owner).catch(()=>{});
    }
    await admin.end().catch(()=>{});
  }
});
