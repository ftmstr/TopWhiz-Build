'use strict';
// All names, stories, and values are invented for UI testing. No actual news or score.
const I={
tr:{skip:'İçeriğe geç',notice:'Yalnızca yerel sentetik demo. Haberler ve telefonlar kurgusaldır; yayın ve satın alma için kullanılamaz.',news:'Haberler',phones:'Telefonlar',compare:'Karşılaştır',dragon:'Dragon Point',kicker:'TEKNOLOJİ · SAVUNMA · TELEFON',hero:'Teknolojiyi keşfet. Özellikleri karşılaştır.',intro:'Yerel tasarım denemesi: haberleri oku, cihazları incele ve teknik özellikleri yan yana gör.',start:'Karşılaştırmaya başla',editorial:'EDİTORYAL DEMO',fiction:'KURGUSAL',category:'Kategori',all:'Tümü',tech:'Teknoloji',trdef:'Türkiye savunma teknolojisi',globaldef:'Dünya savunma teknolojisi',newsSearch:'Haber ara',catalog:'TEKNİK KATALOG',phoneSearch:'Telefon ara',compareHint:'İki farklı kurgusal telefon seç. Farklı teknik özellikleri incele; otomatik kazanan veya puan yoktur.',first:'Birinci telefon',second:'İkinci telefon',swap:'Yer değiştir',diff:'Yalnız farklar',dpTitle:'Teknik puanlama metodolojisi',blocked:'Puanlar kullanılamıyor',dpDesc:'37 ölçüt, 8 kategori, 1.000 DP metodoloji üst sınırı. Kalibrasyon ve hak incelemesi tamamlanmadığından hiçbir cihaz puanı veya sıralaması gösterilmez.',footer:'Yerel sentetik önizleme · Gerçek kaynak, medya, fiyat, reklam ve harici bağlantı yok · Yayın kapalı',read:'Örnek metni oku',count:'sonuç',none:'Eşleşen örnek yok.',add:'Karşılaştırmaya ekle',selected:'Karşılaştırmada',same:'İki farklı telefon seçin.',feature:'Özellik',noDiff:'Fark bulunamadı.',screen:'Ekran',chip:'İşlemci',ram:'RAM',storage:'Depolama',battery:'Batarya',weight:'Ağırlık',network:'Bağlantı',inch:'inç',demo:'Demo'},
en:{skip:'Skip to content',notice:'Local synthetic demo only. Stories and phones are fictional; not for publication or purchase decisions.',news:'News',phones:'Phones',compare:'Compare',dragon:'Dragon Point',kicker:'TECHNOLOGY · DEFENCE · PHONES',hero:'Explore technology. Compare specifications.',intro:'Local design demo: read stories, browse devices and compare specifications side by side.',start:'Start comparing',editorial:'EDITORIAL DEMO',fiction:'FICTIONAL',category:'Category',all:'All',tech:'Technology',trdef:'Türkiye defence technology',globaldef:'Global defence technology',newsSearch:'Search news',catalog:'TECHNICAL CATALOGUE',phoneSearch:'Search phones',compareHint:'Select two different fictional phones. Review specification differences; no automatic winner or score.',first:'First phone',second:'Second phone',swap:'Swap phones',diff:'Differences only',dpTitle:'Technical scoring methodology',blocked:'Scores unavailable',dpDesc:'37 metrics, 8 categories, 1,000 DP methodology maximum. No device score or ranking until calibration and rights review are completed.',footer:'Local synthetic preview · No real sources, media, prices, ads or external links · Release closed',read:'Read example text',count:'results',none:'No matching examples.',add:'Add to comparison',selected:'In comparison',same:'Select two different phones.',feature:'Specification',noDiff:'No differences found.',screen:'Display',chip:'Processor',ram:'RAM',storage:'Storage',battery:'Battery',weight:'Weight',network:'Connectivity',inch:'inch',demo:'Demo'}
};
let stories=[
{cat:'tech',tr:['Kurgusal laboratuvarda ekran testi','Bir örnek teknoloji dosyasında ekran okunabilirliği ele alınıyor.','Bu hayalî editoryal örnek, parlaklık ve ekran okunabilirliği kavramlarını açıklamak için hazırlanmıştır. Gerçek laboratuvar, üretici veya ölçüm sonucu içermez.'],en:['Fictional display laboratory test','An example technology brief explores display readability.','This imaginary editorial example explains brightness and readability concepts. It contains no real laboratory, manufacturer or measurement result.']},
{cat:'trdef',tr:['Kurgusal savunma teknolojisi eğitim dosyası','Türkiye kategorisi için hayalî bakım eğitimi haberi.','Bu örnek yalnızca savunma teknolojisi haber şablonunu gösterir. Gerçek kurum, sistem, olay veya teknik operasyon bilgisi içermez.'],en:['Fictional defence technology training brief','An imaginary maintenance training story for the Türkiye category.','This example demonstrates the defence technology news template only. It contains no real organization, system, event or operational information.']},
{cat:'globaldef',tr:['Kurgusal uluslararası test merkezi dosyası','Dünya savunma teknolojisi kategorisinin örnek metni.','Bu hayalî dosya, kalite yönetimi ve sivil güvenlik incelemesi kavramlarını tanıtır. Gerçek savunma haberi veya olay değildir.'],en:['Fictional international test centre brief','Example text for the global defence technology category.','This imaginary brief introduces quality management and civilian safety review concepts. It is not an actual defence news event.']}
];
// The projection mode is separate from the standalone fictional demo. No fallback on invalid data.
const projection=document.getElementById('projection-data');
let projectedGeneration=null;
if(projection){
 stories=[];
 try{
  const p=JSON.parse(projection.content.textContent);
  if(p.status!=='LOCAL_SYNTHETIC_NEWS'||!Number.isSafeInteger(p.generation)||p.generation<1||!Array.isArray(p.stories)||!p.stories.length||p.stories.length>30||!p.stories.every(s=>['tr','en'].every(l=>Array.isArray(s[l])&&s[l].length===3&&s[l].every(x=>typeof x==='string'))))throw Error('BAD_LOCAL_SNAPSHOT');
  projectedGeneration=p.generation;
  stories=p.stories.map(s=>({cat:'uncategorized',tr:s.tr,en:s.en}));
 }catch{}
 // Approved news schema currently has no category field; don't infer a category.
 document.getElementById('category').value='all';
 document.getElementById('category').disabled=true;
}
I.tr.uncategorized='Kategori belirtilmemiş';I.en.uncategorized='Uncategorized';
let phones=[
{id:'a',name:'Demo Orion A1',spec:[6.2,'Demo Chip A',8,128,4600,178,'5G']},
{id:'b',name:'Demo Orion Max',spec:[6.8,'Demo Chip B',12,256,5200,212,'5G']},
{id:'c',name:'Demo Vega Lite',spec:[6.4,'Demo Chip C',6,128,5000,190,'4G']},
{id:'d',name:'Demo Nova X',spec:[6.7,'Demo Chip D',12,512,5100,203,'5G']}
];
const fields=['screen','chip','ram','storage','battery','weight','network'];
const phoneProjection=document.getElementById('phone-projection-data');
if(phoneProjection){
 phones=[];
 try{
  const p=JSON.parse(phoneProjection.content.textContent);
  if(p.status!=='LOCAL_SYNTHETIC_DEVICES'||!Array.isArray(p.phones)||!p.phones.length||p.phones.length>30||!p.phones.every(x=>typeof x.id==='string'&&typeof x.name==='string'&&Array.isArray(x.spec)&&x.spec.length===7&&x.spec.every(v=>v===null||typeof v==='string')))throw Error('BAD_PHONE_SNAPSHOT');
  phones=p.phones;
 }catch{}
}
I.tr.unknown='Bilinmiyor';I.en.unknown='Unknown';
Object.assign(I.tr,{menu:'Menü',darkTheme:'Koyu tema',browseNews:'Haberleri keşfet',sections:'EDİTORYAL ALANLAR',atlas:'Telefon atlası',categoryUnavailable:'İmzalı kayıtlarda kategori yok; sınıflandırma yapılmadı.',compareKicker:'YAN YANA TEKNİK İNCELEME',categories:'Kategori',metrics:'Ölçüt',methodMax:'Metodoloji üst sınırı',knownFields:'bilinen teknik alan',coverageNote:'Kapsam yalnız bilinen teknik alanları sayar; puan veya sıralama değildir.'});
Object.assign(I.en,{menu:'Menu',darkTheme:'Dark theme',browseNews:'Explore news',sections:'EDITORIAL DESKS',atlas:'Phone atlas',categoryUnavailable:'Signed records have no category; no classification was inferred.',compareKicker:'SIDE-BY-SIDE TECHNICAL REVIEW',categories:'Categories',metrics:'Metrics',methodMax:'Methodology maximum',knownFields:'known specification fields',coverageNote:'Coverage counts known specification fields only; it is not a score or ranking.'});
let lang='tr';
const $=id=>document.getElementById(id),t=k=>I[lang][k],el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const fold=s=>s.toLocaleLowerCase(lang==='tr'?'tr-TR':'en-US').trim();
const matches=(s,q)=>fold(s).includes(fold(q));
function syncCategories(){const select=$('category');for(const button of document.querySelectorAll('[data-category]')){button.disabled=select.disabled;button.setAttribute('aria-pressed',String(button.dataset.category===select.value));}$('category-note').hidden=!select.disabled;}
for(const button of document.querySelectorAll('[data-category]'))button.addEventListener('click',()=>{if($('category').disabled)return;$('category').value=button.dataset.category;renderNews()});
for(const link of document.querySelectorAll('[data-desk]'))link.addEventListener('click',()=>{if($('category').disabled)return;$('category').value=link.dataset.desk;renderNews()});
function setTheme(dark){document.documentElement.dataset.theme=dark?'dark':'light';$('theme').setAttribute('aria-pressed',String(dark));}
$('theme').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme!=='dark'));
function setMenu(open){$('menu').setAttribute('aria-expanded',String(open));}
$('menu').addEventListener('click',()=>setMenu($('menu').getAttribute('aria-expanded')!=='true'));
$('main-nav').addEventListener('click',event=>{if(event.target.closest('a'))setMenu(false)});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('menu').getAttribute('aria-expanded')==='true'){setMenu(false);$('menu').focus();}});
function formatted(v,i){if(v===null||v===undefined)return t('unknown');if(phoneProjection)return v;const n=x=>new Intl.NumberFormat(lang==='tr'?'tr-TR':'en-US').format(x);return [()=>n(v)+' '+t('inch'),()=>v,()=>n(v)+' GB',()=>n(v)+' GB',()=>n(v)+' mAh',()=>n(v)+' g',()=>v][i]()}
function renderNews(){syncCategories();const q=$('news-search').value,c=$('category').value,items=stories.filter(s=>(c==='all'||c===s.cat)&&matches(s[lang].join(' ')+' '+t(s.cat),q));$('news-count').textContent=items.length+' '+t('count')+(projection?(projectedGeneration===null?(lang==='tr'?' · Veri kullanılamıyor':' · Data unavailable'):(lang==='tr'?' · Yerel nesil ':' · Local generation ')+projectedGeneration):'');const list=$('articles');list.replaceChildren();for(const s of items){const card=el('article',undefined,'card');card.dataset.category=s.cat;card.append(el('small',t('fiction')+' · '+t(s.cat)),el('h3',s[lang][0]),el('p',s[lang][1]));const d=el('details');d.append(el('summary',t('read')),el('p',s[lang][2]));card.append(d);list.append(card)}if(!items.length)list.append(el('p',t('none')))}
const knownCount=p=>p.spec.filter(v=>v!==null&&v!==undefined).length;
const coverage=p=>knownCount(p)+' / '+fields.length+' '+t('knownFields');
function renderPhones(){const list=$('devices'),items=phones.filter(p=>matches(p.name+' '+p.spec[1],$('phone-search').value));list.replaceChildren();$('phone-count').textContent=items.length+' '+t('count');for(const p of items){const c=el('article',undefined,'card');c.append(el('small',t('fiction')),el('h3',p.name),el('p',[0,2,4].filter(i=>p.spec[i]!==null&&p.spec[i]!==undefined).map(i=>formatted(p.spec[i],i)+(i===2?' RAM':'')).join(' · ')||t('unknown')),el('p',coverage(p),'spec-coverage'));const selected=[$('left').value,$('right').value].includes(p.id);const b=el('button',t(selected?'selected':'add'));b.type='button';b.setAttribute('aria-pressed',String(selected));b.addEventListener('click',()=>{if($('left').value!==p.id)$('right').value=p.id;else if($('right').value===p.id)$('right').value=phones.find(x=>x.id!==p.id)?.id??'';renderCompare();renderPhones();$('left').focus();$('compare').scrollIntoView()});c.append(b);list.append(c)}if(!items.length)list.append(el('p',t('none')))}
function renderCompare(){const a=phones.find(p=>p.id===$('left').value),b=phones.find(p=>p.id===$('right').value),root=$('comparison'),status=$('compare-status');root.replaceChildren();$('compare-coverage').hidden=true;$('compare-coverage-text').textContent='';if(!a||!b||a===b){status.textContent=t('same');return}status.textContent='';$('compare-coverage').hidden=false;$('compare-coverage-text').textContent=a.name+': '+coverage(a)+' · '+b.name+': '+coverage(b);const table=el('table'),head=el('thead'),tr=el('tr');for(const label of [t('feature'),a.name,b.name]){const th=el('th',label);th.scope='col';tr.append(th)}head.append(tr);table.append(head);const body=el('tbody');let count=0;fields.forEach((f,i)=>{const different=a.spec[i]!==null&&b.spec[i]!==null&&a.spec[i]!==b.spec[i];if($('diff').checked&&!different)return;const row=el('tr',undefined,different?'different':'');const th=el('th',t(f));th.scope='row';row.append(th,el('td',formatted(a.spec[i],i)),el('td',formatted(b.spec[i],i)));body.append(row);count++});table.append(body);root.append(table);if(!count)status.textContent=t('noDiff')}
function setLang(l){lang=l;document.documentElement.lang=l;document.title='TOPWHIZ | '+(l==='tr'?'Yerel sentetik demo':'Local synthetic demo');document.querySelectorAll('[data-i]').forEach(n=>{n.textContent=t(n.dataset.i)});for(const id of ['tr','en'])$(id).setAttribute('aria-pressed',String(id===l));renderNews();renderPhones();renderCompare()}
for(const id of ['left','right'])for(const p of phones){const o=el('option',p.name);o.value=p.id;$(id).append(o)}$('left').value=phones[0]?.id??'';$('right').value=phones[1]?.id??'';
for(const id of ['tr','en'])$(id).addEventListener('click',()=>setLang(id));
$('category').addEventListener('change',renderNews);$('news-search').addEventListener('input',renderNews);$('phone-search').addEventListener('input',renderPhones);
for(const id of ['left','right'])$(id).addEventListener('change',()=>{renderCompare();renderPhones()});$('diff').addEventListener('change',renderCompare);
$('swap').addEventListener('click',()=>{const l=$('left').value;$('left').value=$('right').value;$('right').value=l;renderCompare();renderPhones()});setLang('tr');
