"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import demoCatalog from "../data/demo-catalog.json";

type Device = (typeof demoCatalog)[number];
type Category = "Tümü" | "Telefon" | "Dizüstü" | "Tablet";
const categories: Category[] = ["Tümü", "Telefon", "Dizüstü", "Tablet"];
const fields = [
  ["display", "Ekran"],
  ["processor", "İşlemci"],
  ["ram", "Bellek (RAM)"],
  ["storage", "Depolama"],
  ["battery", "Batarya"],
  ["weight", "Ağırlık"],
  ["connection", "Bağlantı"]
] as const;

function DeviceVisual({ category, color }: { category: string; color: string }) {
  return (
    <div className={"device-visual visual-" + color} aria-hidden="true">
      {category === "Telefon" ? <span className="phone-silhouette"><span /></span> :
       category === "Dizüstü" ? <span className="laptop-silhouette"><span /></span> :
       <span className="tablet-silhouette"><span /></span>}
    </div>
  );
}

export function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("Tümü");
  const [leftId, setLeftId] = useState("orion-a1");
  const [rightId, setRightId] = useState("orion-max");
  const filtered = useMemo(() => demoCatalog.filter((device) =>
    (category === "Tümü" || device.category === category) &&
    (device.name + " " + device.category + " " + device.tag).toLocaleLowerCase("tr").includes(query.trim().toLocaleLowerCase("tr"))
  ), [query, category]);
  const left = demoCatalog.find((device) => device.id === leftId) as Device;
  const right = demoCatalog.find((device) => device.id === rightId) as Device;

  function selectCompare(deviceId: string) {
    if (deviceId === leftId || deviceId === rightId) {
      document.getElementById("compare")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setRightId(deviceId);
    document.getElementById("compare")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <>
      <a className="skip-link" href="#main">İçeriğe geç</a>
      <div className="preview-bar"><span className="status-dot" /> TASARIM ÖNİZLEMESİ <span className="preview-divider">•</span> Ürün ve teknik özellikler örnek veridir; doğrulanmış katalog değildir.</div>
      <header className="site-header">
        <div className="container header-inner">
          <a className="logo-lockup" href="#top" aria-label="TOPWHIZ ana sayfa">
            <span className="logo-thumb"><Image src="/brand/TopWhiz_Logo_02_KirmiziSariMavi.png" alt="" width={52} height={52} /></span>
            <span className="logo-word">TOP<span>WHIZ</span></span>
          </a>
          <nav className="nav-links" aria-label="Ana menü">
            <a href="#catalog">Cihazlar</a><a href="#compare">Karşılaştır</a><a href="#how">Nasıl çalışır?</a>
          </nav>
          <a className="header-action" href="#catalog">Cihazları keşfet <span aria-hidden="true">↗</span></a>
        </div>
      </header>

      <main id="main">
        <section className="hero container" id="top" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> TEKNOLOJİYİ ANLAMANIN YENİ YOLU</div>
            <h1 id="hero-title">Teknolojiyi <span className="text-gradient">keşfet.</span><br />Özellikleri <span className="text-blue">karşılaştır.</span><br />Bilinçli <span className="text-gold">karar ver.</span></h1>
            <p className="hero-description">Teknik özellikler, karşılaştırmalar ve kaynak odaklı bilgiler tek bir deneyimde. TOPWHIZ; karmaşık teknoloji verisini anlaşılır hale getirmek için tasarlanıyor.</p>
            <div className="hero-actions"><a className="btn btn-primary" href="#catalog">Cihazları incele <span aria-hidden="true">↗</span></a><a className="btn btn-secondary" href="#compare">Karşılaştırma demosu <span aria-hidden="true">⇄</span></a></div>
            <div className="hero-chips"><span>◈ Kaynak şeffaflığı hedefi</span><span>◈ Mobil öncelikli</span><span>◈ Türkçe arayüz</span></div>
          </div>
          <div className="hero-visual">
            <div className="hero-orbit orbit-1" /><div className="hero-orbit orbit-2" />
            <div className="hero-logo-frame"><Image className="hero-logo" src="/brand/TopWhiz_Logo_02_KirmiziSariMavi.png" width={720} height={720} alt="TOPWHIZ: gözlüklü teknolojik ejderha, kırmızı ve sarı halka, mavi dijital dünya ve teknoloji ürünleri" priority /></div>
            <div className="floating-label float-top">TECH <strong>DISCOVERY</strong></div>
            <div className="floating-label float-bottom"><span className="status-dot" /> YENİ BİR KIYASLAMA DENEYİMİ</div>
          </div>
        </section>

        <div className="container"><div className="feature-strip"><div><span className="feature-icon red">01</span><strong>Keşfet</strong><small>Kategori ve arama</small></div><div><span className="feature-icon blue">02</span><strong>Karşılaştır</strong><small>Yan yana özellikler</small></div><div><span className="feature-icon gold">03</span><strong>Değerlendir</strong><small>Kaynaklı karar desteği hedefi</small></div></div></div>

        <section className="section container" id="catalog" aria-labelledby="catalog-title">
          <div className="section-top"><div><span className="section-kicker">CİHAZ KATALOĞU</span><h2 id="catalog-title">Merak ettiğin teknolojiyi <span>bul.</span></h2><p>Arama ve filtreleme etkileşimlerini test etmek için hazırlanmış örnek katalog.</p></div><span className="section-stamp">TUR 002 · İLK TASARIM</span></div>
          <div className="catalog-controls"><label className="searchbox"><span aria-hidden="true">⌕</span><span className="sr-only">Cihaz ara</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cihaz veya kategori ara..." /></label>
            <div className="filter-pills" role="group" aria-label="Cihaz kategorisi">{categories.map((item) => <button type="button" className={category === item ? "pill active" : "pill"} aria-pressed={category === item} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div>
          </div>
          <div className="result-caption" aria-live="polite">{filtered.length} örnek cihaz gösteriliyor</div>
          {filtered.length ? <div className="catalog-grid">{filtered.map((device) => <article className="device-card" key={device.id}>
            <DeviceVisual category={device.category} color={device.color} />
            <div className="card-body"><div className="card-topline"><span>{device.category}</span><span className="sample-tag">DEMO</span></div><h3>{device.name}</h3><p>{device.tag}</p><div className="card-details"><span>{device.specs.display}</span><span>{device.specs.ram} RAM</span></div><button className="card-action" type="button" onClick={() => selectCompare(device.id)}>Karşılaştır <span aria-hidden="true">↗</span></button></div>
          </article>)}</div> : <div className="empty-state">Bu arama için örnek cihaz bulunamadı. Arama ifadesini veya kategoriyi değiştirin.</div>}
          <p className="data-note"><strong>Veri uyarısı:</strong> Bu bölümdeki marka, model, teknik özellik ve cihaz adları arayüz testi için kurgulanmıştır. Gerçek cihaz, güncel fiyat veya performans sonucu olarak kullanılmamalıdır.</p>
        </section>

        <section className="section comparison-section" id="compare" aria-labelledby="compare-title"><div className="container">
          <div className="section-top"><div><span className="section-kicker">AKILLI KIYASLAMA ALANI</span><h2 id="compare-title">Detaylarda <span>farkı gör.</span></h2><p>İki örnek cihaz seç; teknik özelliklerini aynı tabloda incele.</p></div><span className="section-stamp comparison-stamp">ETKİLEŞİMLİ DEMO</span></div>
          <div className="compare-shell">
            <div className="compare-head"><label>CİHAZ 1<select value={leftId} onChange={(event) => setLeftId(event.target.value)}>{demoCatalog.map((device) => <option key={device.id} value={device.id} disabled={device.id === rightId}>{device.name} · {device.category}</option>)}</select></label><div className="versus" aria-hidden="true">VS</div><label>CİHAZ 2<select value={rightId} onChange={(event) => setRightId(event.target.value)}>{demoCatalog.map((device) => <option key={device.id} value={device.id} disabled={device.id === leftId}>{device.name} · {device.category}</option>)}</select></label></div>
            <div className="compare-models"><strong>{left.name}</strong><span>ÖRNEK KARŞILAŞTIRMA</span><strong>{right.name}</strong></div>
            <div className="compare-table" role="table" aria-label="Örnek cihaz teknik özellikleri"><div className="compare-row compare-table-header" role="row"><div role="columnheader">ÖZELLİK</div><div role="columnheader">{left.name}</div><div role="columnheader">{right.name}</div></div>
            {fields.map(([field, label]) => <div className="compare-row" role="row" key={field}><div role="rowheader">{label}</div><div role="cell">{left.specs[field]}</div><div role="cell">{right.specs[field]}</div></div>)}</div>
          </div>
          <p className="compare-disclaimer">Bu karşılaştırma yalnız arayüz ve veri modeli demosudur. Farklı kategoriler arasındaki değerler doğrudan performans üstünlüğü anlamına gelmez.</p>
        </div></section>

        <section className="section container" id="how" aria-labelledby="how-title"><div className="section-top"><div><span className="section-kicker">TOPWHIZ YAKLAŞIMI</span><h2 id="how-title">Önce güvenilirlik. <span>Sonra hız.</span></h2><p>Canlı sürüme geçmeden önce tamamlamayı hedeflediğimiz üç temel ilke.</p></div></div>
          <div className="principle-grid"><article><span className="principle-index">01 / DOĞRULAMA</span><h3>Kaynağı belli bilgiler</h3><p>Her gerçek teknik özelliğin doğrulanabilir kaynak, tarih ve model varyantıyla ilişkilendirilmesi.</p></article><article><span className="principle-index">02 / KARŞILAŞTIRMA</span><h3>Aynı ölçü, net kıyas</h3><p>RAM, depolama, ekran ve benchmark gibi verilerin birim ve sürüm farklılıkları korunarak sunulması.</p></article><article><span className="principle-index">03 / ŞEFFAFLIK</span><h3>Eksik veriyi gizleme</h3><p>Henüz doğrulanmamış bilgi, fiyat ve görsellerin kesinmiş gibi yayınlanmaması.</p></article></div>
        </section>
      </main>
      <footer className="site-footer"><div className="container footer-inner"><div><div className="footer-brand">TOP<span>WHIZ</span></div><small>Teknolojiyi anlamanın yeni yolu.</small></div><div className="footer-right"><span>Public GitHub geliştirme önizlemesi</span><span>© 2026 TOPWHIZ · Çalışma markası, marka incelemesi açık.</span></div></div></footer>
    </>
  );
}
