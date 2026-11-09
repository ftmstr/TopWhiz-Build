import {test,expect} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Only localhost synthetic Next/PG fixtures; not live Cloudflare, WCAG
 * certification, independent security review or field Core Web Vitals.
 */
for(const [width,height] of [[390,844],[1366,768]]){
 test("TUR019 "+width+"x"+height+" unpublished preview/noindex/viewport and inert ads",async({page})=>{
  await page.setViewportSize({width,height});
  for(const path of ["/","/haberler","/telefonlar"]){
   const navStart=Date.now();
   const response=await page.goto(path,{waitUntil:"domcontentloaded"});
   expect(response?.status()).toBe(200);
   expect(Date.now()-navStart).toBeLessThan(20000);
   expect(response?.headers()["x-robots-tag"]).toMatch(/noindex/i);
   expect(await page.evaluate(()=>
    document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
   await expect(page.getByRole("main")).toHaveCount(1);
   await expect(page.getByRole("heading",{level:1})).toHaveCount(1);
   await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
   await expect(page.locator('script[src*="adsbygoogle"]')).toHaveCount(0);
   for(const name of ["top","right","bottom"])
    await expect(page.locator('[data-ad-placement="'+name+'"]')).toHaveCount(1);
  }
 });
}
test("TUR019 fictional revoked article and phone have no indexable content",async({request})=>{
 const urls=["/haberler/ci-tur019-withdrawn","/telefonlar/ci-tur019-unlicensed"];
 const results=await Promise.all(Array.from({length:24},(_,i)=>request.get(urls[i%2])));
 await assertNoAds(results);
 async function assertNoAds(rs){
  for(const response of rs){
   expect(response.status()).toBe(404);
   expect(response.headers()["x-robots-tag"]).toMatch(/noindex/i);
   expect(await response.text()).not.toContain("adsbygoogle.js");
  }
 }
});
test("TUR019 synthetic keyboard skip-link and axe serious/critical checks",async({page})=>{
 await page.goto("/haberler",{waitUntil:"domcontentloaded"});
 await page.keyboard.press("Tab");
 await expect(page.getByRole("link",{name:"İçeriğe geç"})).toBeFocused();
 await page.keyboard.press("Enter");
 await expect(page.locator("main#main")).toBeFocused();
 const result=await new AxeBuilder({page})
  .withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
 expect(result.violations.filter(x=>["serious","critical"].includes(x.impact??""))
  .map(x=>({id:x.id,nodes:x.nodes.length}))).toEqual([]);
});
