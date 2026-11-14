import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { EditorialShell } from "../../components/editorial-shell";
import { assessDragonPointReadiness } from "../../../../packages/dragon-point/release-gate.mjs";

export const metadata: Metadata = {
  title:"Dragon Point — Telefon Puanlama Metodolojisi | TOPWHIZ",
  description:"TopWhiz'in 1.000 puanlık telefon karşılaştırma sisteminin ağırlıkları, veri doğrulaması ve yayın kabul şartları.",
  robots:{index:false,follow:false}
};

const LABELS:Record<string,string>={
  performance:"Performans",camera:"Kamera",display:"Ekran",
  battery:"Batarya ve şarj",software:"Yazılım ve güncelleme",
  connectivity:"Bağlantı",design:"Tasarım ve dayanıklılık",audio:"Ses ve kullanım"
};

export default function DragonPointMethodologyPage(){
  const r=assessDragonPointReadiness();
  return <EditorialShell>
    <article className="section container dp-method-page">
      <span className="section-kicker">TOPWHIZ · ŞEFFAF TEKNİK DEĞERLENDİRME</span>
      <div className="dp-method-head">
        <div>
          <h1>DRAGON <span>POINT</span></h1>
          <p className="hero-description">
            Telefonların performansını, kamerasını, ekranını, bataryasını ve diğer
            teknik özelliklerini sekiz kategoride değerlendirmek için tasarlanan,
            toplam 1.000 puanlık TopWhiz metodolojisi.
          </p>
        </div>
        <Image src="/brand/TopWhiz_Logo_02_KirmiziSariMavi.png" alt="TOPWHIZ ejderha logosu" width={136} height={136}/>
      </div>
      <div className="dp-method-warning" role="status">
        <strong>Gerçek cihaz puanları henüz yayımlanmıyor.</strong>
        <p>Ölçütlerin kalibrasyonu, bağımsız veri doğrulaması ve telif hakları
          tamamlanmadığından hiçbir telefonun kesin Dragon Point puanı açıklanamaz.
          Eksik testler sıfır olarak değerlendirilmez.</p>
      </div>
      <h2>Sekiz değerlendirme kategorisi</h2>
      <div className="dp-method-grid">
        {Object.entries(r.categoryWeights).map(([key,weight])=>
          <div key={key} className="dp-method-item">
            <strong>{LABELS[key]}</strong><span>{weight} / {r.maximum} DP</span>
            <div className="dp-method-meter" aria-hidden="true"><i style={{width:(Number(weight)*100/r.maximum)+"%"}}/></div>
          </div>
        )}
      </div>
      <h2>Veri ve metodoloji durumu</h2>
      <p>Teknik motor sürümü: <strong>{r.methodologyVersion}</strong>.
         Tanımlı {r.totalMetrics} alt ölçütün {r.preliminaryMetrics.length} tanesi ön kalibrasyon
         eğrisine sahiptir. {r.uncalibratedMetrics.length} tanesinde ölçüm standardı eksiktir.
         Ön kalibrasyonlar da bağımsız şekilde onaylanmış değildir.</p>
      <p>Puanlama motoru sürüm, kaynak, bölgesel varyant, ölçüm tarihi ve lisans
         alanlarını kontrol eder. Bu alanlar tek başlarına kaynakların bağımsız
         biçimde doğrulandığını veya yeniden yayın hakkının alındığını kanıtlamaz.</p>
      <p><strong>Dragon Point bir fiyat-performans puanı değildir.</strong> Ürün fiyatı teknik
         puana eklenmeyecektir. Farklı benchmark ana sürümleri eşdeğer kabul edilmez.</p>
      <Link className="dp-method-back" href="/telefonlar">Telefon kataloğuna dön</Link>
    </article>
  </EditorialShell>;
}
