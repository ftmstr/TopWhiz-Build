import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const host='127.0.0.1', database='postgres', port='5432';
function sql(user, password, statement) {
  const result=spawnSync('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','-h',host,'-p',port,'-U',user,'-d',database,'-c',statement],{encoding:'utf8',env:{...process.env,PGPASSWORD:password},timeout:15000});
  return {status:result.status,out:(result.stdout||'').trim(),err:(result.stderr||'').trim()};
}
test('real PG16: independent role denied, same login can cancel its own backend; no request IAM guarantee',async()=>{
  assert.equal(sql('postgres','postgres',"CREATE ROLE tur078_a LOGIN PASSWORD 'tur078_a'; CREATE ROLE tur078_b LOGIN PASSWORD 'tur078_b';").status,0);
  const worker=spawn('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','-h',host,'-p',port,'-U','tur078_a','-d',database,'-c','SELECT pg_sleep(20)'],{env:{...process.env,PGPASSWORD:'tur078_a',PGAPPNAME:'tur078_target'},stdio:['ignore','pipe','pipe']});
  let stderr='';worker.stderr.on('data',d=>stderr+=d);
  try {
    let pid='';
    for(let i=0;i<50;i++){
      const p=sql('postgres','postgres',"SELECT pid FROM pg_stat_activity WHERE application_name='tur078_target' AND state='active' LIMIT 1");
      if(p.status===0 && /^\d+$/.test(p.out)){pid=p.out;break;}
      await delay(100);
    }
    assert.match(pid,/^\d+$/,'real active target backend required');
    const outsider=sql('tur078_b','tur078_b',`SELECT pg_cancel_backend(${pid})`);
    assert.notEqual(outsider.status,0,'independent non-superuser must not cancel other login');
    assert.match(outsider.err,/permission denied|must be a member|not permitted/i);
    const insider=sql('tur078_a','tur078_a',`SELECT pg_cancel_backend(${pid})`);
    assert.equal(insider.status,0,insider.err);
    assert.equal(insider.out,'t','same SQL login can cancel a different session: app lease alone is not IAM');
  } finally {
    if(worker.exitCode===null) worker.kill('SIGTERM');
    await Promise.race([new Promise(resolve=>worker.once('close',resolve)),delay(3000)]);
  }
});
