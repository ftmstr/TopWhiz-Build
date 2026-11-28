import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const gate=fileURLToPath(new URL('../../../scripts/tur011-license-gate.mjs',import.meta.url));
const compound='Apache-2.0 AND LGPL-3.0-or-later';
const fixture={name:'synthetic-windows-native-package',versions:['1.0.0'],license:compound};
function run(source,local=false){
 const dir=mkdtempSync(join(tmpdir(),'tpw-license-test-'));
 try{
  const file=join(dir,'licenses.json');writeFileSync(file,JSON.stringify(source));
  const result=spawnSync(process.execPath,[gate,file,...(local?['--local-demo-review-only']:[])],{encoding:'utf8'});
  assert.equal(result.error,undefined);assert.equal(result.signal,null);
  return {status:result.status,report:JSON.parse(result.stdout.split(/\r?\n/)[0])};
 }finally{rmSync(dir,{recursive:true,force:true})}
}
test('exact Windows expression remains unapproved; default gate rejects, explicit local review retains package evidence',()=>{
 const source={MIT:[{name:'synthetic-mit'}],[compound]:[fixture]};
 for(const local of [false,true]){
  const {status,report}=run(source,local);
  assert.equal(status,local?0:1);assert.equal(report.approved,false);assert.equal(report.releaseBlocked,true);
  assert.equal(report.legalReviewRequired,true);assert.deepEqual(report.unknownLicenses,[compound]);
  assert.deepEqual(report.reviewPackages,[fixture]);assert.equal(report.checked,2);
 }
});
test('local review rejects AGPL and any other expression, including mixed unknown entries',()=>{
 for(const name of ['AGPL-3.0-only','Apache-2.0 OR LGPL-3.0-or-later','Apache-2.0 AND GPL-3.0-only','UNKNOWN']){
  const {status,report}=run({[compound]:[fixture],[name]:[{name:'synthetic-other'}]},true);
  assert.equal(status,1);assert.equal(report.approved,false);assert.equal(report.releaseBlocked,true);
 }
});
test('plain Linux LGPL behavior and ordinary MIT classification are preserved',()=>{
 const linux=run({'LGPL-3.0-or-later':[{name:'synthetic-linux'}]});
 assert.equal(linux.status,0);assert.equal(linux.report.approved,false);assert.equal(linux.report.releaseBlocked,true);assert.equal(linux.report.legalReviewRequired,true);
 const mit=run({MIT:[{name:'synthetic-mit'}]});
 assert.equal(mit.status,0);assert.equal(mit.report.approved,true);assert.equal(mit.report.releaseBlocked,false);assert.equal(mit.report.legalReviewRequired,false);
});
