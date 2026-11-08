import test from "node:test";
import assert from "node:assert/strict";
import {replayDeadLetters} from "../services/prices-worker/src/cms/dlq-redrive.mjs";

const event={
  eventId:"11111111-1111-4111-8111-111111111111",
  submissionId:"22222222-2222-4222-8222-222222222222",
  revision:7,kind:"withdrawn",routes:["/haberler/test","/haberler","/"]
};
function entry(body){
  const state={acked:0,retried:0,delay:null};
  return {state,body,ack(){state.acked++},retry(opts){state.retried++;state.delay=opts.delaySeconds}};
}
test("DLQ does not believe a Queue payload's self-asserted approval",async()=>{
  const msg=entry({...event,approved:true,ticket:"SELF-ISSUED-FAKE"});
  let sends=0,audits=0;
  const x=await replayDeadLetters({messages:[msg]},{
    verifyOperatorTicket:async()=>({approved:false}),
    receipts:{async status(){return "missing"}},
    auditReplay:async()=>{audits++},
    originQueue:{async send(){sends++}}
  });
  assert.deepEqual(x,{resent:0,previouslyCompleted:0,retried:1});
  assert.deepEqual(msg.state,{acked:0,retried:1,delay:60});
  assert.equal(sends,0);assert.equal(audits,0);
});
test("DLQ audit failure and active receipt lease never enqueue or ACK",async()=>{
  for(const reason of ["audit-failure","lease-active"]){
    const msg=entry(event);let sent=0;
    const result=await replayDeadLetters({messages:[msg]},{
      verifyOperatorTicket:async()=>({
        approved:true,ticket:"CI-HUMAN-APPROVED-1234",operator:"CI Rights Controller"
      }),
      receipts:{async status(){return reason==="lease-active"?"processing":"missing"}},
      auditReplay:async()=>{throw Error("audit deliberately unavailable")},
      originQueue:{async send(){sent++}}
    });
    assert.equal(result.retried,1);
    assert.equal(msg.state.acked,0);
    assert.equal(sent,0);
  }
});
test("Duplicate redrive event in same batch is not enqueued twice",async()=>{
 const a=entry(event),b=entry(event);let sent=0;
 const result=await replayDeadLetters({messages:[a,b]},{
   verifyOperatorTicket:async()=>({
     approved:true,ticket:"CI-INDEPENDENT-OPERATOR-1234",operator:"CI Rights Controller"
   }),
   receipts:{async status(){return "missing"}},
   auditReplay:async()=>{},
   originQueue:{async send(){sent++}}
 });
 assert.deepEqual(result,{resent:1,previouslyCompleted:0,retried:1});
 assert.equal(sent,1);assert.equal(a.state.acked,1);assert.equal(b.state.retried,1);
});
