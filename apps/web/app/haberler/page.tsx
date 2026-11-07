import Link from "next/link";
import { approvedContent } from "../../lib/content-registry";
import { EditorialShell } from "../../components/editorial-shell";

export default function NewsIndex(){
  const articles=[...approvedContent.news].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
  return <EditorialShell>
    <section className="section container">
      <span className="section-kicker">TOPWHIZ HABERLER</span>
      <h1>Teknoloji Haberleri</h1>
      <p className="hero-description">Kaynakları ve kullanım hakları kontrol edilmiş teknoloji haberleri.</p>
      {articles.length? <div className="article-list">{articles.map(article=>
        <article className="article-item" key={article.slug}>
          <h2><Link href={"/haberler/"+article.slug}>{article.title}</Link></h2>
          <p>{article.summary}</p>
          <time dateTime={article.publishedAt}>{article.publishedAt.slice(0,10)}</time>
        </article>)}</div>:
        <p className="empty-state">Henüz onaylı haber yayımlanmadı. İçerik oluşturma ve kaynak doğrulama hattı geliştirme aşamasında.</p>}
    </section>
  </EditorialShell>;
}
