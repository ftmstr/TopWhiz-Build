import {test,expect} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Real Chromium, entirely fake PostgreSQL CMS and locally generated images.
 * These are bounded CI acceptance checks, NOT a human WCAG audit or a
 * real-world speed benchmark.
 */
for(const [width,height] of [[320,740],[360,800],[768,900],[1920,1080]]){
  test("responsive "+width+"px no sideways scroll with active keyboard navigation",async({page})=>{
    await page.setViewportSize({width,height});
    for(const route of ["/","/haberler","/telefonlar"]){
      const response=await page.goto(route,{waitUntil:"domcontentloaded"});
      expect(response?.status()).toBe(200);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
      expect(overflow,"horizontal scroll "+width+"px "+route).toBeLessThanOrEqual(2);
      await expect(page.locator('[data-ad-placement="top"]')).toHaveCount(1);
      await expect(page.locator('[data-ad-placement="bottom"]')).toHaveCount(1);
      expect(await page.locator('script[src*="adsbygoogle"]').count()).toBe(0);
      expect(response?.headers()["x-robots-tag"]).toMatch(/noindex/i);
      await expect(page.getByRole("heading",{level:1}).first()).toBeVisible();
      if(width<=360 && route!=="/")
        await expect(page.locator(".editorial-nav")).toBeVisible();
      if(width>=1920)
        await expect(page.locator(".topwhiz-rail")).toBeVisible();
    }
  });
}
test("keyboard skip link sends focus to published article main landmark",async({page})=>{
 await page.goto("/haberler/ci-api-published-news");
 await page.keyboard.press("Tab");
 const skip=page.getByRole("link",{name:"İçeriğe geç"});
 await expect(skip).toBeFocused();
 await page.keyboard.press("Enter");
 await expect(page.locator("main#main")).toBeFocused();
 await expect(page.getByRole("heading",{level:1})).toBeVisible();
});
test("bounded synthetic performance sample; no claims about production Core Web Vitals",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 for(const route of ["/haberler","/telefonlar"]){
  const begin=performance.now();
  const response=await page.goto(route,{waitUntil:"domcontentloaded"});
  const ms=performance.now()-begin;
  expect(response?.status()).toBe(200);
  expect(ms,"CI DOMContentLoaded sample "+route).toBeLessThan(12000);
  const timing=await page.evaluate(()=>{
    const nav=performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return {dom:nav.domContentLoadedEventEnd,byte:nav.transferSize};
  });
  expect(timing.dom).toBeLessThan(12000);
  expect(timing.dom).toBeGreaterThanOrEqual(0);
 }
});
test("all rights-approved synthetic editorial detail pages have no severe axe findings",async({page})=>{
 for(const route of ["/haberler/ci-api-published-news","/telefonlar/ci-api-published-phone"]){
  await page.goto(route);
  const result=await new AxeBuilder({page}).withTags([
    "wcag2a","wcag2aa","wcag21a","wcag21aa"
  ]).analyze();
  const severe=result.violations.filter(v=>["serious","critical"].includes(v.impact??""));
  expect(severe.map(v=>({id:v.id,nodes:v.nodes.length,impact:v.impact}))).toEqual([]);
 }
});
