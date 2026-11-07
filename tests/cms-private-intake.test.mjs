import test from "node:test";
import assert from "node:assert/strict";
import { handlePrivateCmsIntake } from "../services/prices-worker/src/cms/private-intake.mjs";

const token="a-very-long-test-token-secret-1234567890";
function req(body,method="POST",value=token){
  return new Request("https://internal.example.org/internal/cms/submit",{
    method,headers:{"Authorization":"Bearer "+value,"Content-Type":"application/json"},
    body:method==="POST"?JSON.stringify(body):undefined
  });
}
test("single private intake accepts a draft through authenticated repository, never publishes",async()=>{
  let calls=0;
  const repository={async submit(key,content){calls++;assert.equal(key,"ci-test-key");assert.equal(content.type,"news");
    return {id:"test-staging-id",revision:1,state:"pending_review",replay:false}}};
  const result=await handlePrivateCmsIntake(req({externalKey:"ci-test-key",content:{type:"news"}}),{
    repository,intakeSecret:token
  });
  assert.equal(result.status,202);
  assert.equal((await result.json()).state,"pending_review");
  assert.equal(calls,1);
});
test("invalid token, extra approval flag and method cannot trigger any writes",async()=>{
  let called=false;
  const repository={async submit(){called=true;}};
  const wrong=await handlePrivateCmsIntake(req({externalKey:"a",content:{}},"POST","invalid"),{repository,intakeSecret:token});
  assert.equal(wrong.status,401);
  const forged=await handlePrivateCmsIntake(req({externalKey:"a",content:{},publish:true}),{repository,intakeSecret:token});
  assert.equal(forged.status,400);
  const method=await handlePrivateCmsIntake(req(null,"GET"),{repository,intakeSecret:token});
  assert.equal(method.status,405);
  assert.equal(called,false);
});
