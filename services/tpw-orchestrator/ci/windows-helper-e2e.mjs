import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import net from 'node:net';

assert.equal(process.platform,'win32');
const mode=process.argv[2];
if(mode==='probe-open'||mode==='probe-blocked'){
 const ip=process.argv[3];assert.equal(net.isIP(ip),4);
 const connected=await new Promise(resolve=>{
  const socket=net.createConnection({host:ip,port:443});
  const done=v=>{socket.destroy();resolve(v)};
  socket.once('connect',()=>done(true));socket.once('error',()=>done(false));
  socket.setTimeout(6000,()=>done(false));
 });
 assert.equal(connected,mode==='probe-open','outbound TCP control');
 console.log('PASS '+mode);process.exit(0);
}
assert.ok(['install','reuse'].includes(mode));
const sha='65a79089bd1226cd31c495a89f191cba2f08c8ad';
const dest=join(process.env.LOCALAPPDATA,'TopWhizLocal',sha);
assert.equal(existsSync(dest),mode==='reuse');
const cwd=fileURLToPath(new URL('../../../local-text/',import.meta.url));
const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/c','TOPWHIZ-KUR-VE-BASLAT.cmd','--yes'],{cwd,stdio:['pipe','pipe','pipe'],windowsHide:true});
let out='',err='',exit;
const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>{exit={code,signal};resolve(exit)})});
child.stdout.on('data',b=>{out+=b;process.stdout.write(b)});
child.stderr.on('data',b=>{err+=b;process.stderr.write(b)});
child.stdin.on('error',()=>{});
try{
 const deadline=Date.now()+240000;let url;
 while(!(url=out.match(/TOPWHIZ_READY (http:\/\/127\.0\.0\.1:\d+\/)/)?.[1])){
  if(exit||Date.now()>deadline)throw Error('HELPER_READY_FAILED '+JSON.stringify(exit)+' '+err);
  await sleep(100);
 }
 assert.match(out,mode==='install'?/TOPWHIZ_HELPER_FRESH_INSTALL/:/TOPWHIZ_HELPER_REUSE/);
 if(mode==='reuse')assert.doesNotMatch(out,/TOPWHIZ_HELPER_FRESH_INSTALL/);
 const res=await fetch(url,{signal:AbortSignal.timeout(10000)});
 assert.equal(res.status,200);assert.match(res.headers.get('content-security-policy'),/connect-src 'none'/);
 const html=await res.text();assert.match(html,/id="projection-data"/);assert.match(html,/id="phone-projection-data"/);assert.match(html,/EX-001/);
 const g=spawnSync('git',['rev-parse','HEAD'],{cwd:dest,encoding:'utf8'});assert.equal(g.status,0);assert.equal(g.stdout.trim(),sha);
 const r=JSON.parse(readFileSync(join(dest,'services/tpw-orchestrator/unified-demo-licenses.json'),'utf8'));
 assert.equal(r.approved,false);assert.equal(r.releaseBlocked,true);assert.equal(r.legalReviewRequired,true);
 assert.ok(r.reviewPackages.some(x=>x.name==='@img/sharp-win32-x64'&&x.versions.includes('0.35.5')));
 child.stdin.write('stop\n');
 const done=await Promise.race([exited,sleep(20000,undefined,{ref:false}).then(()=>{throw Error('HELPER_STOP_TIMEOUT')})]);
 assert.equal(done.code,0);assert.equal(done.signal,null);assert.match(out,/TOPWHIZ_STOPPED/);
 await assert.rejects(fetch(url,{signal:AbortSignal.timeout(5000)}));
 console.log('PASS Windows helper '+mode+' exact pinned checkout, license blocked, signed D1 HTTP, stop and closed port');
}finally{if(!exit){spawnSync('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{stdio:'ignore'});}}
