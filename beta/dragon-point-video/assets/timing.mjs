// Preview-only: synthetic points; never real-device results.
export const DURATION=15,IGNITE=4.85,FIRE_OFF=9.85,COUNT_DONE=DURATION-2;
export const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function state(t,raw){
 t=clamp(Number.isFinite(t)?t:0,0,DURATION);
 const target=clamp(Number.isFinite(Number(raw))?Math.trunc(Number(raw)):0,0,1000);
 const ratio=clamp((t-IGNITE)/(COUNT_DONE-IGNITE),0,1);
 const number=t>=COUNT_DONE?target:Math.floor(target*(1-Math.pow(1-ratio,2.4)));
 const phase=t<2?"sleep":t<IGNITE?"wake":t<FIRE_OFF?"fire":t<13?"cooldown":t<DURATION?"return":"complete";
 return {t,target,number,phase,burning:t>=IGNITE&&t<DURATION,fire:t>=IGNITE&&t<FIRE_OFF,progress:t/DURATION};
}