import {state,clamp,validateClipMetadata} from "./timing.mjs";
const $=id=>document.getElementById(id);
const file=$("file"),v=$("video"); let c=$("key"); const dragon=$("dragon"),ring=$("ring"),stage=$("stage"),score=$("score"),phase=$("phase"),clock=$("clock"),progress=$("progress"),play=$("play"),pause=$("pause"),target=$("target"),message=$("message"),less=$("less");
let sourceURL=null,renderer="none",ctx2d=null,gl=null,drawKey=null,raf=0,videoFrameId=0,ready=false,alphaPending=false,lang="tr",value=842;
let painted=0,rvfcFrames=0;
const dict={tr:{sleep:"UYUYOR",wake:"UYANIYOR",fire:"ATEŞ PÜSKÜRTÜYOR",cooldown:"ATEŞ KESİLDİ",return:"YENİDEN UYUYOR",complete:"TAMAMLANDI",play:"▶ Animasyonu oynat",replay:"↻ Tekrar oynat",pause:"Duraklat",resume:"Sürdür",gpu:"GPU yeşil perde etkin",cpu:"Canvas yeşil perde yedeği etkin",alpha:"Şeffaf WebM etkin",unsupported:"Bu video veya şeffaflık desteği yetersiz. Kaynak MP4 seçin.",invalid:"Yalnız MP4 veya WebM kabul edilir.",metadata:"Video 15 saniye, en az 640×360 ve 16:9 olmalı.",alphaPending:"Şeffaf WebM ilk görüntü karesinde doğrulanacak.",slowCPU:"Canvas uyumluluk modu: kalite ve akıcılık cihazınıza göre değişebilir."},en:{sleep:"SLEEPING",wake:"WAKING",fire:"BREATHING FIRE",cooldown:"FIRE ENDED",return:"RETURNING TO SLEEP",complete:"COMPLETE",play:"▶ Play animation",replay:"↻ Replay",pause:"Pause",resume:"Resume",gpu:"GPU chromakey active",cpu:"Canvas chromakey fallback active",alpha:"Transparent WebM active",unsupported:"Unsupported video or alpha; choose original MP4.",invalid:"Choose MP4 or WebM.",metadata:"Video must be 15 seconds, at least 640×360 and 16:9.",alphaPending:"Transparent WebM will be checked on its first decoded frame.",slowCPU:"Canvas compatibility mode: quality and frame rate vary by device."}};
const tr=k=>dict[lang][k]||k;
function sync(t=v.currentTime||0){const s=state(t,value);score.textContent=s.number.toLocaleString(lang==="tr"?"tr-TR":"en-US");phase.textContent=tr(s.phase);clock.textContent=s.t.toFixed(1)+" / 15.0 s";progress.style.width=(100*s.progress)+"%";stage.classList.toggle("burning",s.burning);stage.dataset.phase=s.phase;stage.dataset.firing=String(s.fire);}
function stop(){if(raf)cancelAnimationFrame(raf);raf=0;if(videoFrameId && typeof v.cancelVideoFrameCallback==="function")v.cancelVideoFrameCallback(videoFrameId);videoFrameId=0;}
function refreshCanvas(){const next=c.cloneNode(false);c.replaceWith(next);c=next;ctx2d=null;gl=null;drawKey=null;}
function alphaSupported(){const x=document.createElement("canvas");x.width=16;x.height=9;const ct=x.getContext("2d",{willReadFrequently:true});if(!ct)return false;ct.drawImage(v,0,0,16,9);const d=ct.getImageData(0,0,16,9).data;const coords=[[0,0],[15,0],[0,8],[15,8]];let transparent=0;for(const [a,b] of coords){if(d[(b*16+a)*4+3]<80)transparent++;}return transparent>=3;}
function checkFirstAlpha(){if(!alphaPending||v.readyState<2)return true;alphaPending=false;try{if(alphaSupported()) {message.textContent=tr("alpha");return true;}}catch{} failMedia();return false;}
function failMedia(){v.pause();stop();ready=false;play.disabled=true;pause.disabled=true;message.textContent=tr("unsupported");}
function drawVideoFrame(){if(v.readyState<2 || !checkFirstAlpha())return;if(!drawKey)return;try{drawKey();painted++}catch(e){if(renderer==="gpu"){try{createCPU();drawKey();painted++;message.textContent=tr("slowCPU");return}catch{}}failMedia();}}
function scheduleDecodedFrame(){if(typeof v.requestVideoFrameCallback!=="function"||videoFrameId||v.paused||v.ended||document.hidden)return;videoFrameId=v.requestVideoFrameCallback(()=>{videoFrameId=0;if(v.paused||v.ended||document.hidden)return;rvfcFrames++;drawVideoFrame();scheduleDecodedFrame()})}
function frame(){if(typeof v.requestVideoFrameCallback!=="function")drawVideoFrame();sync();if(!v.paused&&!v.ended&&!document.hidden)raf=requestAnimationFrame(frame);else raf=0;}
function startFrames(){scheduleDecodedFrame();if(!raf)raf=requestAnimationFrame(frame);}
function createGPU(){gl=c.getContext("webgl",{alpha:true,premultipliedAlpha:true,antialias:false});if(!gl)throw Error("WebGL not available");c.width=v.videoWidth||1280;c.height=v.videoHeight||720;gl.viewport(0,0,c.width,c.height);
 const vs="attribute vec2 p; varying vec2 uv; void main(){uv=(p+1.0)*.5; gl_Position=vec4(p,0.,1.);}";
 const fs="precision highp float; varying vec2 uv; uniform sampler2D tex; void main(){vec3 col=texture2D(tex,vec2(uv.x,1.0-uv.y)).rgb;float diff=col.g-max(col.r,col.b);float a=1.0-smoothstep(0.07,0.28,diff);col.g=min(col.g,max(col.r,col.b)+0.04);gl_FragColor=vec4(col*a,a);}";
 function compile(t,s){const sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error("Shader");return sh}
 const pg=gl.createProgram();gl.attachShader(pg,compile(gl.VERTEX_SHADER,vs));gl.attachShader(pg,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pg);if(!gl.getProgramParameter(pg,gl.LINK_STATUS))throw Error("Link");gl.useProgram(pg);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(pg,"p");gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
 const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);for(const [param,vv] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,param,vv);
 gl.clearColor(0,0,0,0);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
 drawKey=()=>{gl.clear(gl.COLOR_BUFFER_BIT);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,v);gl.drawArrays(gl.TRIANGLE_STRIP,0,4)};
 renderer="gpu";
}
function createCPU(){refreshCanvas();const mobile=matchMedia("(max-width:750px)").matches;const width=Math.min(mobile?600:800,Math.max(320,Math.round((dragon.clientWidth||720)*Math.min(devicePixelRatio||1,1.5))));c.width=width;c.height=Math.round(width*(v.videoHeight||720)/(v.videoWidth||1280));ctx2d=c.getContext("2d",{willReadFrequently:true});if(!ctx2d)throw Error("Canvas unavailable");
 let prev=0;const delay=1000/(mobile?18:24);
 drawKey=()=>{const now=performance.now();if(now-prev<delay)return;prev=now;ctx2d.clearRect(0,0,c.width,c.height);ctx2d.drawImage(v,0,0,c.width,c.height);const pixels=ctx2d.getImageData(0,0,c.width,c.height),p=pixels.data;
 for(let i=0;i<p.length;i+=4){const r=p[i],g=p[i+1],b=p[i+2],ex=g-Math.max(r,b);if(ex>10){const a=clamp((68-ex)/58,0,1);p[i+3]=Math.round(p[i+3]*a);p[i+1]=Math.min(g,Math.max(r,b)+12)}}ctx2d.putImageData(pixels,0,0);};
 renderer="cpu";
}
function reset(){v.pause();stop();if(sourceURL)URL.revokeObjectURL(sourceURL);sourceURL=null;v.removeAttribute("src");v.load();refreshCanvas();ready=false;alphaPending=false;renderer="none";dragon.dataset.ready="no";dragon.dataset.mode="none";play.disabled=true;pause.disabled=true;play.textContent=tr("play");sync(0);}
file.addEventListener("change",()=>{const f=file.files?.[0];if(!f)return;reset();if(!/\.(webm|mp4)$/i.test(f.name)||!(/video\/(webm|mp4)/.test(f.type)||!f.type)){message.textContent=tr("invalid");return}sourceURL=URL.createObjectURL(f);renderer=/\.webm$/i.test(f.name)?"alpha":"gpu";v.src=sourceURL;v.preload="metadata";v.load();});
v.addEventListener("loadedmetadata",()=>{if(renderer==="none")return;
 if(validateClipMetadata(v.duration,v.videoWidth,v.videoHeight)!==null){message.textContent=tr("metadata");ready=false;play.disabled=true;return}
 try{if(renderer==="alpha"){alphaPending=true;message.textContent=tr("alphaPending");}else{try{createGPU()}catch{createCPU()}message.textContent=tr(renderer);}
  dragon.dataset.mode=renderer;dragon.dataset.ready="yes";ready=true;play.disabled=false;
  if(v.readyState>=2)drawVideoFrame();
 }catch{failMedia()}sync(0)
});
v.addEventListener("loadeddata",()=>{if(!ready)return;if(renderer==="alpha")checkFirstAlpha();else drawVideoFrame();});
v.addEventListener("error",()=>{if(renderer!=="none"){ready=false;play.disabled=true;message.textContent=tr("unsupported")}});
v.addEventListener("timeupdate",()=>sync());v.addEventListener("seeked",()=>{drawVideoFrame();sync()});v.addEventListener("pause",()=>{stop();sync()});
v.addEventListener("ended",()=>{stop();sync(15);play.textContent=tr("replay");pause.disabled=true});
play.addEventListener("click",async()=>{if(!ready)return;v.pause();stop();v.currentTime=0;value=clamp(Math.trunc(Number(target.value)||0),0,1000);target.value=value;sync(0);if(less.checked){v.currentTime=13;sync(13);play.textContent=tr("replay");pause.disabled=true;return}try{await v.play();play.textContent=tr("replay");pause.disabled=false;pause.textContent=tr("pause");startFrames()}catch{pause.disabled=true;message.textContent=tr("unsupported")}});
pause.addEventListener("click",async()=>{if(!ready)return;if(v.paused){try{await v.play();pause.textContent=tr("pause");startFrames()}catch{message.textContent=tr("unsupported")}}else{v.pause();stop();pause.textContent=tr("resume")}});
target.addEventListener("change",()=>{value=clamp(Math.trunc(Number(target.value)||0),0,1000);target.value=value;sync()});
less.checked=matchMedia("(prefers-reduced-motion:reduce)").matches;function updateMotion(){document.body.classList.toggle("reduced-mode",less.checked);if(less.checked&&!v.paused){v.pause();stop();v.currentTime=13;sync(13);pause.disabled=true}}less.addEventListener("change",updateMotion);updateMotion();
$("language").addEventListener("click",()=>{lang=lang==="tr"?"en":"tr";document.documentElement.lang=lang;$("language").textContent=lang==="tr"?"EN":"TR";document.querySelectorAll("[data-tr]").forEach(x=>{if(x.tagName==="H1")x.innerHTML=x.dataset[lang];else x.textContent=x.dataset[lang]});play.textContent=tr(v.ended?"replay":"play");pause.textContent=tr(v.paused?"resume":"pause");sync()});
document.addEventListener("visibilitychange",()=>{if(document.hidden){v.pause();stop()}});if(typeof IntersectionObserver!=="undefined"){new IntersectionObserver(es=>{if(es.every(e=>!e.isIntersecting)){v.pause();stop()}},{threshold:0.05}).observe(stage);}window.addEventListener("pagehide",reset);
window.__dpVideoPreview={get ready(){return ready},get renderer(){return renderer},get painted(){return painted},get decodedFrames(){return rvfcFrames},get time(){return v.currentTime},get count(){return Number(score.textContent.replace(/\D/g,""))},seek(t){if(ready){v.currentTime=clamp(t,0,14.99);sync(v.currentTime)}}};sync(0);