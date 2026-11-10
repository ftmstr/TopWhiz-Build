import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const dsn = process.env.TUR058_PG_DSN;
function sql(query, user='postgres') {
  const r=spawnSync('psql',[dsn,'-X','-v','ON_ERROR_STOP=1','-At','-c',query],{encoding:'utf8',env:process.env});
  assert.equal(r.status,0,`psql failed (${user}): ${r.stderr}`);
  return r.stdout.trim();
}
test('TUR058 real PostgreSQL: owner can regrant SELECT after REVOKE in independent sessions', {skip: !dsn && 'disposable PostgreSQL DSN absent'}, () => {
  const suffix='tur058_'+process.pid;
  const owner=suffix+'_owner', reader=suffix+'_reader', table=suffix+'_table';
  try {
    sql(`CREATE ROLE ${owner} NOLOGIN; CREATE ROLE ${reader} NOLOGIN; CREATE TABLE public.${table}(id int); ALTER TABLE public.${table} OWNER TO ${owner}; REVOKE ALL ON public.${table} FROM PUBLIC;`);
    sql(`GRANT SELECT ON public.${table} TO ${reader}; REVOKE SELECT ON public.${table} FROM ${reader};`);
    assert.equal(sql(`SELECT has_table_privilege('${reader}','public.${table}','SELECT')`),'f');
    sql(`SET ROLE ${owner}; GRANT SELECT ON public.${table} TO ${reader}; RESET ROLE;`);
    assert.equal(sql(`SELECT has_table_privilege('${reader}','public.${table}','SELECT')`),'t');
    sql(`REVOKE SELECT ON public.${table} FROM ${reader};`);
    assert.equal(sql(`SELECT has_table_privilege('${reader}','public.${table}','SELECT')`),'f');
    sql(`SET ROLE ${owner}; GRANT SELECT ON public.${table} TO ${reader}; RESET ROLE;`);
    assert.equal(sql(`SELECT has_table_privilege('${reader}','public.${table}','SELECT')`),'t');
  } finally {
    sql(`DROP TABLE IF EXISTS public.${table} CASCADE; DROP ROLE IF EXISTS ${reader}; DROP ROLE IF EXISTS ${owner};`);
  }
});
