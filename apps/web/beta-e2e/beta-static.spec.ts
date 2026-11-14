import { test, expect } from "@playwright/test";

for (const v of [{name:"desktop",width:1365,height:900},{name:"mobile",width:390,height:844}]) {
  test("TOPWHIZ static beta "+v.name+": responsive functional catalog and compare",async({page})=>{
    await page.setViewportSize({width:v.width,height:v.height});
    const unexpectedRequests:string[]=[];
    page.on("request",req=>{
      const url=new URL(req.url());
      if(!["localhost","127.0.0.1"].includes(url.hostname))unexpectedRequests.push(req.url());
    });
    await page.goto("http://127.0.0.1:4173/",{waitUntil:"load"});
    await expect(page.getByRole("heading",{name:/Teknolojiyi keşfet/})).toBeVisible();
    await expect(page.getByText("TOPWHIZ BETA")).toBeVisible();
    await expect(page.locator(".device-card")).toHaveCount(9);
    await page.getByRole("button",{name:"Tablet",exact:true}).click();
    await expect(page.locator(".device-card")).toHaveCount(2);
    await expect(page.locator("#result-count")).toContainText("2 örnek cihaz");
    await page.getByRole("button",{name:"Tümü",exact:true}).click();
    await page.locator("#search").fill("Orion");
    await expect(page.locator(".device-card")).toHaveCount(2);
    await page.locator("#search").fill("");
    await page.locator("#left-device").selectOption("terra-tab");
    await page.locator("#right-device").selectOption("nebula-pro");
    await expect(page.locator("#compare-output .compare-row")).toHaveCount(8);
    await expect(page.locator("#compare-output")).toContainText("Terra Tab");
    await expect(page.locator("#compare-output")).toContainText("Nebula Pro");
    await expect(page.locator("#compare-output")).toContainText("DEMO");
    const scrollWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(v.width+2);
    expect(unexpectedRequests).toEqual([]);
  });
}
test("TOPWHIZ beta does not reveal real catalog/prices or connect to backend",async({page})=>{
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.getByText(/tüm cihaz isimleri ve özellikleri kurgusaldır/i)).toBeVisible();
  await expect(page.getByText(/gerçek haber yayını henüz açık değil/i)).toBeVisible();
  await expect(page.locator("a[href*='checkout'],a[href*='affiliate']")).toHaveCount(0);
  await expect(page.locator("script[src^='http']")).toHaveCount(0);
  const robots=await page.request.get("http://127.0.0.1:4173/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Disallow: /");
});
