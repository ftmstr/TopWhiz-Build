import {test,expect} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
/** Browser-only synthetic acceptance. No live content/AdSense/Cloudflare CDN.
 * Manual WCAG and field Core Web Vitals remain outside this suite.
 */
for(const [width,height] of [[328,720],[412,915],[860,1180],[1216,820],[1728,972]]){
 test("TUR014 "+width+"px responsive news, phones and inert advertisement regions",async({page})=>{
  await page.setViewportSize({width,height});
  for(const path of ["/","/haberler","/telefonlar"]){
   const response=await page.goto(path,{waitUntil:"domcontentloaded"});
   expect(response?.status()).toBe(200);
   expect(response?.headers()["x-robots-tag"]).toMatch(/noindex/i);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
     .toBeLessThanOrEqual(2);
   await expect(page.getByRole("main")).toHaveCount(1);
   await expect(page.getByRole("heading",{level:1}).first()).toBeVisible();
   expect(await page.locator('script[src*="adsbygoogle"]').count()).toBe(0);
   for(const kind of ["top","right","bottom"]){
    await expect(page.locator('[data-ad-placement="'+kind+'"]')).toHaveCount(1);
   }
  }
 });
}
test("TUR014 revoked/withdrawn synthetic article must never acquire crawlable preview metadata",async({page,request})=>{
 for(const uri of [
  "/haberler/ci-never-published-tur014",
  "/telefonlar/ci-never-published-tur014"
 ]){
  expect((await request.get(uri)).status()).toBe(404);
 }
 for(const uri of [
  "/haberler/ci-api-published-news",
  "/telefonlar/ci-api-published-phone"
 ]){
  const response=await page.goto(uri,{waitUntil:"networkidle"});
  expect(response?.status()).toBe(200);
  expect(response?.headers()["x-robots-tag"]).toMatch(/noindex/i);
  expect(await page.locator('link[rel="canonical"]').count()).toBe(0);
  const axe=await new AxeBuilder({page})
   .withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
  expect(axe.violations.filter(v=>["serious","critical"].includes(v.impact??""))
   .map(v=>v.id)).toEqual([]);
  const image=page.locator('img[src="/media/cms/ci-ssr-hero"]');
  await expect.poll(()=>image.evaluate((e:HTMLImageElement)=>e.complete&&e.naturalWidth>0))
   .toBe(true);
 }
});
test("TUR014 32 simultaneous localhost reads do not inject real offers, Ads or release SEO",async({request})=>{
 const paths=["/","/haberler","/telefonlar"];
 const started=Date.now();
 const replies=await Promise.all(Array.from({length:32},(_,i)=>request.get(paths[i%3])));
 expect(replies.every(r=>r.ok())).toBe(true);
 expect(Date.now()-started).toBeLessThan(12000);
 for(const response of replies){
  const html=await response.text();
  expect(html).not.toContain("adsbygoogle");
  expect(response.headers()["x-robots-tag"]).toMatch(/noindex/i);
 }
});
