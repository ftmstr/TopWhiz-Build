import {test,expect} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/* All data are synthetic / self-generated; no real website published.
   Checks are responsive/automated and cannot establish formal WCAG
   compliance or production Core Web Vitals.
 */
for(const [width,height] of [[344,740],[414,896],[834,1112],[1100,800],[1600,900]]){
  test("TUR013 "+width+"x"+height+" no visual overflow / noindex / inert Ads",async({page})=>{
    await page.setViewportSize({width,height});
    for(const pathname of ["/","/haberler","/telefonlar"]){
      const r=await page.goto(pathname,{waitUntil:"domcontentloaded"});
      expect(r?.status()).toBe(200);
      expect(r?.headers()["x-robots-tag"]).toMatch(/noindex/i);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
        .toBeLessThanOrEqual(2);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("heading",{level:1}).first()).toBeVisible();
      for(const placement of ["top","right","bottom"]){
        await expect(page.locator('[data-ad-placement="'+placement+'"]')).toHaveCount(1);
      }
      expect(await page.locator('script[src*="adsbygoogle"]').count()).toBe(0);
      expect(await page.locator('link[rel="canonical"]').count()).toBe(0);
    }
  });
}
test("TUR013 public CMS response cannot become indexable or enable prices/ads",async({page,request})=>{
 for(const path of ["/haberler/ci-api-published-news","/telefonlar/ci-api-published-phone"]){
  const response=await page.goto(path,{waitUntil:"networkidle"});
  expect(response?.status()).toBe(200);
  const robots=await page.locator('meta[name="robots"]').getAttribute("content");
  expect(robots).toMatch(/noindex/i);
  const image=page.locator('img[src="/media/cms/ci-ssr-hero"]');
  await expect.poll(()=>image.evaluate((e:HTMLImageElement)=>e.complete&&e.naturalWidth>0)).toBe(true);
 }
 const notFound=await request.get("/haberler/ci-tur013-not-published");
 expect(notFound.status()).toBe(404);
 const robots=await request.get("/robots.txt");
 expect(await robots.text()).toMatch(/Disallow:\s*\//);
});
test("TUR013 axe serious/critical + keyboard skip test on both editorial types",async({page})=>{
 await page.goto("/haberler/ci-api-published-news");
 await page.keyboard.press("Tab");
 await expect(page.getByRole("link",{name:"İçeriğe geç"})).toBeFocused();
 await page.keyboard.press("Enter");
 await expect(page.locator("main#main")).toBeFocused();
 for(const path of ["/haberler/ci-api-published-news","/telefonlar/ci-api-published-phone"]){
  await page.goto(path);
  const report=await new AxeBuilder({page}).withTags([
    "wcag2a","wcag2aa","wcag21a","wcag21aa"
  ]).analyze();
  expect(report.violations.filter(x=>["serious","critical"].includes(x.impact??""))
    .map(v=>({id:v.id,impact:v.impact,count:v.nodes.length}))).toEqual([]);
 }
});
test("TUR013 24 concurrent local HTTP reads complete within synthetic CI bound",async({request})=>{
 const begin=Date.now();
 const routes=["/","/haberler","/telefonlar"];
 const results=await Promise.all(Array.from({length:24},(_,i)=>request.get(routes[i%3])));
 expect(results.every(x=>x.status()===200)).toBe(true);
 expect(Date.now()-begin).toBeLessThan(12000);
});
