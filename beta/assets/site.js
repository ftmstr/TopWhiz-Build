"use strict";
// TOPWHIZ BETA: ALL ITEMS BELOW ARE FICTIONAL. Never use for purchases.
const devices = Object.freeze([
  {id:"orion-a1",name:"Orion A1",category:"Telefon",tag:"Kompakt deneyim",color:"red",specs:{display:"6,2 inç · 120 Hz",processor:"Demo Chip A",ram:"8 GB",storage:"128 GB",battery:"4.600 mAh",weight:"178 g",connection:"5G"}},
  {id:"orion-max",name:"Orion Max",category:"Telefon",tag:"Geniş ekran",color:"blue",specs:{display:"6,8 inç · 120 Hz",processor:"Demo Chip B",ram:"12 GB",storage:"256 GB",battery:"5.200 mAh",weight:"212 g",connection:"5G"}},
  {id:"vega-lite",name:"Vega Lite",category:"Telefon",tag:"Günlük kullanım",color:"gold",specs:{display:"6,4 inç · 90 Hz",processor:"Demo Chip C",ram:"6 GB",storage:"128 GB",battery:"5.000 mAh",weight:"190 g",connection:"4G"}},
  {id:"nova-x",name:"Nova X",category:"Telefon",tag:"Yüksek yenileme",color:"slate",specs:{display:"6,7 inç · 144 Hz",processor:"Demo Chip D",ram:"12 GB",storage:"512 GB",battery:"5.100 mAh",weight:"203 g",connection:"5G"}},
  {id:"nebula-14",name:"Nebula 14",category:"Dizüstü",tag:"Hafif iş istasyonu",color:"blue",specs:{display:"14 inç · 90 Hz",processor:"Demo CPU N",ram:"16 GB",storage:"512 GB",battery:"60 Wh",weight:"1,3 kg",connection:"Wi-Fi 6"}},
  {id:"nebula-pro",name:"Nebula Pro",category:"Dizüstü",tag:"Geniş çalışma alanı",color:"red",specs:{display:"16 inç · 120 Hz",processor:"Demo CPU P",ram:"32 GB",storage:"1 TB",battery:"82 Wh",weight:"1,8 kg",connection:"Wi-Fi 6E"}},
  {id:"terra-tab",name:"Terra Tab",category:"Tablet",tag:"Dijital notlar",color:"gold",specs:{display:"11 inç · 90 Hz",processor:"Demo SoC T",ram:"8 GB",storage:"256 GB",battery:"8.000 mAh",weight:"490 g",connection:"Wi-Fi 6"}},
  {id:"terra-plus",name:"Terra Plus",category:"Tablet",tag:"Büyük ekranlı tablet",color:"slate",specs:{display:"12,4 inç · 120 Hz",processor:"Demo SoC U",ram:"12 GB",storage:"256 GB",battery:"10.000 mAh",weight:"560 g",connection:"Wi-Fi 6E"}}
]);
const fields=Object.freeze([["display","Ekran"],["processor","İşlemci"],["ram","Bellek (RAM)"],["storage","Depolama"],["battery","Batarya"],["weight","Ağırlık"],["connection","Bağlantı"]]);
const cards=document.getElementById("device-cards");
const search=document.getElementById("search");
const count=document.getElementById("result-count");
const left=document.getElementById("left-device");
const right=document.getElementById("right-device");
const output=document.getElementById("compare-output");
const filters=Array.from(document.querySelectorAll("[data-filter]"));
let category="Tümü";
const text=x=>String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const device=id=>devices.find(d=>d.id===id);
function row(value,label,other,heading=false){
 return '<div class="compare-row'+(heading?' names':'')+'"><div>'+text(value)+'</div><div class="attribute">'+text(label)+'</div><div>'+text(other)+'</div></div>';
}
function renderComparison(){
 const a=device(left.value),b=device(right.value);
 if(!a||!b){output.textContent="Karşılaştırılacak cihaz seçilemedi.";return;}
 if(a.id===b.id){output.innerHTML='<p class="demo-notice">Lütfen iki farklı örnek cihaz seçin.</p>';return;}
 output.innerHTML=row(a.name,"DEMO · VS",b.name,true)+fields.map(([key,label])=>row(a.specs[key],label,b.specs[key])).join("");
}
function renderCards(){
 const q=search.value.trim().toLocaleLowerCase("tr");
 const visible=devices.filter(d=>(category==="Tümü"||d.category===category)&&
 (d.name+" "+d.category+" "+d.tag).toLocaleLowerCase("tr").includes(q));
 count.textContent=visible.length+" örnek cihaz gösteriliyor";
 if(!visible.length){cards.innerHTML='<div class="empty-state"><span aria-hidden="true">⌕</span><div><h3>Sonuç bulunamadı</h3><p>Farklı bir kelime veya kategori deneyin.</p></div></div>';return;}
 cards.innerHTML=visible.map(d=>'<article class="device-card">'+
  '<div class="product-visual '+text(d.color)+'" aria-hidden="true"><span class="silhouette '+(d.category==="Telefon"?"phone":d.category==="Tablet"?"tablet":"laptop")+'"></span></div>'+
  '<div class="card-content"><div class="card-meta"><span>'+text(d.category)+'</span><span class="sample">DEMO</span></div>'+
  '<h3>'+text(d.name)+'</h3><p class="card-tag">'+text(d.tag)+'</p>'+
  '<div class="card-details"><span>▣ '+text(d.specs.display)+'</span><span>◆ '+text(d.specs.processor)+'</span><span>▰ '+text(d.specs.ram)+' RAM · '+text(d.specs.storage)+'</span></div>'+
  '<button type="button" class="card-action" data-compare="'+text(d.id)+'" aria-label="'+text(d.name)+' örnek cihazını karşılaştır">Karşılaştırmaya ekle ⇄</button></div></article>').join("");
}
for(const d of devices){
 for(const target of [left,right]){const option=document.createElement("option");option.value=d.id;option.textContent=d.name+" · "+d.category+" (DEMO)";target.append(option);}
}
left.value="orion-a1";
right.value="orion-max";
left.addEventListener("change",renderComparison);
right.addEventListener("change",renderComparison);
search.addEventListener("input",renderCards);
filters.forEach(button=>button.addEventListener("click",()=>{
 category=button.dataset.filter;
 filters.forEach(el=>{const active=el===button;el.classList.toggle("active",active);el.setAttribute("aria-pressed",String(active));});
 renderCards();
}));
cards.addEventListener("click",event=>{
 const button=event.target.closest("button[data-compare]");
 if(!button||!cards.contains(button))return;
 const id=button.dataset.compare;
 if(!device(id))return;
 if(left.value!==id&&right.value!==id)right.value=id;
 else if(left.value===id&&right.value===id)right.value=devices.find(x=>x.id!==id).id;
 renderComparison();
 document.getElementById("compare").scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
});
renderCards();
renderComparison();