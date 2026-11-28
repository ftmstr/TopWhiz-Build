import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../scripts/inspect-nist-rss.mjs',import.meta.url));
test('offline RSS inspection emits only aggregate/hash, not content or approval',()=>{
 const body='<rss version="2.0"><channel><item><title>SYNTHETIC_PRIVATE_CANARY title</title><link>https://www.nist.gov/synthetic-private-canary</link></item></channel></rss>';
 const run=(input)=>spawnSync(process.execPath,[script,'news'],{input,encoding:'utf8',timeout:5000});
 const ok=run(body);assert.equal(ok.status,0,ok.stderr);
 const x=JSON.parse(ok.stdout);assert.equal(x.status,'FORMAT_COMPATIBLE');assert.equal(x.parsed,1);assert.equal(x.sha256,createHash('sha256').update(body).digest('hex'));assert.equal(x.rights,'UNVERIFIED');assert.equal(x.activation,false);assert.equal(x.remoteHttpVerified,false);
 assert.ok(!ok.stdout.includes('CANARY')&&!ok.stdout.includes('synthetic-private-canary'));assert.equal(ok.stderr,'');
 const bad=run(body.replace('www.nist.gov','other.example.org'));assert.equal(bad.status,1);assert.equal(JSON.parse(bad.stdout).reason,'ENDPOINT_NOT_ALLOWLISTED');assert.ok(!bad.stdout.includes('other.example.org'));
 const large=run('x'.repeat(256*1024+1));assert.equal(large.status,1);assert.equal(JSON.parse(large.stdout).reason,'MAX_BYTES');
});
