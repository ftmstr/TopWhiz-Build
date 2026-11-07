import Link from "next/link";
import { approvedContent } from "../../lib/content-registry";
import { EditorialShell } from "../../components/editorial-shell";

export default function PhoneIndex(){
  return <EditorialShell>
    <section className="section container">
      <span className="section-kicker">TOPWHIZ TELEFONLAR</span>
      <h1>Telefon Kataloğu</h1>
      <p className="hero-description">Marka, model, varyant ve teknik özellikleri doğrulanmış kayıtlar.</p>
      {approvedContent.phones.length?
        <div className="article-list">{approvedContent.phones.map(phone=><article className="article-item" key={phone.slug}>
          <h2><Link href={"/telefonlar/"+phone.slug}>{phone.title}</Link></h2>
          <p>{phone.summary}</p>
          <small>{phone.brand} · {phone.modelCode} · {phone.market}</small>
        </article>)}</div>:
        <p className="empty-state">Henüz doğrulanmış gerçek telefon verisi yayımlanmadı. Örnek karşılaştırma için ana sayfadaki demo kullanılabilir.</p>}
    </section>
  </EditorialShell>;
}
