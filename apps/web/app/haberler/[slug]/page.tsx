import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { safeMediaPath } from "../../../lib/content-registry";
import { getCmsNews } from "../../../lib/cms-runtime";
import { EditorialShell } from "../../../components/editorial-shell";

export default async function StoryPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const article=await getCmsNews(slug);
  if(!article)return notFound();
  const image=safeMediaPath(article.mediaPath);
  return <EditorialShell>
    <article className="section container editorial-article">
      <span className="section-kicker">TEKNOLOJİ HABERİ</span>
      <h1>{article.title}</h1>
      <p className="hero-description">{article.summary}</p>
      <p><time dateTime={article.publishedAt}>{article.publishedAt.slice(0,10)}</time> · {article.author}</p>
      {image && <figure><Image unoptimized src={image} alt={article.mediaAlt || article.title}
        width={1200} height={675}/></figure>}
      <div className="article-body">{article.body.split(/\n{2,}/).map((paragraph,i)=><p key={i}>{paragraph}</p>)}</div>
      <h2>Kaynaklar</h2>
      <ul>{article.sources.map((source,i)=><li key={i}>
        <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a></li>)}</ul>
      <Link href="/haberler">Tüm haberlere dön</Link>
    </article>
  </EditorialShell>;
}
