import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { approvedContent, safeMediaPath } from "../../../lib/content-registry";
import { EditorialShell } from "../../../components/editorial-shell";

export default async function PhonePage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const phone=approvedContent.phones.find(item=>item.slug===slug);
  if(!phone)return notFound();
  const image=safeMediaPath(phone.mediaPath);
  return <EditorialShell>
    <article className="section container editorial-article">
      <span className="section-kicker">DOĞRULANMIŞ CİHAZ KATALOĞU</span>
      <h1>{phone.title}</h1>
      <p className="hero-description">{phone.summary}</p>
      <p>{phone.brand} · Model: {phone.modelCode} · Bölge: {phone.market}</p>
      {image && <figure><Image src={image} alt={phone.mediaAlt || phone.title} width={1000} height={800}/></figure>}
      <h2>Model varyantları</h2>
      <ul>{phone.variants.map((v,i)=><li key={i}>{v.name}: RAM {v.ramGb} GB · Depolama {v.storageGb} GB · {v.warrantyClass}</li>)}</ul>
      <h2>Teknik özellikler</h2>
      <table className="editorial-specs"><tbody>{phone.specifications.map((spec,i)=><tr key={i}>
        <th scope="row">{spec.label}</th><td>{spec.value}</td><td>Kaynak: {spec.sourceLabel}</td>
      </tr>)}</tbody></table>
      <p className="data-note">Fiyat teklifleri, aynı bölge ve varyant için doğrulandığında ayrı mağaza listesinde gösterilir.</p>
      <Link href="/telefonlar">Tüm telefonlara dön</Link>
    </article>
  </EditorialShell>;
}
