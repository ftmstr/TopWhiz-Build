import test from 'node:test';
import assert from 'node:assert/strict';

// Negative authorization model, NOT a PostgreSQL server or IAM enforcement.
function canCancel(lease, request, live) {
  if (!lease || !request || !live) return false;
  const fields = ['pid','backendStart','connectionId','requestId','leaseId','role'];
  if (fields.some(k => typeof lease[k] !== 'string' || !lease[k] || lease[k] !== request[k])) return false;
  return live.active === true && live.pid === lease.pid &&
    live.backendStart === lease.backendStart && live.connectionId === lease.connectionId &&
    live.role === lease.role && live.leaseId === lease.leaseId;
}
const base = Object.freeze({pid:'31415',backendStart:'2026-11-11T00:00:00Z',connectionId:'pool-A-1',requestId:'req-1',leaseId:'lease-1',role:'media_reader'});
const live = Object.freeze({...base,active:true});
test('exact pinned identity permits model cancellation',()=>assert.equal(canCancel(base,base,live),true));
for (const [name,field,value] of [
 ['PID recycled with new backend start','backendStart','2026-11-11T00:01:00Z'],
 ['connection returned to pool','connectionId','pool-A-2'],
 ['lease transferred','leaseId','lease-2'],
 ['independent request','requestId','req-2'],
 ['role changed','role','admin'],
 ['PID changed','pid','31416']
]) test(name,()=>assert.equal(canCancel(base,{...base,[field]:value},live),false));
test('inactive backend fails closed',()=>assert.equal(canCancel(base,base,{...live,active:false}),false));
test('missing and malformed identity fails closed',()=>{
 assert.equal(canCancel(base,{...base,leaseId:''},live),false);
 assert.equal(canCancel(base,{...base,pid:31415},live),false);
 assert.equal(canCancel(null,base,live),false);
});
test('live backend replacement fails even with same PID',()=>assert.equal(canCancel(base,base,{...live,backendStart:'reused'}),false));
test('application guard cannot revoke PostgreSQL same-role native cancellation',()=>{
 const nativeSameRoleCanCancel = (caller,target)=>caller.role===target.role && caller.pid!==target.pid;
 const attacker={role:'media_reader',pid:'777'};
 assert.equal(canCancel(base,{...base,requestId:'attacker'},live),false);
 assert.equal(nativeSameRoleCanCancel(attacker,{role:'media_reader',pid:'31415'}),true);
 // This is an explicit unresolved counterexample, not a security PASS.
});
