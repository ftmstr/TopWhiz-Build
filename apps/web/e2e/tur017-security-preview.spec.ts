import {test,expect} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Isolated Next.js + synthetic PostgreSQL data only. These tests do not
// certify WCAG 2.2, Core Web Vitals, security or real CDN behavior.
for(const [width,height] of [[360,780],[820,1180],[1536,900]]){
 test("TUR017 protected preview "+width+"x"+height+": structure/SEO/no adverts",async({page})=>{
  await page.setViewportSize({width,height});
  for(const path of ["/","/haberler","/telefonlar"]){
   const result=await page.goto(path,{waitUntil:"domcontentloaded"});
   expect(result?.status()).toBe(200);
   expect(result?.headers()["x-robots-tag"]).toMatch(/noindex/i);
   expect(await page.evaluate(()=>
    document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
   await expect(page.getByRole("main")).toHaveCount(1);
   await expect(page.getByRole("heading",{level:1})).toHaveCount(1);
   await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
   await expect(page.locator('script[src*="adsbygoogle"]')).toHaveCount(0);
   for(const place of ["top","right","bottom"])
    await expect(page.locator('[data-ad-placement="'+place+'"]')).toHaveCount(1);
  }
 });
}
test("TUR017 synthetic revoked routes fail closed under parallel HTTP and keep 404 private",async({request})=>{
 const urls=[
  "/haberler/ci-tur017-ineligible","/telefonlar/ci-tur017-revoked",
  "/haberler/ci-tur017-ineligible?utm_source=synthetic"
 ];
 const res=await Promise.all(Array.from({length:24},(_,i)=>request.get(urls[i%urls.length])));
 for(const r of res){
  expect(r.status()).toBe(404);
  expect(r.headers()["x-robots-tag"]).toMatch(/noindex/i);
  expect(await r.text()).not.toContain("adsbygoogle.js");
 }
});
test("TUR017 focusable skip-link and automated axe on fictional published listing",async({page})=>{
 await page.goto("/haberler",{waitUntil:"domcontentloaded"});
 await page.keyboard.press("Tab");
 await expect(page.getByRole("link",{name:"İçeriğe geç"})).toBeFocused();
 await page.keyboard.press("Enter");
 await expect(page.locator("main#main")).toBeFocused();
 const report=await new AxeBuilder({page})
  .withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
 expect(report.violations.filter(v=>["serious","critical"].includes(v.impact??""))
  .map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length}))).toEqual([]);
});
