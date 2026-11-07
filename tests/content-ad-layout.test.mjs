import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessPublishableContent, contentDestinations } from "../services/content/publish-policy.mjs";

const now = new Date("2026-11-07T18:00:00Z");
const context = {
  sourceRightsApproved:true,sourceRightsRef:"independent-reviewed-license",
  editorialVerification:"verified", approvedSourceIds:["official-release"],
  approvedMediaIds:["owned-cover"], originali tyChecked:true,
  sourceType:"manufacturer", specificationsVerified:true
};
context.originalityChecked=true;
delete context["originali tyChecked"];
const base = {
  type:"news",slug:"test-cihaz-duyurusu",
  title:"Tamamen kurgusal cihaz duyurusu",
  summary:"Gerçek bir haber değildir, yalnızca otomatik içerik şemasının sentetik test kaydıdır.",
  language:"tr",sources:["official-release"],coverMediaId:"owned-cover",
  observedAt:"2026-11-07T17:00:00Z",
  body:"Bu metin yalnızca test içindir. Örnek ve sentetik verilerle üretilen içeriğin güvenilir kaynak, metin ve görsel doğrulaması yapılmadan otomatik yayına alınmaması için çalışan bir test senaryosudur."
};
test("approved news generates deterministic route placements, without side effects",()=>{
  const result=assessPublishableContent(base,context,now);
  assert.equal(result.status,"ready_for_auto_publish");
  assert.deepEqual(result.destinations,["/haberler/test-cihaz-duyurusu","/haberler","/"]);
});
test("news without independently authorized media is quarantined",()=>{
  const result=assessPublishableContent({...base,coverMediaId:"stolen-photo"},context,now);
  assert.equal(result.status,"quarantined");
  assert.ok(result.failures.includes("media_rights_missing"));
  assert.deepEqual(result.destinations,[]);
});
test("AI self-certification cannot override trusted editorial rights",()=>{
  const result=assessPublishableContent({...base,sourceRightsApproved:true,editorialVerification:"verified"},
    {...context,sourceRightsApproved:false, editorialVerification:"pending"},now);
  assert.equal(result.status,"quarantined");
  assert.ok(result.failures.includes("source_rights_missing"));
});
test("verified phone schema maps to phone catalog and compare templates",()=>{
  const phone={...base,type:"phone",brand:"Fictional",modelCode:"M-01",
    market:"TR",variants:[{storageGb:256,ramGb:12,warrantyClass:"standard"}]};
  delete phone.body;
  const result=assessPublishableContent(phone,context,now);
  assert.equal(result.status,"ready_for_auto_publish");
  assert.deepEqual(result.destinations,["/telefonlar/test-cihaz-duyurusu","/telefonlar","/karsilastir"]);
  assert.deepEqual(contentDestinations({...phone,slug:"../unsafe"}),[]);
});
test("all ad positions are preview-only; no Google AdSense code injected",()=>{
  const slot=readFileSync(new URL("../apps/web/components/ad-slots.tsx",import.meta.url),"utf8");
  const home=readFileSync(new URL("../apps/web/components/home.tsx",import.meta.url),"utf8");
  for(const placement of ['top','right','bottom']) assert.match(home,new RegExp('placement="'+placement+'"'));
  assert.doesNotMatch(slot,/adsbygoogle\\.js|ca-pub-\\d+|googlesyndication\\.com/);
});
