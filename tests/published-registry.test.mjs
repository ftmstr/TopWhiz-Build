import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("unverified news/phone catalogs are empty until trusted publisher is connected",()=>{
  const source=readFileSync(new URL("../apps/web/data/published-content.json",import.meta.url),"utf8");
  const value=JSON.parse(source);
  assert.deepEqual(Object.keys(value).sort(),["news","phones"]);
  assert.deepEqual(value.news,[]);
  assert.deepEqual(value.phones,[]);
});
test("public routes must not render arbitrary unescaped HTML",()=>{
  for (const filename of [
    "apps/web/app/haberler/[slug]/page.tsx",
    "apps/web/app/telefonlar/[slug]/page.tsx"
  ]) {
    const contents=readFileSync(new URL("../"+filename,import.meta.url),"utf8");
    assert.doesNotMatch(contents,/dangerouslySetInnerHTML|document\.write|eval\(/);
    assert.match(contents,/notFound\(\)/);
  }
});
