import { test, expect } from "@playwright/test";

for (const viewport of [
  {name:"desktop",width:1440,height:900},
  {name:"mobile",width:390,height:844},
  {name:"small-mobile",width:360,height:760}
]) {
  test("Dragon Point signature "+viewport.name+": real Chromium wake, fire, count and sleep",async({page})=>{
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    const external:string[]=[];
    page.on("request",r=>{
      const h=new URL(r.url()).hostname;
      if(!["127.0.0.1","localhost"].includes(h))external.push(r.url());
    });
    await page.goto("/dragon-point",{waitUntil:"domcontentloaded"});
    const scene=page.getByTestId("dragon-point-scene");
    await expect(scene).toBeVisible();
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute("data-mode","demo");
    await expect(scene).toContainText("KURGUSAL ANİMASYON DEMOSU");
    const dragon=scene.locator('img[src*="TopWhiz_Logo_02_KirmiziSariMavi"]');
    await expect(dragon).toHaveCount(1);
    await expect(scene).toHaveAttribute("data-phase","fire",{timeout:9000});
    await expect(scene.getByTestId("dragon-point-number")).not.toHaveText("842");
    await expect(scene.getByTestId("dragon-point-number")).toHaveText("842",{timeout:8000});
    await expect(scene).toHaveAttribute("data-phase","asleep",{timeout:9000});
    await expect(scene.locator(".dp-cine-fire")).not.toHaveClass(/is-active/);
    const width=await page.evaluate(()=>document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(viewport.width+2);
    expect(external).toEqual([]);
    const replay=scene.getByRole("button",{name:"Animasyonu yeniden izle"});
    await expect(replay).toBeEnabled();
    await replay.click();
    await expect(scene).toHaveAttribute("data-phase","fire",{timeout:9000});
    await expect(scene.getByTestId("dragon-point-number")).toHaveText("842",{timeout:8000});
  });
}

test("reduced motion immediately reveals accessible fictional number without dragon fire",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.setViewportSize({width:390,height:844});
  await page.goto("/dragon-point",{waitUntil:"domcontentloaded"});
  const scene=page.getByTestId("dragon-point-scene");
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute("data-motion","reduced");
  await expect(scene.getByTestId("dragon-point-number")).toHaveText("842");
  await expect(scene).not.toHaveAttribute("data-phase","fire");
  await expect(scene).toContainText("KURGUSAL ANİMASYON DEMOSU");
});

test("production-facing demonstration cannot masquerade as a scored real phone",async({page})=>{
  await page.goto("/dragon-point",{waitUntil:"domcontentloaded"});
  const scene=page.getByTestId("dragon-point-scene");
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toContainText("Yalnızca görsel efekt önizlemesi");
  await expect(scene).toContainText("Gerçek telefon puanı değildir");
  await expect(page).toHaveTitle(/Dragon Point/);
  expect(await page.locator("canvas, video").count()).toBe(0);
});
