import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
const path=fileURLToPath(new URL('../scripts/unified-demo.mjs',import.meta.url));
const child=spawn(process.execPath,[path],{stdio:['pipe','pipe','pipe'],windowsHide:true});
let output='',errors='',url;
const exited=once(child,'exit');
child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);
try{
 const deadline=Date.now()+60000;
 while(!(url=output.match(/TOPWHIZ_READY (http:\/\/127\.0\.0\.1:\d+\/)/)?.[1])){
  if(child.exitCode!==null||Date.now()>deadline)throw Error('DEMO_READY '+output+' '+errors);
  await new Promise(r=>setTimeout(r,50));
 }
 const res=await fetch(url);assert.equal(res.status,200);assert.match(res.headers.get('content-security-policy'),/connect-src 'none'/);
 const html=await res.text();assert.match(html,/id="projection-data"/);assert.match(html,/id="phone-projection-data"/);assert.match(html,/EX-001/);
 assert.equal((await fetch(url+'api/news')).status,404);
 assert.equal((await fetch(url,{method:'HEAD'})).status,200);
 child.stdin.write('stop\n');
 const [code,signal]=await Promise.race([exited,new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('DEMO_STOP_TIMEOUT')),10000);t.unref()})]);
 assert.equal(code,0);assert.equal(signal,null);assert.match(output,/TOPWHIZ_STOPPED/);
 await assert.rejects(fetch(url));
 console.log('PASS unified local demo child process readiness, signed D1 HTTP, stop and closed loopback port');
}finally{if(child.exitCode===null)child.kill()}
