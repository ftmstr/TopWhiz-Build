/** Optional one-click reuse launcher. Does not modify the pinned installer or its checkout. */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';
import {setTimeout as sleep} from 'node:timers/promises';

const sha='65a79089bd1226cd31c495a89f191cba2f08c8ad';
const cwd=fileURLToPath(new URL('./',import.meta.url));
export function checkedLoopback(value){
 const u=new URL(value);
 if(!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}\/$/.test(value)||u.href!==value||Number(u.port)>65535||!u.port)throw Error('LAUNCHER_URL_DENIED');
 return u.href;
}
async function openDefaultBrowser(url){
 const safe=checkedLoopback(url);
 assert.ok(process.env.SystemRoot,'WINDOWS_ROOT_MISSING');
 const exe=join(process.env.SystemRoot,'System32','rundll32.exe');
 await new Promise((ok,no)=>{
  const p=spawn(exe,['url.dll,FileProtocolHandler',safe],{stdio:'ignore',windowsHide:true});
  p.once('error',no);p.once('exit',code=>code===0?ok():no(Error('BROWSER_DISPATCH_FAILED '+code)));
 });
}
export async function launchWindowsDemo({openBrowser=openDefaultBrowser,input=process.stdin}={}){
 assert.equal(process.platform,'win32');
 assert.ok(process.env.LOCALAPPDATA);
 const dest=join(process.env.LOCALAPPDATA,'TopWhizLocal',sha);
 if(!existsSync(join(dest,'services','tpw-orchestrator','unified-demo.sha256.json')))throw Error('RUN_TOPWHIZ_KUR_VE_BASLAT_FIRST');
 const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/c','TOPWHIZ-KUR-VE-BASLAT.cmd','--yes'],{cwd,stdio:['pipe','pipe','pipe'],windowsHide:true});
 let output='',errors='',exit,reader,stopSent=false,url,stopTimeout;
 const exited=new Promise(resolve=>{child.once('error',e=>{exit={error:e};resolve(exit)});child.once('exit',(code,signal)=>{exit={code,signal};resolve(exit)})});
 child.stdout.on('data',b=>{output+=b;process.stdout.write(b)});
 child.stderr.on('data',b=>{errors+=b;process.stderr.write(b)});
 child.stdin.on('error',()=>{});
 const stop=()=>{if(!stopSent&&!exit){stopSent=true;child.stdin.write('stop\n');stopTimeout=setTimeout(()=>{if(!exit&&child.pid)spawnSync('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{stdio:'ignore',timeout:10000})},20000);stopTimeout.unref()}};
 const interrupt=()=>stop();
 process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
 try{
  const deadline=Date.now()+60000;
  while(!(url=output.match(/^TOPWHIZ_READY (http:\/\/127\.0\.0\.1:\d+\/)\r?$/m)?.[1])){
   if(exit||Date.now()>deadline||stopSent)throw Error('LAUNCHER_READY_FAILED '+errors);
   await sleep(100);
  }
  url=checkedLoopback(url);
  assert.match(output,/TOPWHIZ_HELPER_REUSE/);
  assert.doesNotMatch(output,/TOPWHIZ_HELPER_FRESH_INSTALL/);
  const res=await fetch(url,{signal:AbortSignal.timeout(10000),redirect:'error'});
  assert.equal(res.status,200);assert.match(res.headers.get('content-security-policy'),/connect-src 'none'/);
  const html=await res.text();assert.match(html,/id="projection-data"/);assert.match(html,/id="phone-projection-data"/);
  reader=createInterface({input,terminal:false});
  reader.on('line',line=>{if(!line.trim()||line.trim().toLowerCase()==='stop')stop()});
  reader.once('close',stop);
  console.log('TOPWHIZ_BROWSER_READY '+url);
  await openBrowser(url);
  console.log('Browser launch requested. Press Enter or type stop and Enter to close safely.');
  const done=await exited;
  if(done.error)throw done.error;
  assert.equal(done.code,0);assert.equal(done.signal,null);assert.match(output,/TOPWHIZ_STOPPED/);
  await assert.rejects(fetch(url,{signal:AbortSignal.timeout(5000)}));
  console.log('PASS launcher graceful stop and closed loopback port');
 }finally{
  reader?.close();stop();
  if(!exit)await Promise.race([exited,sleep(22000,undefined,{ref:false})]);
  if(stopTimeout)clearTimeout(stopTimeout);
  if(!exit&&child.pid)spawnSync('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{stdio:'ignore',timeout:10000});
  process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==2)throw Error('LAUNCHER_NO_OPTIONS');
 await launchWindowsDemo();
}
