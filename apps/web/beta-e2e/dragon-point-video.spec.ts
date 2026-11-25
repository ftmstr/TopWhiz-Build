import { test, expect } from "@playwright/test";
import { join } from "node:path";

const testFile = join(process.cwd(), "beta-e2e/fixtures/dragon-video-synthetic-ci.mp4");
const uri = "/dragon-point-video/";
for (const size of [{name:"desktop",width:1365,height:900},{name:"mobile",width:390,height:844}]) {
 test("Dragon Point 24FPS local MP4 "+size.name+" runs the single-flame ring/score without remote requests", async ({page}) => {
  await page.setViewportSize({width:size.width,height:size.height});
  const errors:string[] = [];const requests:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("request",request=>{const url=new URL(request.url());if(!["127.0.0.1","localhost"].includes(url.hostname)&&url.protocol!=="blob:")requests.push(request.url());});
  await page.goto(uri);
  await expect(page.getByText("KURGUSAL DEMO", {exact:false})).toBeVisible();
  await expect(page.locator("#play")).toBeDisabled();
  await page.locator("#file").setInputFiles(testFile);
  await expect.poll(async()=>page.evaluate(()=>Boolean((window as any).__dpVideoPreview?.ready))).toBe(true);
  await expect.poll(async()=>page.evaluate(()=>(window as any).__dpVideoPreview.renderer)).toMatch(/gpu|cpu/);
  await page.locator("#play").click();
  await expect.poll(async()=>page.locator("#video").evaluate((v:HTMLVideoElement)=>v.currentTime),{timeout:10000}).toBeGreaterThan(0.08);
  await page.evaluate(()=>(window as any).__dpVideoPreview.seek(4.9));
  await expect(page.locator("#stage")).toHaveClass(/burning/);
  await expect(page.locator("#score")).not.toHaveText("842");
  await page.evaluate(()=>(window as any).__dpVideoPreview.seek(13));
  await expect(page.locator("#score")).toHaveText("842");
  await expect(page.locator("#stage")).toHaveClass(/burning/);
  await page.evaluate(()=>(window as any).__dpVideoPreview.seek(0));
  await expect(page.locator("#score")).toHaveText("0");
  await page.locator("#pause").click();
  await expect.poll(async()=>page.evaluate(()=>(window as any).__dpVideoPreview.painted)).toBeGreaterThan(0);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);expect(requests).toEqual([]);
 });
}
test("Dragon Point is playable when GPU WebGL creation is unavailable (2D fallback)",async({page})=>{
 await page.addInitScript(()=>{
  const get=HTMLCanvasElement.prototype.getContext as any;
  HTMLCanvasElement.prototype.getContext=function(this: HTMLCanvasElement,type:any,...args:any[]) {
   if(type==="webgl"||type==="experimental-webgl")return null;
   return get.apply(this,[type,...args]);
  } as any;
 });
 await page.goto(uri);
 await page.locator("#file").setInputFiles(testFile);
 await expect.poll(async()=>page.evaluate(()=>(window as any).__dpVideoPreview.renderer)).toBe("cpu");
 await expect(page.locator("#play")).toBeEnabled();
 await page.locator("#play").click();
 await expect.poll(async()=>page.evaluate(()=>(window as any).__dpVideoPreview.painted),{timeout:10000}).toBeGreaterThan(0);
 await page.evaluate(()=>(window as any).__dpVideoPreview.seek(13));
 await expect(page.locator("#score")).toHaveText("842");
});
test("Reduced motion shows finished fictional count without autoplay",async({page})=>{
 await page.goto(uri);
 await page.locator("#file").setInputFiles(testFile);
 await expect(page.locator("#play")).toBeEnabled();
 await page.locator("#less").check();
 await page.locator("#play").click();
 await expect(page.locator("#score")).toHaveText("842");
 const paused=await page.locator("#video").evaluate((v:HTMLVideoElement)=>v.paused);
 expect(paused).toBe(true);
});
test("Safari-like stalled decoded-video callback uses bounded RAF rescue without a frozen dragon",async({page})=>{
 await page.addInitScript(()=>{
  (HTMLVideoElement.prototype as any).requestVideoFrameCallback=function(_cb:any){return 12345};
  (HTMLVideoElement.prototype as any).cancelVideoFrameCallback=function(_id:any){};
 });
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(uri);
 await page.locator("#file").setInputFiles(testFile);
 await expect.poll(async()=>page.evaluate(()=>(window as any).__dpVideoPreview.ready)).toBe(true);
 await page.locator("#play").click();
 await expect.poll(async()=>page.evaluate(()=>(window as any).__dpVideoPreview.rescueFrames),{timeout:10000}).toBeGreaterThan(1);
 await expect.poll(async()=>page.evaluate(()=>(window as any).__dpVideoPreview.painted),{timeout:10000}).toBeGreaterThan(1);
 const duration=await page.locator("#video").evaluate((v:HTMLVideoElement)=>v.duration);
 expect(duration).toBeGreaterThanOrEqual(14.5);
 await page.evaluate(()=>(window as any).__dpVideoPreview.seek(13));
 await expect(page.locator("#score")).toHaveText("842");
 expect(errors).toEqual([]);
});

for (const size of [{name:"desktop",width:1365,height:900},{name:"mobile",width:390,height:844}]) {
 test("Dragon Point Canvas painted counts writes, not throttled requests "+size.name,async({page})=>{
  await page.setViewportSize({width:size.width,height:size.height});
  await page.addInitScript(()=>{
   const get=HTMLCanvasElement.prototype.getContext as any;
   HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:any,...args:any[]){
    if(type==="webgl"||type==="experimental-webgl")return null;
    return get.apply(this,[type,...args]);
   } as any;
   const nativePut=CanvasRenderingContext2D.prototype.putImageData as any;
   let writes=0;
   CanvasRenderingContext2D.prototype.putImageData=function(this:CanvasRenderingContext2D,...args:any[]){
    const result=nativePut.apply(this,args);
    if(this.canvas.id==="key")writes++;
    return result;
   } as any;
   // Keep actual Chromium video decoding and native Canvas writes. Control only
   // callback delivery and clock during a synchronous, deliberately throttled burst.
   let pending:((now:number,metadata:any)=>void)|null=null,id=0;
   (HTMLVideoElement.prototype as any).requestVideoFrameCallback=function(cb:any){pending=cb;return ++id};
   (HTMLVideoElement.prototype as any).cancelVideoFrameCallback=function(token:number){if(token===id)pending=null};
   (window as any).__dpPaintQA={burst(){
    const realNow=performance.now.bind(performance);
    const now=realNow()+1000;
    const previous=Object.getOwnPropertyDescriptor(performance,"now");
    const beforeWrites=writes,beforePainted=(window as any).__dpVideoPreview.painted;
    Object.defineProperty(performance,"now",{configurable:true,value:()=>now});
    try{
     for(let i=0;i<10;i++){
      const cb=pending;
      if(!cb)throw Error("Missing scheduled frame callback");
      pending=null;cb(now,{});
     }
     return {writes:writes-beforeWrites,painted:(window as any).__dpVideoPreview.painted-beforePainted};
    }finally{
     if(previous)Object.defineProperty(performance,"now",previous);
     else delete (performance as any).now;
    }
   }};
  });
  await page.goto(uri);
  await page.locator("#file").setInputFiles(testFile);
  await expect.poll(async()=>page.evaluate(()=>(window as any).__dpVideoPreview.renderer)).toBe("cpu");
  await expect(page.locator("#play")).toBeEnabled();
  await page.locator("#play").click();
  await expect.poll(async()=>page.locator("#video").evaluate((v:HTMLVideoElement)=>v.currentTime),{timeout:10000}).toBeGreaterThan(0.08);
  const result=await page.evaluate(()=>(window as any).__dpPaintQA.burst());
  expect(result.writes).toBe(1);
  expect(result.painted).toBe(result.writes);
  await page.locator("#video").evaluate((v:HTMLVideoElement)=>v.pause());
 });
}
