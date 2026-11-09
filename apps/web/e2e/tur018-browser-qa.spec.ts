import {test,expect} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// True Chromium in synthetic Next.js isolation. CI timing is a smoke
// bound, NOT field Core Web Vitals, LCP/INP certification or manual WCAG.
for(const [width,height] of [[352,780],[1440,900]]){
 test("TUR018 "+width+"x"+height+" local responsive/SEO/disabled ads",async({page})=>{
  await page.setViewportSize({width,height});
  for(const route of ["/","/haberler","/telefonlar"]){
   const began=Date.now();
   const res=await page.goto(route,{waitUntil:"domcontentloaded"});
   const localMs=Date.now()-began;
   expect(res?.status()).toBe(200);
   expect(res?.headers()["x-robots-tag"]).toMatch(/noindex/i);
   expect(localMs).toBeLessThan(20000);
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
test("TUR018 fictional revoked media and articles remain non-indexable",async({request})=>{
 const urls=["/haberler/ci-tur018-invalid","/telefonlar/ci-tur018-revoked"];
 const responses=await Promise.all(Array.from({length:24},(_,i)=>request.get(urls[i%2])));
 for(const response of responses){
  expect(response.status()).toBe(404);
  expect(response.headers()["x-robots-tag"]).toMatch(/noindex/i);
  expect(await response.text()).not.toContain("adsbygoogle.js");
 }
});
test("TUR018 keyboard skip link and automated axe listing check",async({page})=>{
 await page.goto("/telefonlar",{waitUntil:"domcontentloaded"});
 await page.keyboard.press("Tab");
 await expect(page.getByRole("link",{name:"İçeriğe geç"})).toBeFocused();
 await page.keyboard.press("Enter");
 await expect(page.locator("main#main")).toBeFocused();
 const result=await new AxeBuilder({page})
  .withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
 expect(result.violations.filter(x=>["serious","critical"].includes(x.impact??""))
  .map(x=>({id:x.id,nodes:x.nodes.length}))).toEqual([]);
});
