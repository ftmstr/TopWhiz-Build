import Image from "next/image";
import Link from "next/link";
import { assessDragonPointReadiness, presentDragonPoint } from "../../../packages/dragon-point/release-gate.mjs";

/**
 * Production Next.js presentation; fail-closed until independently approved
 * score provenance and a release gate exist. No synthetic score is displayed.
 */
export function DragonPointCard({ score }: { score?: unknown }) {
  const release=assessDragonPointReadiness();
  const view=presentDragonPoint(score);
  return <section className="dp-live-card" aria-labelledby="dp-live-title">
    <div className="dp-live-header">
      <Image src="/brand/TopWhiz_Logo_02_KirmiziSariMavi.png"
        alt="" aria-hidden="true" width={66} height={66} />
      <div>
        <span className="section-kicker">TOPWHIZ TELEFON DEĞERLENDİRMESİ</span>
        <h2 id="dp-live-title">DRAGON <span>POINT</span></h2>
      </div>
    </div>
    <div className="dp-live-status" role="status" aria-live="polite">
      {view.showNumericScore && view.totalScore !== null
        ? <><strong>{view.totalScore}</strong><span>/ {view.maximum} DP</span></>
        : <><strong>Veri bekleniyor</strong><span>/ {view.maximum} DP</span></>}
    </div>
    <p className="dp-live-notice">
      Henüz onaylı ve karşılaştırılabilir gerçek telefon puanı bulunmuyor.
      Dragon Point toplamı tahmin edilmez; eksik testler sıfır sayılmaz.
    </p>
    <dl className="dp-live-summary">
      {Object.entries(release.categoryWeights).map(([key,max])=>
        <div key={key}>
          <dt>{release.categoryNames[key as keyof typeof release.categoryNames]}</dt>
          <dd><span>—</span> / {max} DP</dd>
        </div>
      )}
    </dl>
    <p className="dp-live-foot">
      Yöntem: {view.methodologyVersion} · Durum: Kalibrasyon ve kaynak doğrulaması bekleniyor.
      <Link href="/dragon-point">Dragon Point nasıl hesaplanır?</Link>
    </p>
  </section>;
}
