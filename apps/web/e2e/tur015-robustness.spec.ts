import {test,expect} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Synthetic data only. Functional browser tests are NOT manual WCAG
 * certification or production Core Web Vitals / Cloudflare edge tests.
 */
for(const [width,height] of [[342,745],[428,926],[912,1280],[1180,820],[1680,950]]){
 test("TUR015 responsive "+width+"x"+height+": no overflow, semantic labels, ad placeholders",async({page})=>{
  await page.setViewportSize({width,height});
  for(const pathname of ["/","/haberler","/telefonlar"]){
   const response=await page.goto(pathname,{waitUntil:"domcontentloaded"});
   expect(response?.status()).toBe(200);
   expect(response?.headers()["x-robots-tag"]).toMatch(/noindex/i);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth))
    .toBeLessThanOrEqual(2);
   await expect(page.getByRole("main")).toHaveCount(1);
   await expect(page.getByRole("heading",{level:1}).first()).toBeVisible();
   for(const name of ["top","right","bottom"]){
    await expect(page.locator('[data-ad-placement="'+name+'"]')).toHaveCount(1);
   }
   expect(await page.locator('script[src*="adsbygoogle"]').count()).toBe(0);
   expect(await page.locator('link[rel="canonical"]').count()).toBe(0);
  }
 });
}
test("TUR015 synthetic news/phone accessible landmark, keyboard skip, signed PNG and deny unpublished",async({page,request})=>{
 await page.goto("/haberler/ci-api-published-news");
 await page.keyboard.press("Tab");
 await expect(page.getByRole("link",{name:"İçeriğe geç"})).toBeFocused();
 await page.keyboard.press("Enter");
 await expect(page.locator("main#main")).toBeFocused();
 for(const p of ["/haberler/ci-api-published-news","/telefonlar/ci-api-published-phone"]){
  const response=await page.goto(p,{waitUntil:"networkidle"});
  expect(response?.status()).toBe(200);
  expect(response?.headers()["x-robots-tag"]).toMatch(/noindex/i);
  const png=page.locator('img[src="/media/cms/ci-ssr-hero"]');
  await expect(png).toHaveAttribute("alt",/\S+/);
  await expect.poll(()=>png.evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth>0)).toBe(true);
  const report=await new AxeBuilder({page}).withTags([
   "wcag2a","wcag2aa","wcag21a","wcag21aa"
  ]).analyze();
  expect(report.violations.filter(x=>["serious","critical"].includes(x.impact??""))
   .map(x=>({id:x.id,impact:x.impact,count:x.nodes.length}))).toEqual([]);
 }
 for(const p of ["/haberler/ci-not-approved-tur015","/telefonlar/ci-revoked-tur015"]){
  expect((await request.get(p)).status()).toBe(404);
 }
});
test("TUR015 synthetic 40 HTTP reads preserve non-indexed preview and inactive ad scripts",async({request})=>{
 const urls=["/","/haberler","/telefonlar"];
 const start=Date.now();
 const rs=await Promise.all(Array.from({length:40},(_,i)=>request.get(urls[i%3])));
 expect(rs.every(x=>x.ok())).toBe(true);
 expect(Date.now()-start).toBeLessThan(12000);
 for(const r of rs){
  expect(r.headers()["x-robots-tag"]).toMatch(/noindex/i);
  expect(await r.text()).not.toContain("adsbygoogle.js");
 }
});
