"use client";
import {useEffect,useRef,useState} from "react";
import "./preview.css";

type Locale="tr"|"en";
const words={
 tr:{notice:"KURGUSAL TASARIM ÖNİZLEMESİ · CANLI YAYIN KAPALI",menu:"Menü",news:"Haberler",atlas:"Telefon atlası",compare:"Karşılaştırma",theme:"Koyu tema",hero:"Teknolojiyi keşfet. Bilinçli karşılaştır.",intro:"Teknoloji ve savunma dünyası, telefonların teknik özellikleri ve şeffaf karşılaştırmalar.",desks:"EDİTORYAL ALANLAR",tech:"Teknoloji",trdef:"Türkiye savunma teknolojisi",globaldef:"Dünya savunma teknolojisi",all:"Tümü",search:"Haber ara",phoneSearch:"Telefon ara",fiction:"Kurgusal",none:"Sonuç yok",known:"bilinen teknik alan",unknown:"Bilinmiyor",screen:"Ekran",cpu:"İşlemci",ram:"RAM",storage:"Depolama",battery:"Batarya",camera:"Kamera",weight:"Ağırlık",left:"Sol cihaz",right:"Sağ cihaz",swap:"Yer değiştir",diff:"Yalnız farklı bilinen alanlar",same:"İki farklı varyant seçin.",coverage:"Kapsam yalnız bilinen teknik alanları sayar; puan veya sıralama değildir.",lock:"Puanlar kullanılamıyor",method:"Metodoloji üst sınırı",metrics:"Ölçüt",categories:"Kategori",dpNote:"Gerçek ölçümler ve metodoloji onayı olmadan hiçbir cihaz puanlanmaz.",footer:"Yalnız sentetik arayüz · CMS, medya, fiyat ve reklam bağlı değil.",skip:"İçeriğe geç"},
 en:{notice:"FICTIONAL DESIGN PREVIEW · LIVE PUBLICATION CLOSED",menu:"Menu",news:"News",atlas:"Phone atlas",compare:"Comparison",theme:"Dark theme",hero:"Explore technology. Compare with confidence.",intro:"Technology and defence, phone specifications and transparent comparisons.",desks:"EDITORIAL DESKS",tech:"Technology",trdef:"Türkiye defence technology",globaldef:"Global defence technology",all:"All",search:"Search news",phoneSearch:"Search phones",fiction:"Fictional",none:"No results",known:"known specification fields",unknown:"Unknown",screen:"Display",cpu:"Processor",ram:"RAM",storage:"Storage",battery:"Battery",camera:"Camera",weight:"Weight",left:"Left device",right:"Right device",swap:"Swap",diff:"Only known differences",same:"Select two distinct variants.",coverage:"Coverage counts known specification fields only; it is not a score or ranking.",lock:"Scores unavailable",method:"Methodology maximum",metrics:"Metrics",categories:"Categories",dpNote:"No device is scored without real measurements and methodology approval.",footer:"Synthetic interface only · CMS, media, prices and ads are disconnected.",skip:"Skip to content"}
} as const;
const news=[
 {id:"fiction-tech",category:"tech",tr:["Kurgusal ekran teknolojisi","Yalnızca editoryal tasarım testi için örnek metin."],en:["Fictional display technology","Sample text solely for an editorial design test."]},
 {id:"fiction-tr",category:"trdef",tr:["Kurgusal Türkiye savunma teknolojisi","Gerçek olay veya ürün iddiası içermeyen test örneği."],en:["Fictional Türkiye defence technology","Test example with no actual event or product claim."]},
 {id:"fiction-world",category:"globaldef",tr:["Kurgusal dünya savunma teknolojisi","Gerçek haber olmayan sentetik içerik."],en:["Fictional global defence technology","Synthetic content, not actual news."]}
] as const;
const fields=["screen","cpu","ram","storage","battery","camera","weight"] as const;
type Phone={id:string;name:string;sku:string;region:string;spec:readonly (string|null)[]};
const phones:Phone[]=[
 {id:"tr",name:"Example P",sku:"EX-001",region:"TR",spec:["6.7 inch",null,null,null,null,null,null]},
 {id:"us",name:"Example P",sku:"EX-001",region:"US",spec:["6.5 inch",null,null,null,null,null,null]},
 {id:"alt",name:"Example Q",sku:"EX-002",region:"TR",spec:["6.1 inch",null,"8 GB","128 GB",null,null,null]}
];
const label=(p:Phone)=>p.name+" · "+p.sku+" / "+p.region;
export function TpwPreview({locale}:{locale:Locale}){
 const t=words[locale], [dark,setDark]=useState(true),[menu,setMenu]=useState(false),[cat,setCat]=useState("all"),[query,setQuery]=useState(""),[phoneQuery,setPhoneQuery]=useState(""),[left,setLeft]=useState("tr"),[right,setRight]=useState("us"),[diff,setDiff]=useState(false);
 const menuButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const old=document.documentElement.lang;document.documentElement.lang=locale;return()=>{document.documentElement.lang=old}},[locale]);
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.key==="Escape"&&menu){setMenu(false);menuButton.current?.focus()}};document.addEventListener("keydown",handler);return()=>document.removeEventListener("keydown",handler)},[menu]);
 const a=phones.find(p=>p.id===left)!,b=phones.find(p=>p.id===right)!;
 const coverage=(p:Phone)=>p.spec.filter(v=>v!==null).length+" / "+fields.length+" "+t.known;
 const fold=(s:string)=>s.toLocaleLowerCase(locale);
 const visibleNews=news.filter(n=>(cat==="all"||n.category===cat)&&fold(n[locale].join(" ")).includes(fold(query)));
 const visiblePhones=phones.filter(p=>fold(label(p)).includes(fold(phoneQuery)));
 const cats=["all","tech","trdef","globaldef"] as const;
 return <div className="tpw34" data-theme={dark?"dark":"light"} data-preview="synthetic-only" lang={locale}>
 <a className="tpw34-skip" href="#tpw34-main">{t.skip}</a>
 <div className="tpw34-notice" role="note">{t.notice} · HARD NO-GO</div>
 <header className="tpw34-header"><div className="tpw34-wrap tpw34-nav">
 <a className="tpw34-brand" href="#tpw34-main" aria-label="TOPWHIZ"><span>TOP</span><b>WH</b><i>IZ</i></a>
 <button className="tpw34-menu" ref={menuButton} aria-expanded={menu} aria-controls="tpw34-navlinks" onClick={()=>setMenu(!menu)}>{t.menu}</button>
 <nav id="tpw34-navlinks" data-open={menu} aria-label={t.menu}>{[["news",t.news],["phones",t.atlas],["compare",t.compare],["dp","Dragon Point"]].map(([id,title])=><a key={id} href={"#tpw34-"+id} onClick={()=>setMenu(false)}>{title}</a>)}</nav>
 <div className="tpw34-tools"><button id="tpw34-theme" aria-pressed={dark} onClick={()=>setDark(!dark)}>{t.theme}</button><a href="/tpw-ci-preview/tr" hrefLang="tr" aria-current={locale==="tr"?"page":undefined}>TR</a><a href="/tpw-ci-preview/en" hrefLang="en" aria-current={locale==="en"?"page":undefined}>EN</a></div>
 </div></header>
 <main id="tpw34-main" className="tpw34-wrap">
 <section className="tpw34-hero"><div><p className="tpw34-kicker">TOPWHIZ · {t.fiction}</p><h1>{t.hero}</h1><p>{t.intro}</p><div className="tpw34-actions"><a className="tpw34-primary" href="#tpw34-compare">{t.compare}</a><a href="#tpw34-news">{t.news}</a></div></div><aside><p className="tpw34-kicker">{t.desks}</p>{cats.slice(1).map(c=><a key={c} className={"tpw34-desk "+c} href="#tpw34-news" onClick={()=>setCat(c)}>{t[c]}</a>)}<a className="tpw34-desk tech" href="#tpw34-phones">{t.atlas}</a></aside></section>
 <section id="tpw34-news"><h2>{t.news}</h2><div className="tpw34-filters" role="group" aria-label={t.news}>{cats.map(c=><button key={c} data-cat={c} aria-pressed={cat===c} onClick={()=>setCat(c)}>{t[c]}</button>)}</div><label className="tpw34-search">{t.search}<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="tpw34-newsgrid">{visibleNews.map(n=><article className={"tpw34-card "+n.category} key={n.id}><p className="tpw34-kicker">{t.fiction} · {t[n.category]}</p><h3>{n[locale][0]}</h3><p>{n[locale][1]}</p></article>)}</div>{!visibleNews.length&&<p role="status">{t.none}</p>}</section>
 <section id="tpw34-phones"><h2>{t.atlas}</h2><label className="tpw34-search">{t.phoneSearch}<input type="search" value={phoneQuery} onChange={e=>setPhoneQuery(e.target.value)}/></label><div className="tpw34-phonegrid">{visiblePhones.map(p=><article className="tpw34-card" key={p.id}><p className="tpw34-kicker">{t.fiction} · {p.region}</p><h3>{p.name}</h3><p>{p.sku} / {p.region}</p><p>{p.spec[0]}</p><div className="tpw34-coverage"><p>{coverage(p)}</p><meter min={0} max={fields.length} value={p.spec.filter(v=>v!==null).length} aria-label={coverage(p)} /></div><button aria-pressed={p.id===left||p.id===right} onClick={()=>{if(p.id!==left)setRight(p.id);else if(p.id===right)setRight(phones.find(q=>q.id!==left)!.id)}}>{t.compare}</button></article>)}</div>{!visiblePhones.length&&<p role="status">{t.none}</p>}</section>
 <section id="tpw34-compare"><h2>{t.compare}</h2><div className="tpw34-selects"><label>{t.left}<select id="tpw34-left" value={left} onChange={e=>setLeft(e.target.value)}>{phones.map(p=><option key={p.id} value={p.id}>{label(p)}</option>)}</select></label><label>{t.right}<select id="tpw34-right" value={right} onChange={e=>setRight(e.target.value)}>{phones.map(p=><option key={p.id} value={p.id}>{label(p)}</option>)}</select></label><button id="tpw34-swap" onClick={()=>{setLeft(right);setRight(left)}}>{t.swap}</button></div><label className="tpw34-check"><input id="tpw34-diff" type="checkbox" checked={diff} onChange={e=>setDiff(e.target.checked)}/>{t.diff}</label>{a.id===b.id?<p role="status">{t.same}</p>:<><div className="tpw34-coverage"><p>{label(a)}: {coverage(a)} · {label(b)}: {coverage(b)}</p><p>{t.coverage}</p></div><table><thead><tr><th scope="col">{t.compare}</th><th scope="col">{label(a)}</th><th scope="col">{label(b)}</th></tr></thead><tbody>{fields.map((field,i)=>{const different=a.spec[i]!==null&&b.spec[i]!==null&&a.spec[i]!==b.spec[i];return diff&&!different?null:<tr key={field} data-different={different}><th scope="row">{t[field]}</th><td>{a.spec[i]??t.unknown}</td><td>{b.spec[i]??t.unknown}</td></tr>})}</tbody></table></>}</section>
 <section id="tpw34-dp"><h2>Dragon Point</h2><div className="tpw34-dp"><div className="tpw34-ring" aria-hidden="true">DP<br/>—</div><div><strong data-dp-state="DISABLED">{t.lock}</strong><div className="tpw34-method">{[[8,t.categories],[37,t.metrics],[1000,t.method]].map(([n,s])=><div key={s}><b>{n}</b><span>{s}</span></div>)}</div><p>{t.dpNote}</p></div></div></section>
 </main><footer className="tpw34-wrap">{t.footer}</footer></div>;
}
