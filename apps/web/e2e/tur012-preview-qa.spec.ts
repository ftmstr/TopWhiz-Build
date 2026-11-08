import {test,expect} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Fictional PostgreSQL articles/phones via local CI-only API interception.
 * Performance timings are diagnostic CI bounds; NOT Lighthouse field CWV.
 */
for(const {width,height} of [
 {width:375,height:812},{width:812,height:375},
 {width:1024,height:768},{width:1280,height:800}
]){
 test("viewport "+width+"x"+height+" avoids overflow, preserves inactive ads and preview SEO",async({page})=>{
  await page.setViewportSize({width,height});
  for(const route of ["/","/haberler","/telefonlar"]){
   const response=await page.goto(route,{waitUntil:"domcontentloaded"});
   expect(response?.status()).toBe(200);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth))
     .toBeLessThanOrEqual(2);
   await expect(page.getByRole("main")).toHaveCount(1);
   await expect(page.getByRole("heading",{level:1}).first()).toBeVisible();
   expect(await page.locator('[data-ad-placement="top"]').count()).toBe(1);
   expect(await page.locator('[data-ad-placement="bottom"]').count()).toBe(1);
   expect(await page.locator('[data-ad-placement="right"]').count()).toBe(1);
   expect(await page.locator('script[src*="adsbygoogle"]').count()).toBe(0);
   expect(response?.headers()["x-robots-tag"]).toMatch(/noindex/i);
  }
 });
}
test("synthetic article/phone metadata are distinct and never claim a public canonical domain",async({page})=>{
 for(const [uri,marker] of [
   ["/haberler/ci-api-published-news","CI API: Synthetic TopWhiz Article"],
   ["/telefonlar/ci-api-published-phone","CI API: Synthetic 256 GB Phone"]
 ]){
  const response=await page.goto(uri,{waitUntil:"networkidle"});
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(new RegExp("TOPWHIZ"));
  const title=await page.title();
  expect(title).toContain(marker);
  const description=await page.locator('meta[name="description"]').getAttribute("content");
  expect(description?.length).toBeGreaterThan(20);
  expect(await page.locator('link[rel="canonical"]').count()).toBe(0);
  await expect(page.locator('main#main')).toBeVisible();
  const img=page.locator('img[src="/media/cms/ci-ssr-hero"]');
  await expect(img).toHaveAttribute("alt",/\S+/);
  await expect.poll(()=>img.evaluate((x:HTMLImageElement)=>x.naturalWidth>0&&x.complete)).toBe(true);
 }
});
test("synthetic 12 parallel cached-page reads within bounded CI time; no real merchant results",async({request})=>{
 const paths=["/haberler","/telefonlar","/"];
 const t0=Date.now();
 const results=await Promise.all(Array.from({length:12},(_,i)=>request.get(paths[i%paths.length])));
 const elapsed=Date.now()-t0;
 expect(results.every(r=>r.status()===200)).toBe(true);
 expect(elapsed).toBeLessThan(12000);
 for(const r of results){
  expect(r.headers()["x-robots-tag"]).toMatch(/noindex/i);
  expect(await r.text()).not.toContain("adsbygoogle");
 }
});
test("keyboard navigation and two detail pages produce no serious or critical automated WCAG findings",async({page})=>{
 await page.goto("/haberler/ci-api-published-news");
 await page.keyboard.press("Tab");
 await expect(page.getByRole("link",{name:"İçeriğe geç"})).toBeFocused();
 await page.keyboard.press("Enter");
 await expect(page.locator("main#main")).toBeFocused();
 for(const route of ["/haberler/ci-api-published-news","/telefonlar/ci-api-published-phone"]){
  await page.goto(route);
  const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
  expect(axe.violations.filter(v=>["serious","critical"].includes(v.impact??""))
    .map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length}))).toEqual([]);
 }
});
