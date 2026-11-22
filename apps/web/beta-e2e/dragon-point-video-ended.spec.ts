import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

// Purely synthetic 1280x720/24FPS/15s fixture. The 360th frame alone gets a
// magenta marker; the unchanged green area is keyed transparent on frames 1-359.
const source=join(process.cwd(),"beta-e2e/fixtures/dragon-video-synthetic-ci.mp4");
const marked=join(process.cwd(),"beta-e2e/fixtures/dragon-video-last-frame-synthetic-ci.mp4");

test.beforeAll(()=>{
 execFileSync("ffmpeg",["-nostdin","-hide_banner","-loglevel","error","-y",
  "-i",source,"-vf","drawbox=x=1040:y=65:w=100:h=100:color=magenta:t=fill:enable='eq(n,359)'",
  "-pix_fmt","yuv420p","-c:v","libx264","-preset","ultrafast","-crf","36","-movflags","+faststart",marked]);
 const meta=JSON.parse(execFileSync("ffprobe",["-v","error","-select_streams","v:0",
  "-show_entries","stream=width,height,avg_frame_rate,nb_frames,duration","-of","json",marked],{encoding:"utf8"}));
 const v=meta.streams?.[0];
 expect([v?.width,v?.height,v?.avg_frame_rate,Number(v?.nb_frames),Number(v?.duration)]).toEqual([1280,720,"24/1",360,15]);
});

for(const size of [{name:"desktop",width:1365,height:900},{name:"mobile",width:390,height:844}]){
 for(const mode of ["gpu","cpu"] as const){
 test("natural ended paints actual last synthetic frame "+size.name+" "+mode,async({page})=>{
  await page.setViewportSize({width:size.width,height:size.height});
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(({forceCPU})=>{
   type Evidence={renderer:string,time:number,pixel:number[]};
   const captured:Evidence[]=[];
   (window as any).__dpLastFrameEvidence=captured;
   const sampleX=(width:number)=>Math.min(width-1,Math.floor(1090*width/1280));
   const sampleY=(height:number)=>Math.min(height-1,Math.floor(115*height/720));
   function observe(renderer:string,pixel:Uint8Array|Uint8ClampedArray){
    const video=document.getElementById("video") as HTMLVideoElement|null;
    captured.push({renderer,time:video?.currentTime||0,pixel:Array.from(pixel)});
    if(captured.length>20)captured.shift();
   }
   const nativePut=CanvasRenderingContext2D.prototype.putImageData;
   CanvasRenderingContext2D.prototype.putImageData=function(this:CanvasRenderingContext2D,...args:any[]){
    const result=(nativePut as any).apply(this,args);
    if(this.canvas.id==="key"){
     const x=sampleX(this.canvas.width),y=sampleY(this.canvas.height);
     observe("cpu",this.getImageData(x,y,1,1).data);
    }
    return result;
   } as any;
   if(typeof WebGLRenderingContext!=="undefined"){
    const nativeDraw=WebGLRenderingContext.prototype.drawArrays;
    WebGLRenderingContext.prototype.drawArrays=function(this:WebGLRenderingContext,...args:any[]){
     (nativeDraw as any).apply(this,args);
     if((this.canvas as HTMLCanvasElement)?.id==="key"){
      const width=this.drawingBufferWidth,height=this.drawingBufferHeight;
      const pixel=new Uint8Array(4);
      this.readPixels(sampleX(width),height-1-sampleY(height),1,1,this.RGBA,this.UNSIGNED_BYTE,pixel);
      observe("gpu",pixel);
     }
    } as any;
   }
   if(forceCPU){
    const get=HTMLCanvasElement.prototype.getContext as any;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:any,...args:any[]){
     if(type==="webgl"||type==="experimental-webgl")return null;
     return get.apply(this,[type,...args]);
    } as any;
   }
   // Test the adversarial case: both decoded-frame callbacks and late RAF
   // renders are unavailable, but video playback must naturally reach ended.
   (HTMLVideoElement.prototype as any).requestVideoFrameCallback=()=>123;
   (HTMLVideoElement.prototype as any).cancelVideoFrameCallback=()=>{};
   const raf=window.requestAnimationFrame.bind(window);
   window.requestAnimationFrame=((cb:FrameRequestCallback)=>raf(t=>{
    const video=document.getElementById("video") as HTMLVideoElement|null;
    if(video&&video.currentTime>=14.85)return;
    cb(t);
   })) as typeof window.requestAnimationFrame;
  },{forceCPU:mode==="cpu"});
  await page.goto("/dragon-point-video/");
  await page.locator("#less").uncheck();
  await page.locator("#file").setInputFiles(marked);
  await expect.poll(()=>page.evaluate(()=>Boolean((window as any).__dpVideoPreview?.ready))).toBe(true);
  const actual=await page.evaluate(()=>(window as any).__dpVideoPreview.renderer);
  if(mode==="gpu"&&actual!=="gpu")test.skip(true,"GPU WebGL unavailable: NOT_RUN, never GPU PASS");
  expect(actual).toBe(mode);
  await page.locator("#play").click();
  await expect.poll(()=>page.locator("#video").evaluate((v:HTMLVideoElement)=>v.currentTime),{timeout:10000}).toBeGreaterThan(0.05);
  await page.locator("#pause").click();
  await page.locator("#video").evaluate((v:HTMLVideoElement)=>new Promise<void>((resolve,reject)=>{
   const timer=window.setTimeout(()=>reject(new Error("seeked timeout")),7000);
   v.addEventListener("seeked",()=>{clearTimeout(timer);resolve()},{once:true});
   v.currentTime=14.7;
  }));
  const before=await page.evaluate(()=>((window as any).__dpLastFrameEvidence as Array<any>).at(-1));
  expect(before?.renderer).toBe(mode);
  expect(before?.pixel[3],"before last frame green background must be transparent").toBeLessThan(60);
  await page.locator("#pause").click();
  await expect.poll(()=>page.locator("#video").evaluate((v:HTMLVideoElement)=>v.ended),{timeout:10000}).toBe(true);
  await expect(page.locator("#score")).toHaveText("842");
  await expect(page.locator("#stage")).toHaveAttribute("data-phase","complete");
  await expect(page.locator("#stage")).not.toHaveClass(/burning/);
  const after=await page.evaluate(()=>((window as any).__dpLastFrameEvidence as Array<any>).at(-1));
  expect(after?.renderer).toBe(mode);
  expect(after?.time,"last Canvas draw must occur at natural media end").toBeGreaterThanOrEqual(14.99);
  expect(after?.pixel[0],"last-frame magenta red").toBeGreaterThan(175);
  expect(after?.pixel[1],"last-frame magenta green").toBeLessThan(120);
  expect(after?.pixel[2],"last-frame magenta blue").toBeGreaterThan(175);
  expect(after?.pixel[3],"last-frame marker must remain opaque").toBeGreaterThan(220);
  expect(errors).toEqual([]);
 });
 }
}
