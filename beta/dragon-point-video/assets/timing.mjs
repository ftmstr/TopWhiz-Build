// Preview-only: synthetic points; never real-device results.
export const DURATION=15,IGNITE=4.85,FIRE_OFF=9.85,COUNT_DONE=DURATION-2;
export const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function state(t,raw,actualDuration=DURATION){
 const end=Number.isFinite(actualDuration)&&Math.abs(actualDuration-DURATION)<=0.5?actualDuration:DURATION;
 const countEnd=end-2;
 t=clamp(Number.isFinite(t)?t:0,0,end);
 const target=clamp(Number.isFinite(Number(raw))?Math.trunc(Number(raw)):0,0,1000);
 const ratio=clamp((t-IGNITE)/(countEnd-IGNITE),0,1);
 const number=t>=countEnd?target:Math.floor(target*(1-Math.pow(1-ratio,2.4)));
 const phase=t<2?"sleep":t<IGNITE?"wake":t<FIRE_OFF?"fire":t<countEnd?"cooldown":t<end?"return":"complete";
 return {t,target,number,phase,burning:t>=IGNITE&&t<end,fire:t>=IGNITE&&t<FIRE_OFF,progress:t/end,countEnd,end};
}
/** Fail closed if the selected clip cannot honor the 15s choreography.
 * Browser metadata cannot reliably prove FPS, so never report measured FPS here.
 */
export function validateClipMetadata(duration, width, height) {
  if (!Number.isFinite(duration) || Math.abs(duration-DURATION)>0.5) return "duration";
  if (!Number.isFinite(width) || !Number.isFinite(height) || width<640 || height<360
      || Math.abs(width/height-(16/9))>0.08) return "dimensions";
  return null;
}
