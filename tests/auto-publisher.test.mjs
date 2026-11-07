import test from "node:test";
import assert from "node:assert/strict";
import { ingestAndRoute } from "../services/content/auto-publisher.mjs";
const now=new Date("2026-11-07T18:00:00Z");
const article={
  type:"news",slug:"ornek-otomatik-yayin-testi",
  title:"Tamamen kurgusal teknoloji haberi",
  summary:"Bu satır, otomatik yayın sisteminin yalnızca sentetik içerikle denetlenmesini sağlar.",
  language:"tr",observedAt:"2026-11-07T17:00:00Z",
  sources:["source-a"],coverMediaId:"owned-a",
  body:"Bu haber yalnızca birim testinde kullanılır. Gerçek bir ürün haberi, kullanıcıya açıklanmış fiyat veya yayınlanmış bilgi içermez. Amaç, kaynak onayı ve görsel lisansı olmadan otomatik yayın yolunun kapandığını doğrulamaktır."
};
const approval={
  sourceRightsApproved:true,sourceRightsRef:"verified-test-evidence",
  editorialVerification:"verified",approvedSourceIds:["source-a"],
  approvedMediaIds:["owned-a"],originalityChecked:true,sourceType:"official",
  specificationsVerified:true
};
function adapters(approved=true) {
  const calls=[];
  return {calls,
    reviewer:{resolveTrust:async()=>approved?approval:{...approval,sourceRightsApproved:false}},
    repository:{
      stage:async(_,assessment)=>{calls.push(["stage",assessment.status]);return {id:"synthetic-staging-id"};},
      publishApproved:async({routes})=>{calls.push(["publish",routes]);return {version:1};}
    },
    notifier:{invalidate:async(routes)=>{calls.push(["invalidate",routes]);}}
  };
}
test("one generic AI intake automatically routes a server-attested news item",async()=>{
  const deps=adapters();
  const result=await ingestAndRoute(article,{...deps,now});
  assert.equal(result.status,"published");
  assert.deepEqual(result.routes,["/haberler/ornek-otomatik-yayin-testi","/haberler","/"]);
  assert.deepEqual(deps.calls.map(c=>c[0]),["stage","publish","invalidate"]);
});
test("untrusted media or source cannot auto-publish and is quarantined",async()=>{
  const deps=adapters(false);
  const result=await ingestAndRoute(article,{...deps,now});
  assert.equal(result.status,"quarantined");
  assert.deepEqual(deps.calls.map(c=>c[0]),["stage"]);
});
test("missing publisher adapters reject before side effects",async()=>{
  await assert.rejects(()=>ingestAndRoute(article,{reviewer:{},repository:{},notifier:{}}),/trusted_adapters_required/);
});
