import {renderSignedDocument} from "@/ci/tpw-signed-document";
/** CI route template; not part of App Router until copied by the local acceptance harness. */
export const dynamic="force-dynamic";
export const revalidate=0;
const secret="__TPW_CI_SECRET__";
const bridge="http://127.0.0.1:3135/read";
const fields=["screen","chip","ram","storage","battery","weight","network"] as const;
type Locale="tr"|"en";
type Text={title:string;summary:string;body:string};
type Dto={schemaVersion:"1.0";mode:"LOCAL_SYNTHETIC_SIGNED";publication:"HARD_NO_GO";dragonPoint:"DISABLED";generation:number;categoryFiltering:false;stories:{category:null;tr:Text;en:Text}[];phones:{variantId:string;label:string;specifications:Record<typeof fields[number],string|null>}[]};
const headers={"Cache-Control":"private, no-store, max-age=0, must-revalidate","CDN-Cache-Control":"no-store","Cloudflare-CDN-Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow, noarchive","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","Content-Security-Policy":"default-src 'none'; script-src 'none'; style-src 'self'; img-src 'none'; media-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"};
const keys=(v:unknown,k:readonly string[])=>!!v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).sort().join("|")===[...k].sort().join("|");
const text=(v:unknown,max=60000)=>typeof v==="string"&&v.length>0&&v.length<=max;
function validate(value:unknown):Dto{
 const d=value as Dto;
 if(!keys(d,["schemaVersion","mode","publication","dragonPoint","generation","categoryFiltering","stories","phones"])||d.schemaVersion!=="1.0"||d.mode!=="LOCAL_SYNTHETIC_SIGNED"||d.publication!=="HARD_NO_GO"||d.dragonPoint!=="DISABLED"||d.categoryFiltering!==false||!Number.isSafeInteger(d.generation)||d.generation<1||!Array.isArray(d.stories)||!d.stories.length||d.stories.length>30||!Array.isArray(d.phones)||!d.phones.length||d.phones.length>30)throw Error("DTO");
 const ids=new Set<string>();
 for(const s of d.stories){if(!keys(s,["category","tr","en"])||s.category!==null)throw Error("STORY");for(const lang of ["tr","en"] as const){const t=s[lang];if(!keys(t,["title","summary","body"])||![t.title,t.summary,t.body].every(x=>text(x)))throw Error("TEXT")}}
 for(const p of d.phones){if(!keys(p,["variantId","label","specifications"])||typeof p.variantId!=="string"||!/^[a-f0-9]{64}$/.test(p.variantId)||ids.has(p.variantId)||!text(p.label,1024)||!keys(p.specifications,fields)||fields.some(k=>p.specifications[k]!==null&&!text(p.specifications[k],1024)))throw Error("PHONE");ids.add(p.variantId)}
 return d;
}
// CI diagnostics only: fixed codes, never raw exception text, headers, keys or DTO.
const reported=new Set<string>();
function report(code:string){if(!reported.has(code)){reported.add(code);console.warn("TPW_SIGNED_READ_DENIED "+code)}}
function transportCode(error:unknown){
 const msg=error instanceof Error?error.message.toLowerCase():"";
 if(error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError"))return "TRANSPORT_TIMEOUT";
 if(/private ip|private address|loopback|local address|destination address|network address/.test(msg))return "TRANSPORT_ADDRESS";
 if(/connection refused|econnrefused/.test(msg))return "TRANSPORT_REFUSED";
 return "TRANSPORT_OTHER";
}
async function read():Promise<Dto>{
 if(!/^[a-f0-9]{64}$/.test(secret))throw Error("CI_ONLY");
 let r:Response;
 try{r=await fetch(bridge,{headers:{Authorization:"Bearer "+secret,Accept:"application/json","Cache-Control":"no-store"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(5000)})}catch(error){report(transportCode(error));throw Error("BRIDGE")}
 if(r.status!==200){report(r.status===403?"BRIDGE_HTTP_403":r.status===503?"BRIDGE_HTTP_503":"BRIDGE_HTTP_OTHER");throw Error("BRIDGE")}
 if(!r.headers.get("content-type")?.startsWith("application/json")||!r.headers.get("cache-control")?.includes("no-store")||!r.body){report("BRIDGE_METADATA");throw Error("BRIDGE")}
 const reader=r.body.getReader(),decoder=new TextDecoder("utf-8",{fatal:true});let n=0,s="";
 try{for(;;){const x=await reader.read();if(x.done)break;n+=x.value.byteLength;if(n>2000000)throw Error("LIMIT");s+=decoder.decode(x.value,{stream:true})}s+=decoder.decode();return validate(JSON.parse(s))}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
const css=".tpw37{--bg:#101522;--panel:#192234;--ink:#f2f5fa;--muted:#bdc9dc;--blue:#8ac2ff;--gold:#ffce58;--red:#ff8086;--line:#3c4960;background:var(--bg);color:var(--ink);min-height:100vh;font:16px/1.6 system-ui,sans-serif;color-scheme:dark}.tpw37:has(#theme:checked){--bg:#f5f7fb;--panel:#fff;--ink:#182238;--muted:#43536c;--blue:#1457a2;--gold:#795000;--red:#b32636;--line:#cbd5e1;color-scheme:light}*{box-sizing:border-box}body{margin:0}.wrap{max-width:1320px;width:calc(100% - 40px);margin:auto;min-width:0}.notice{text-align:center;background:#3d202b;color:#ffd6d9;padding:8px;font-size:12px;font-weight:750}header{background:var(--panel);border-bottom:1px solid var(--line)}header:before{content:'';display:block;height:4px;background:linear-gradient(90deg,#d92b41 0 33.33%,#f1bf29 33.33% 66.66%,#2878e7 66.66%)}.nav,.tools,nav{display:flex;gap:14px;align-items:center;flex-wrap:wrap}.nav{padding:12px 0}.desktop{flex:1}.mobile{display:none}.brand{font-size:29px;font-weight:900;letter-spacing:-.05em}.brand span{color:var(--red)}.brand b{color:var(--gold)}.brand i{color:var(--blue);font-style:normal}a{color:var(--ink);text-decoration:none}a:focus-visible,summary:focus-visible,input:focus-visible{outline:3px solid var(--blue)}.hero,article,.dp{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px}.hero{background:linear-gradient(125deg,var(--panel),var(--bg));padding:30px}section{margin:24px 0;scroll-margin-top:16px}h1{font-size:clamp(32px,4vw,58px);line-height:1.1;letter-spacing:-.045em;margin:10px 0}h2{font-size:28px}h3{font-size:22px;line-height:1.3}p{color:var(--muted);overflow-wrap:anywhere}.kicker{color:var(--blue);font-size:12px;font-weight:800;letter-spacing:.06em}.action{display:inline-block;background:#1858b4;color:white;padding:10px 14px;border-radius:8px}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}article{min-width:0;overflow-wrap:anywhere;border-top:3px solid var(--blue)}meter{display:block;width:100%;height:10px}summary{cursor:pointer}table{width:100%;table-layout:fixed;border-collapse:collapse;overflow-wrap:anywhere;background:var(--panel)}th,td{border:1px solid var(--line);padding:10px;text-align:left}.dp{display:flex;align-items:center;gap:20px}.dp strong{border:5px double var(--gold);border-radius:50%;display:grid;place-content:center;width:105px;aspect-ratio:1;font-size:24px}footer{padding:24px 0;color:var(--muted)}@media(max-width:900px){.desktop{display:none}.mobile{display:block;margin-left:auto}.mobile nav{flex-direction:column;align-items:start}.tools{flex-basis:100%}}@media(max-width:540px){.wrap{width:calc(100% - 24px)}.hero,article,.dp{padding:14px}h1{font-size:30px}h2{font-size:24px}.cards{grid-template-columns:1fr}th,td{padding:6px;font-size:12px}.tools{justify-content:space-between}}";
const professionalCss=css+"\n"+`
.tpw37 .skip{position:absolute;left:12px;top:-100px;z-index:10;background:var(--panel);padding:8px}.tpw37 .skip:focus{top:8px}.tpw37 .hero{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:20px;align-items:center}.tpw37 .explore{background:var(--panel);border:1px solid var(--line);padding:14px;border-radius:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.tpw37 .explore .kicker{grid-column:1/-1;margin:0}.tpw37 .explore a{border-left:3px solid var(--blue);padding:8px;overflow-wrap:anywhere}.tpw37 .tools a[aria-current=page]{font-weight:800;border-bottom:2px solid var(--blue)}.tpw37 .category-note{border-left:3px solid var(--line);padding-left:10px}.tpw37 article{display:flex;flex-direction:column}.tpw37 article details{margin-top:auto;border-top:1px solid var(--line);padding-top:10px}.tpw37 .screen{font-size:22px;color:var(--ink);font-weight:650}.tpw37 .coverage{margin-top:auto;border-top:1px solid var(--line);padding-top:6px}.tpw37 .card-link{margin-top:12px;align-self:flex-start;border:1px solid var(--line);border-radius:8px;padding:6px 12px}.tpw37 .legend{font-size:13px;border-left:3px solid var(--blue);padding-left:8px}.tpw37 .table-scroll{overflow-x:auto;max-width:100%}.tpw37 tr[data-known-difference=true]{background:var(--bg);box-shadow:inset 3px 0 var(--blue)}.tpw37 td[data-unknown=true]{color:var(--muted)}.tpw37 .dp-copy{min-width:0;flex:1}.tpw37 .method{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.tpw37 .method div{border:1px solid var(--line);border-radius:8px;padding:8px;overflow-wrap:anywhere}.tpw37 .method b,.tpw37 .method span{display:block}.tpw37 .method b{font-size:24px;color:var(--blue)}.tpw37 .method span{font-size:12px}.tpw37 .dp strong{flex:none}@media(max-width:760px){.tpw37 .hero{grid-template-columns:1fr;gap:12px}.tpw37 .dp{flex-direction:column;align-items:stretch}.tpw37 .dp strong{align-self:center}.tpw37 .explore a{font-size:13px}.tpw37 .method b{font-size:20px}}
`;
const response=(status:number,body:string|null=null,type="text/html; charset=utf-8")=>new Response(body,{status,headers:{...headers,"Content-Type":type}});
export async function GET(request:Request,{params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;if(new URL(request.url).search)return response(400);
 if(!/^[a-f0-9]{64}$/.test(secret))return response(503);
 if(locale==="css")return response(200,professionalCss,"text/css; charset=utf-8");
 if(locale!=="tr"&&locale!=="en")return response(404);
 try{return response(200,renderSignedDocument(await read(),locale))}catch(error){const code=error instanceof Error?error.message:"";report(["CI_ONLY","BRIDGE","LIMIT","DTO","STORY","TEXT","PHONE"].includes(code)?code:"DECODE_OR_RENDER");return response(503)}
}
