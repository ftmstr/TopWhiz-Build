import test from 'node:test';
import assert from 'node:assert/strict';
import {inventory,loadClosedConfigs,inspectSetup,validateClosedConfig} from '../scripts/pilot-preflight.mjs';
import {readLocalMetrics,renderPilotPanel} from '../scripts/pilot-panel.mjs';
test('closed setup inventory has 28 distinct names and never authorizes pilot',()=>{
 const c=loadClosedConfigs(),x=inspectSetup(c,{});
 assert.equal(inventory.length,28);assert.equal(new Set(inventory).size,28);
 assert.equal(x.closedConfig,true);assert.equal(x.pilot,'BLOCKED');assert.equal(x.release,'HARD_NO_GO');
});
test('config preflight denies routes, cron, unsafe mode, inline secrets and remote D1',()=>{
 const cases=[['wrangler.jsonc',c=>c.routes=['*']],['wrangler.jsonc',c=>c.triggers.crons=['0 * * * *']],['wrangler.jsonc',c=>c.vars.TPW_MODE='PRIVATE_PILOT'],['wrangler.jsonc',c=>c.vars.TPW_EDITOR_API_TOKEN='SECRET_CANARY'],['wrangler.ci-local.jsonc',c=>c.d1_databases[0].database_id='real-id']];
 for(const [n,change] of cases){const c=loadClosedConfigs()[n];change(c);const result=validateClosedConfig(n,c);assert.equal(result.ok,false);assert.ok(!JSON.stringify(result).includes('SECRET_CANARY'))}
});
test('setup JSON and HTML redact all environment values; no outbound or public action',()=>{
 const e=Object.fromEntries(inventory.map(n=>[n,'SECRET_CANARY_<script>']));
 const x=inspectSetup(loadClosedConfigs(),e),html=renderPilotPanel(x);
 assert.ok(!JSON.stringify(x).includes('SECRET_CANARY'));assert.ok(!html.includes('SECRET_CANARY'));assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('HARD NO-GO'));assert.ok(html.includes('default-src'));
});
test('unavailable D1 reports generic status only',async()=>{
 assert.deepEqual(await readLocalMetrics({prepare(){throw Error('SECRET_CANARY')}}),{status:'LOCAL_READ_UNAVAILABLE'});
});
