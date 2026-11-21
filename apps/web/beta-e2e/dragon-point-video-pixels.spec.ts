import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";

const fixture = join(process.cwd(), "beta-e2e/fixtures/dragon-video-synthetic-ci.mp4");
const uri = "/dragon-point-video/";
type RGBA=[number,number,number,number];
type Samples={background:RGBA;body:RGBA;orange:RGBA;core:RGBA;fringe:RGBA};

async function loadMedia(page:Page,forceCanvas:boolean) {
 if(forceCanvas) await page.addInitScript(()=>{
  const get=HTMLCanvasElement.prototype.getContext as any;
  HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:any,...args:any[]){
   if(type==="webgl"||type==="experimental-webgl")return null;
   return get.apply(this,[type,...args]);
  } as any;
 });
 await page.goto(uri);
 await page.locator("#file").setInputFiles(fixture);
 await expect.poll(()=>page.evaluate(()=>Boolean((window as any).__dpVideoPreview?.ready))).toBe(true);
 const renderer=await page.evaluate(()=>(window as any).__dpVideoPreview.renderer);
 if(renderer!==(forceCanvas?"cpu":"gpu"))return renderer;
 await page.locator("#play").click();
 await expect.poll(()=>page.locator("#video").evaluate((v:HTMLVideoElement)=>v.currentTime),{timeout:10000}).toBeGreaterThan(0.08);
 await page.locator("#pause").click();
 await page.locator("#video").evaluate((v:HTMLVideoElement)=>new Promise<void>((resolve,reject)=>{
  const guard=setTimeout(()=>reject(new Error("video seek timed out")),7000);
  v.addEventListener("seeked",()=>{clearTimeout(guard);resolve()},{once:true});
  v.currentTime=7;
 }));
 await expect(page.locator("#stage")).toHaveClass(/burning/);
 // A fresh decoded frame should be available; CPU may be deliberately rate-limited.
 await page.waitForTimeout(110);
 return renderer;
}

async function sample(page:Page):Promise<Samples> {
 return page.evaluate(()=>{
  const d=(window as any).__dpVideoPreview;
  const point=(x:number,y:number)=>d.probe(x/1280,y/720);
  return {background:point(1050,110),body:point(200,340),orange:point(690,330),core:point(1150,365),fringe:point(665,350)};
 });
}

function checkMatte(samples:Samples){
 const {background,body,orange,core,fringe}=samples;
 for(const [key,px] of Object.entries(samples)){
  expect(px, key+" has RGBA samples").toHaveLength(4);
 }
 expect(background[3],"pure greenscreen must become transparent").toBeLessThan(35);
 expect(body[3],"dragon red body must remain opaque").toBeGreaterThan(215);
 expect(body[0],"red body must retain its color").toBeGreaterThan(190);
 expect(orange[3],"orange flame must remain opaque").toBeGreaterThan(215);
 expect(orange[0],"flame must retain intense red").toBeGreaterThan(190);
 expect(orange[1],"flame must retain yellow/orange").toBeGreaterThan(85);
 expect(core[3],"white/yellow flame core must remain opaque").toBeGreaterThan(215);
 expect(core[0],"flame core red channel").toBeGreaterThan(190);
 expect(core[1],"flame core yellow channel").toBeGreaterThan(185);
 expect(fringe[3],"soft keyed edge must not vanish").toBeGreaterThan(20);
 expect(fringe[3],"soft keyed edge must not remain opaque").toBeLessThan(240);
 expect(fringe[1],"green halo must be suppressed").toBeLessThanOrEqual(Math.max(fringe[0],fringe[2])+40);
}

for(const size of [{name:"desktop 1365",w:1365,h:940},{name:"mobile 390",w:390,h:844}]){
 for(const mode of ["gpu","cpu"] as const){
  test("Dragon Point chromakey pixels "+size.name+" "+mode,async({page},testInfo)=>{
   await page.setViewportSize({width:size.w,height:size.h});
   const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
   const active=await loadMedia(page,mode==="cpu");
   if(mode==="gpu" && active!=="gpu")test.skip(true,"GPU WebGL context unavailable: measure as NOT_RUN, never counterfeit GPU PASS");
   expect(active).toBe(mode);
   const pixels=await sample(page);
   checkMatte(pixels);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   expect(overflow).toBeLessThanOrEqual(2);
   if(size.name.startsWith("desktop")){
    const overlap=await page.evaluate(()=>{
     const box=(id:string)=>document.getElementById(id)!.getBoundingClientRect();
     const stage=box("stage"),ring=box("ring"),c=box("key");
     const canvas=document.getElementById("key") as HTMLCanvasElement;
     const sourceWidth=1280,sourceHeight=720;
     const scale=Math.min(c.width/sourceWidth,c.height/sourceHeight);
     const top=(c.height-sourceHeight*scale)/2+c.top;
     // The synthetic 24 FPS source includes a bright flame core at x=1150,y=365.
     const flameX=c.left+1150*scale,flameY=top+365*scale;
     const ringX=ring.left+ring.width/2,ringY=ring.top+ring.height/2;
     return {distance:Math.hypot(flameX-ringX,flameY-ringY),radius:ring.width/2,
      inside:flameX>=stage.left&&flameX<=stage.right&&flameY>=stage.top&&flameY<=stage.bottom,
      clipSafe:Math.abs(c.height-sourceHeight*scale)<0.5||Math.abs(c.width-sourceWidth*scale)<0.5,
      visibleFlameX:flameX,ringCenterX:ringX,viewportWidth:window.innerWidth,
      stageWidth:stage.width,stageHeight:stage.height};
    });
    expect(overlap.inside).toBe(true);
    expect(overlap.clipSafe,"contain must preserve entire video without cropping").toBe(true);
    expect(overlap.stageWidth).toBeGreaterThan(1150);
    expect(overlap.stageHeight).toBeGreaterThanOrEqual(590);
    expect(overlap.distance,"flame must physically strike inside the score ring").toBeLessThan(overlap.radius*.85);
    await testInfo.attach("desktop-flame-score-ring-overlap",{body:await page.screenshot({fullPage:true}),contentType:"image/png"});
    await testInfo.attach("desktop-matte-rgba",{body:Buffer.from(JSON.stringify({pixels,overlap},null,2)),contentType:"application/json"});
   }
   expect(errors).toEqual([]);
  });
 }
}

test("synthetic GPU and Canvas chromakey preserve body/fire and limit alpha fringe drift",async({page,context})=>{
 await page.setViewportSize({width:1365,height:940});
 const renderer=await loadMedia(page,false);
 if(renderer!=="gpu")test.skip(true,"No WebGL context; cannot assert GPU/Canvas parity");
 const gpu=await sample(page);
 checkMatte(gpu);
 const fallback=await context.newPage();
 try{
  await fallback.setViewportSize({width:1365,height:940});
  await loadMedia(fallback,true);
  const cpu=await sample(fallback);
  checkMatte(cpu);
  for(const k of ["background","body","orange","core","fringe"] as const){
   expect(Math.abs(gpu[k][3]-cpu[k][3]),k+" alpha drift GPU/Canvas").toBeLessThanOrEqual(80);
  }
  for(const k of ["body","orange","core"] as const){
   for(const i of [0,1,2]){
    expect(Math.abs(gpu[k][i]-cpu[k][i]),k+" color parity channel "+i).toBeLessThanOrEqual(65);
   }
  }
 }finally{await fallback.close();}
});
