"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";

type Phase = "sleep" | "wake" | "fire" | "cooldown" | "asleep";
export type DragonPointCategory = { id:string; name:string; maxPoints:number };
type Props = {
  /** Already admitted by the server-side release gate for REAL phone pages. */
  score: number | null;
  maxScore: number;
  methodologyVersion: string;
  categories: DragonPointCategory[];
  /** Strictly fictional UI preview. Never pass a real phone identity with mode=demo. */
  mode: "real" | "demo";
};

const WAKE_AT = 360;
const FIRE_AT = 1080;
const FIRE_DURATION = 2250;
const COOL_AT = 3440;
const SLEEP_AT = 4340;

/**
 * TOPWHIZ signature sequence: sleep → wake → fire / count → cooldown → sleep.
 * Existing, owned logo + original inline SVG/CSS flame. No video, canvas, remote
 * script, WebGL, sound or always-running JavaScript render loop.
 */
export function DragonPointCinematic({
  score,maxScore,methodologyVersion,categories,mode
}: Props) {
  const rootRef = useRef<HTMLElement|null>(null);
  const [entered,setEntered] = useState(false);
  const [visible,setVisible] = useState(false);
  const [reduced,setReduced] = useState(false);
  const [phase,setPhase] = useState<Phase>("sleep");
  const [shownScore,setShownScore] = useState(0);
  const [run,setRun] = useState(0);
  const ids = useId().replace(/:/g,"");
  const titleId = ids+"-title";
  const safe = typeof score === "number" && Number.isFinite(score)
    && Number.isInteger(score) && score>=0 && Number.isFinite(maxScore)
    && maxScore>0 && score<=maxScore ? score : null;
  const hasScore=safe!==null;
  const isDemo=mode==="demo";
  // Only a dedicated demo page may supply an arbitrary fictional number.
  // Real pages must additionally satisfy independent server-side publish gates.
  const target=(isDemo||mode==="real") && hasScore ? safe : null;
  const done=phase==="asleep";
  const showValue=target!==null;
  const canReplay=isDemo && showValue && done && entered;
  const finalAnnouncement=done && showValue
    ? (isDemo ? "Kurgusal animasyon demosu. " : "Dragon Point: ")
      +target+" / "+maxScore+" DP" : "";

  useEffect(()=>{
    const mq=window.matchMedia("(prefers-reduced-motion: reduce)");
    const update=()=>setReduced(mq.matches);
    update();
    mq.addEventListener("change",update);
    return ()=>mq.removeEventListener("change",update);
  },[]);

  useEffect(()=>{
    const el=rootRef.current;
    if(!el)return;
    if(typeof IntersectionObserver==="undefined"){
      setVisible(true);setEntered(true);return;
    }
    const observer=new IntersectionObserver(entries=>{
      const inView=entries.some(entry=>entry.isIntersecting);
      setVisible(inView);
      if(inView)setEntered(true);
    },{threshold:0.28});
    observer.observe(el);
    return ()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    if(!entered || target===null)return;
    if(reduced){
      setShownScore(target);
      setPhase("asleep");
      return;
    }

    let cancelled=false;
    let frame:number|null=null;
    const timers:number[]=[];
    setShownScore(0);
    setPhase("sleep");

    const later=(fn:()=>void,ms:number)=>{
      timers.push(window.setTimeout(()=>{if(!cancelled)fn();},ms));
    };
    let lastFrame=-1;
    later(()=>setPhase("wake"),WAKE_AT);
    later(()=>{
      setPhase("fire");
      const start=performance.now();
      const tick=(now:number)=>{
        if(cancelled)return;
        const fraction=Math.max(0,Math.min(1,(now-start)/FIRE_DURATION));
        const eased=1-Math.pow(1-fraction,3);
        const next=Math.round(target*eased);
        // At most ~30 updates/s; most animation is GPU composited CSS.
        if(now-lastFrame>=32 || fraction===1){
          setShownScore(next);
          lastFrame=now;
        }
        if(fraction<1)frame=window.requestAnimationFrame(tick);
        else frame=null;
      };
      frame=window.requestAnimationFrame(tick);
    },FIRE_AT);
    later(()=>{
      setShownScore(target);
      setPhase("cooldown");
    },COOL_AT);
    later(()=>setPhase("asleep"),SLEEP_AT);

    const finishHidden=()=>{
      if(document.visibilityState!=="hidden" || cancelled)return;
      for(const id of timers)clearTimeout(id);
      if(frame!==null)cancelAnimationFrame(frame);
      cancelled=true;
      setShownScore(target);
      setPhase("asleep");
    };
    document.addEventListener("visibilitychange",finishHidden);

    return ()=>{
      cancelled=true;
      document.removeEventListener("visibilitychange",finishHidden);
      timers.forEach(clearTimeout);
      if(frame!==null)cancelAnimationFrame(frame);
    };
  },[entered,run,reduced,showValue,target]);

  const replay=()=>{
    if(!canReplay)return;
    setRun(n=>n+1);
  };

  return <section
    ref={rootRef}
    className="dp-cine"
    data-testid="dragon-point-scene"
    data-mode={mode}
    data-phase={phase}
    data-visible={visible}
    data-motion={reduced?"reduced":"standard"}
    aria-labelledby={titleId}
  >
    <div className="dp-cine-stars" aria-hidden="true"/>
    <div className="dp-cine-stage">
      <div className="dp-cine-dragon-cell" aria-hidden="true">
        <div className="dp-cine-sigil"/>
        <div className="dp-cine-arc dp-cine-arc-one"/>
        <div className="dp-cine-arc dp-cine-arc-two"/>
        <div className="dp-cine-dragon">
          <Image src="/brand/TopWhiz_Logo_02_KirmiziSariMavi.png"
            className="dp-cine-dragon-art" alt=""
            width={460} height={460} sizes="(max-width:720px) 270px, 430px"
            loading="lazy" />
          <div className="dp-cine-eye-gleam"/>
        </div>
        <div className="dp-cine-sleep-mark">Z<span>z</span><span>z</span></div>
        <div className="dp-cine-wake-line"/>
        <div className="dp-cine-fire">
          <svg viewBox="0 0 560 170" aria-hidden="true" focusable="false" preserveAspectRatio="none">
            <defs>
              <linearGradient id={ids+"-outer"} x1="0%" y1="50%" x2="100%" y2="50%">
                <stop offset="0%" stopColor="#fff2a4"/>
                <stop offset="28%" stopColor="#ffad32"/>
                <stop offset="70%" stopColor="#ff4037"/>
                <stop offset="100%" stopColor="#b41757" stopOpacity="0"/>
              </linearGradient>
              <linearGradient id={ids+"-inner"} x1="0%" y1="50%" x2="100%" y2="50%">
                <stop offset="0%" stopColor="#ffffff"/>
                <stop offset="35%" stopColor="#fff8b0"/>
                <stop offset="78%" stopColor="#ffb32f"/>
                <stop offset="100%" stopColor="#ffad32" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path className="dp-cine-flame-outer"
              fill={"url(#"+ids+"-outer)"}
              d="M4 86 C80 28 111 56 167 12 C204 67 241 28 293 40 C342 -4 386 26 421 56 C480 29 520 60 560 80 C507 83 503 124 444 106 C391 154 347 93 294 131 C232 115 217 156 172 112 C103 132 67 109 4 86Z"/>
            <path className="dp-cine-flame-middle" fill="#ff8c2d"
              d="M8 87 C89 51 131 93 177 58 C236 93 271 62 313 75 C371 49 419 90 479 86 C423 105 378 116 317 103 C252 133 215 99 178 114 C105 105 71 98 8 87Z"/>
            <path className="dp-cine-flame-core" fill={"url(#"+ids+"-inner)"}
              d="M7 87 C78 66 135 82 189 77 C251 68 288 91 343 84 C398 77 426 93 482 86 C434 104 408 97 342 101 C268 104 231 96 181 101 C105 106 62 94 7 87Z"/>
            <circle className="dp-cine-spark dp-cine-spark-one" cx="376" cy="22" r="5" fill="#ffe17b"/>
            <circle className="dp-cine-spark dp-cine-spark-two" cx="465" cy="143" r="6" fill="#ff7137"/>
            <circle className="dp-cine-spark dp-cine-spark-three" cx="532" cy="42" r="4" fill="#ffd74d"/>
          </svg>
        </div>
      </div>

      <div className="dp-cine-board">
        <span className="dp-cine-board-light" aria-hidden="true"/>
        <div className="dp-cine-impact" aria-hidden="true"/>
        <div className="dp-cine-board-top">
          <span className="dp-cine-eyebrow">TOPWHIZ · EFSANEVİ TELEFON PUANI</span>
          <span className="dp-cine-glyph" aria-hidden="true">✦</span>
        </div>
        <h2 id={titleId} className="dp-cine-title">DRAGON <span>POINT</span></h2>
        {isDemo && <p className="dp-cine-demo-mark">KURGUSAL ANİMASYON DEMOSU</p>}
        <div className="dp-cine-counter">
          {showValue
            ? <strong data-testid="dragon-point-number" aria-hidden="true" className="dp-cine-digits">{entered ? shownScore : 0}</strong>
            : <strong className="dp-cine-unavailable">Veri bekleniyor</strong>}
          <span className="dp-cine-total">/ {maxScore.toLocaleString("tr-TR")} DP</span>
        </div>
        <div className="dp-cine-progress" aria-hidden="true">
          <span style={{transform:"scaleX("+(showValue && entered ? shownScore/maxScore : 0)+")"}}/>
        </div>
        <span className="sr-only" role="status" aria-live="polite">{finalAnnouncement}</span>
        <p className="dp-cine-caption">
          {isDemo
            ? "Yalnızca görsel efekt önizlemesi · Gerçek telefon puanı değildir"
            : "Kalibrasyon ve bağımsız veri doğrulaması tamamlanınca puan gösterilecektir."}
        </p>
        <div className="dp-cine-metrics" aria-label="Dragon Point kategori ağırlıkları">
          {categories.map(category=>
            <div className="dp-cine-metric" key={category.id}>
              <span>{category.name}</span>
              <strong>{category.maxPoints}<small> DP</small></strong>
            </div>
          )}
        </div>
        <div className="dp-cine-board-bottom">
          <span>Metodoloji: {methodologyVersion}</span>
          {isDemo && <button type="button" className="dp-cine-replay"
            disabled={!canReplay} onClick={replay}>Animasyonu yeniden izle</button>}
        </div>
      </div>
    </div>
  </section>;
}
