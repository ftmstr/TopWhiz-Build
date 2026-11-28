/** Static server-rendered React document for the isolated signed CI route only.
 * No client component, no hydration script, no HTML injection, no fallback fixture.
 */
import {renderToStaticMarkup} from "react-dom/server";
const fields=["screen","chip","ram","storage","battery","weight","network"] as const;
type Locale="tr"|"en";
type Text={title:string;summary:string;body:string};
type Dto={schemaVersion:"1.0";mode:"LOCAL_SYNTHETIC_SIGNED";publication:"HARD_NO_GO";dragonPoint:"DISABLED";generation:number;categoryFiltering:false;stories:{category:null;tr:Text;en:Text}[];phones:{variantId:string;label:string;specifications:Record<typeof fields[number],string|null>}[]};

const strings={
 tr:{notice:"İMZALI SENTETİK D1 · CANLI YAYIN KAPALI",hero:"Teknolojiyi keşfet. Bilinçli karşılaştır.",intro:"Her istekte doğrulanan yerel sentetik haberler ve teknik cihaz verileri.",news:"Haberler",phones:"Telefon atlası",compare:"Karşılaştırma",category:"İmzalı şemada kategori yok; sınıflandırma yapılmadı.",unknown:"Bilinmiyor",known:"bilinen teknik alan",details:"Devamını oku",theme:"Açık tema",menu:"Menü",gen:"Doğrulanan nesil",lock:"Puanlar kullanılamıyor",coverage:"Teknik veri kapsamı performans puanı değildir.",foot:"Yalnız yerel CI · gerçek yayın, fiyat ve medya yok.",names:["Ekran","İşlemci","RAM","Depolama","Batarya","Ağırlık","Ağ bağlantısı"]},
 en:{notice:"SIGNED SYNTHETIC D1 · LIVE PUBLICATION CLOSED",hero:"Explore technology. Compare with confidence.",intro:"Local synthetic news and device specifications verified on every request.",news:"News",phones:"Phone atlas",compare:"Comparison",category:"No category in the signed schema; no classification inferred.",unknown:"Unknown",known:"known specification fields",details:"Read more",theme:"Light theme",menu:"Menu",gen:"Verified generation",lock:"Scores unavailable",coverage:"Specification coverage is not a performance score.",foot:"Local CI only · no live publication, prices or media.",names:["Display","Processor","RAM","Storage","Battery","Weight","Network"]}
} as const;

const extra={tr:{skip:"İçeriğe geç",desks:"Keşfet",signed:"İMZALI · SENTETİK",diff:"Farklı bilinen özellik",metrics:"Ölçüt",categories:"Kategori",maximum:"Metodoloji üst sınırı",note:"Gerçek ölçümler ve metodoloji onayı olmadan cihaz puanlanmaz."},en:{skip:"Skip to content",desks:"Explore",signed:"SIGNED · SYNTHETIC",diff:"Known difference",metrics:"Metrics",categories:"Categories",maximum:"Methodology maximum",note:"No device is scored without real measurements and methodology approval."}} as const;
function SignedDocument({d,lang}:{d:Dto;lang:Locale}){
 const t=strings[lang],x=extra[lang],known=(p:Dto["phones"][number])=>fields.filter(k=>p.specifications[k]!==null).length;
 const nav=[["news",t.news],["phones",t.phones],["compare",t.compare],["dp","Dragon Point"]] as const;
 const links=()=>nav.map(([id,label])=><a key={id} href={"#"+id}>{label}</a>);
 return <html lang={lang}><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex,nofollow,noarchive"/><title>TOPWHIZ | Signed synthetic CI</title><link rel="stylesheet" href="/tpw-ci-signed/css"/></head><body>
 <div className="tpw37" data-renderer="react-static-ssr" data-generation={d.generation} data-category-filtering="false">
 <a className="skip" href="#main">{x.skip}</a><div className="notice">{t.notice} · HARD NO-GO</div>
 <header><div className="wrap nav"><a className="brand" href="#main" aria-label="TOPWHIZ"><span>TOP</span><b>WH</b><i>IZ</i></a><nav className="desktop" aria-label={t.menu}>{links()}</nav><details className="mobile"><summary>{t.menu}</summary><nav aria-label={t.menu}>{links()}</nav></details><div className="tools"><label><input type="checkbox" id="theme"/> {t.theme}</label><a href="/tpw-ci-signed/tr" hrefLang="tr" aria-current={lang==="tr"?"page":undefined}>TR</a><a href="/tpw-ci-signed/en" hrefLang="en" aria-current={lang==="en"?"page":undefined}>EN</a></div></div></header>
 <main className="wrap" id="main"><section className="hero"><div><p className="kicker">{t.gen} {d.generation}</p><h1>{t.hero}</h1><p>{t.intro}</p><a className="action" href="#compare">{t.compare}</a></div><aside className="explore"><p className="kicker">{x.desks}</p>{links()}</aside></section>
 <section id="news"><h2>{t.news}</h2><p className="category-note">{t.category}</p><div className="cards">{d.stories.map((s,i)=><article key={i}><p className="kicker">{x.signed}</p><h3>{s[lang].title}</h3><p>{s[lang].summary}</p><details><summary>{t.details}</summary><p>{s[lang].body}</p></details></article>)}</div></section>
 <section id="phones"><h2>{t.phones}</h2><div className="cards">{d.phones.map(p=><article key={p.variantId} data-variant={p.variantId}><p className="kicker">{x.signed}</p><h3>{p.label}</h3><p className="screen">{p.specifications.screen??t.unknown}</p><div className="coverage"><p>{known(p)} / 7 {t.known}</p><meter min={0} max={7} value={known(p)} aria-label={known(p)+" / 7 "+t.known}/></div><a className="card-link" href="#compare">{t.compare}</a></article>)}</div></section>
 <section id="compare"><h2>{t.compare}</h2><p>{t.coverage}</p><p className="legend">{x.diff}</p><div className="table-scroll" role="region" aria-label={t.compare} tabIndex={0}><table><thead><tr><th scope="col">{t.compare}</th>{d.phones.map(p=><th key={p.variantId} scope="col">{p.label}</th>)}</tr></thead><tbody>{fields.map((k,i)=>{const values=d.phones.map(p=>p.specifications[k]);const diff=new Set(values.filter(v=>v!==null)).size>1;return <tr key={k} data-known-difference={String(diff)}><th scope="row">{t.names[i]}</th>{d.phones.map(p=><td key={p.variantId} data-unknown={String(p.specifications[k]===null)}>{p.specifications[k]??t.unknown}</td>)}</tr>})}</tbody></table></div></section>
 <section id="dp"><h2>Dragon Point</h2><div className="dp"><strong aria-hidden="true">DP —</strong><div className="dp-copy"><p data-dp-state="DISABLED">{t.lock}</p><div className="method">{[[8,x.categories],[37,x.metrics],[1000,x.maximum]].map(([n,label])=><div key={label}><b>{n}</b><span>{label}</span></div>)}</div><p>{x.note}</p></div></div></section>
 </main><footer className="wrap">{t.foot}</footer></div></body></html>;
}
export function renderSignedDocument(d:Dto,lang:Locale):string{
 const html=renderToStaticMarkup(<SignedDocument d={d} lang={lang}/>);
 return /^<!doctype html>/i.test(html)?html:"<!doctype html>"+html;
}
