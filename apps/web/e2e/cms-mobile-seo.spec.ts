import {test,expect} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const routes=[
  {url:"/",text:"CI API: Synthetic TopWhiz Article"},
  {url:"/haberler",text:"CI API: Synthetic TopWhiz Article"},
  {url:"/haberler/ci-api-published-news",text:"CI API: Synthetic TopWhiz Article"},
  {url:"/telefonlar",text:"CI API: Synthetic 256 GB Phone"},
  {url:"/telefonlar/ci-api-published-phone",text:"CI-NOT-REAL"}
];
for(const variant of [
 {name:"desktop",viewport:{width:1440,height:900}},
 {name:"mobile",viewport:{width:390,height:844}}
]){
  test.describe(variant.name,()=>{
    test.use({viewport:variant.viewport,deviceScaleFactor:1});
    for(const route of routes){
      test(route.url+" content, semantics, mobile width and inactive ads",async({page},testInfo)=>{
        const response=await page.goto(route.url,{waitUntil:"networkidle"});
        expect(response?.status()).toBe(200);
        await expect(page.locator("main").first()).toBeVisible();
        await expect(page.getByRole("heading",{level:1}).first()).toBeVisible();
        await expect(page.getByText(route.text).first()).toBeVisible();
        await expect(page.locator('[data-ad-placement="top"]')).toHaveCount(1);
        await expect(page.locator('[data-ad-placement="bottom"]')).toHaveCount(1);
        await expect(page.locator('[data-ad-placement="right"]')).toHaveCount(1);
        const overflow=await page.evaluate(()=>
          document.documentElement.scrollWidth-window.innerWidth);
        expect(overflow,"horizontal overflow at "+variant.name+" "+route.url).toBeLessThanOrEqual(2);
        const meta=await page.locator('meta[name="robots"]').getAttribute("content");
        expect(meta?.toLowerCase()).toContain("noindex");
        expect(response?.headers()["x-robots-tag"]).toContain("noindex");
        expect(await page.locator('script[src*="adsbygoogle"]').count()).toBe(0);
        if(variant.name==="desktop")
          await expect(page.locator(".topwhiz-rail")).toBeVisible();
        if(variant.name==="mobile"&&route.url!=="/")
          await expect(page.locator(".editorial-nav")).toBeVisible();
        if(route.url.endsWith("ci-api-published-news")||route.url.endsWith("ci-api-published-phone")){
          const image=page.locator('img[src="/media/cms/ci-ssr-hero"]');
          await expect(image).toBeVisible();
          expect(await image.getAttribute("alt")).toBeTruthy();
          await expect.poll(()=>image.evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
        }
        await page.screenshot({
          path:testInfo.outputPath(variant.name+"-"+route.url.replaceAll("/","_")+"-synthetic.png"),
          fullPage:true
        });
      });
    }
    test("WCAG critical/serious automated scan (not a certification)",async({page})=>{
      await page.goto("/haberler/ci-api-published-news");
      const report=await new AxeBuilder({page}).withTags([
        "wcag2a","wcag2aa","wcag21a","wcag21aa"
      ]).analyze();
      const severe=report.violations.filter(x=>["critical","serious"].includes(x.impact??""));
      expect(severe.map(x=>({id:x.id,impact:x.impact,help:x.help,nodes:x.nodes.length}))).toEqual([]);
    });
    test("robots.txt blocks indexing and unknown article is 404",async({page,request})=>{
      const robots=await request.get("/robots.txt");
      expect(robots.status()).toBe(200);
      expect(await robots.text()).toMatch(/Disallow:\s*\//);
      const missing=await page.goto("/haberler/ci-not-published");
      expect(missing?.status()).toBe(404);
    });
  });
}
