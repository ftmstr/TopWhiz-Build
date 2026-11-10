import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuardianApprovalLookup} from '../services/prices-worker/src/cms/guardian-approval-contract.mjs';

const media=(id='fictional-media',generation='7')=>({id,rightsApproved:true,generation,objectKey:'fictional-only'});
const guard=(generation='7')=>({approved:true,generation});
const lookup=(readMedia,readGuardian)=>createGuardianApprovalLookup({readMedia,readGuardian});

test('TUR065: first valid generation is pinned; a later generation is denied',async()=>{
 let generation='7';
 const find=lookup(async id=>media(id,generation),async()=>guard(generation));
 assert.equal((await find('fictional-media')).generation,'7');
 generation='8';
 assert.equal(await find('fictional-media'),null);
});
test('TUR065: independent requests do not share a process-wide generation pin',async()=>{
 const first=lookup(async id=>media(id,'7'),async()=>guard('7'));
 const second=lookup(async id=>media(id,'8'),async()=>guard('8'));
 assert.ok(await first('fictional-media'));
 assert.ok(await second('fictional-media'));
});
test('TUR065: guardian rejection after successful initial lookup fails closed',async()=>{
 let approved=true;
 const find=lookup(async id=>media(id),async()=>({approved,generation:'7'}));
 assert.ok(await find('fictional-media'));
 approved=false;
 assert.equal(await find('fictional-media'),null);
});
test('TUR065: guardian outage after initial approval propagates failure, never stale allow',async()=>{
 let fail=false;
 const find=lookup(async id=>media(id),async()=>{if(fail)throw Error('fictional_guardian_acl_denied');return guard();});
 assert.ok(await find('fictional-media'));
 fail=true;
 await assert.rejects(find('fictional-media'),/fictional_guardian_acl_denied/);
});
test('TUR065: invalid and unsafe epoch values cannot authorize',async()=>{
 for(const value of ['0','01','9223372036854775808',9007199254740992,{},null]){
  const find=lookup(async id=>media(id,value),async()=>guard(String(value)));
  assert.equal(await find('fictional-media'),null);
 }
});
test('TUR065: local post-check revoke remains an unresolved last-byte race',async()=>{
 let revoked=false;
 const find=lookup(async id=>media(id),async()=>({approved:!revoked,generation:'7'}));
 assert.ok(await find('fictional-media'));
 revoked=true; // after final check, before hypothetical network write
 const queued=Buffer.from('FICTIONAL_BYTES');
 assert.equal(queued.length,15);
 assert.equal(await find('fictional-media'),null);
 // An already-queued buffer is not retracted by a subsequent denial.
 assert.equal(queued.toString(),'FICTIONAL_BYTES');
});
