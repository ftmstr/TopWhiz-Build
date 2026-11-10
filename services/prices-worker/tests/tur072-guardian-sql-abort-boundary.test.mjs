import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuardianApprovalLookup} from '../src/cms/guardian-approval-contract.mjs';

const media={id:'fixture',rightsApproved:true,generation:'7'};

test('abort while independent media SQL is pending never starts guardian SQL',async()=>{
 const controller=new AbortController();let release;let guardianCalls=0;
 const lookup=createGuardianApprovalLookup({readMedia:()=>new Promise(r=>{release=r}),readGuardian:async()=>{guardianCalls++;return {approved:true,generation:'7'}}});
 const pending=lookup('fixture',controller.signal);controller.abort();release(media);
 await assert.rejects(pending,/cms_request_aborted/);assert.equal(guardianCalls,0);
});

test('abort while guardian SQL is pending cannot authorize returned row',async()=>{
 const controller=new AbortController();let release;
 const lookup=createGuardianApprovalLookup({readMedia:async()=>media,readGuardian:()=>new Promise(r=>{release=r})});
 const pending=lookup('fixture',controller.signal);
 await Promise.resolve();await Promise.resolve();
 assert.equal(typeof release,'function');controller.abort();release({approved:true,generation:'7'});
 await assert.rejects(pending,/cms_request_aborted/);
});

test('fresh independent request cannot inherit a previously pinned approval',async()=>{
 let approved=true;
 const factory=()=>createGuardianApprovalLookup({readMedia:async()=>media,readGuardian:async()=>({approved,generation:'7'})});
 assert.equal((await factory()('fixture'))?.id,'fixture');approved=false;
 assert.equal(await factory()('fixture'),null);
});

test('abort is cooperative only: already-dispatched SQL may still complete',async()=>{
 const controller=new AbortController();let release;let completed=false;
 const lookup=createGuardianApprovalLookup({readMedia:()=>new Promise(r=>{release=()=>{completed=true;r(media)}}),readGuardian:async()=>({approved:true,generation:'7'})});
 const pending=lookup('fixture',controller.signal);controller.abort();release();
 await assert.rejects(pending,/cms_request_aborted/);assert.equal(completed,true);
});
