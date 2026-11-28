/** CI fixture only. Copied into App Router by the guarded local test step, never committed as a route. */
import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {TpwPreview} from "@/components/tpw-preview/preview";
export const metadata:Metadata={title:"TOPWHIZ | Synthetic CI preview",robots:{index:false,follow:false}};
export function generateStaticParams(){return [{locale:"tr"},{locale:"en"}]}
export const dynamicParams=false;
export default async function Page({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;if(locale!=="tr"&&locale!=="en")notFound();
 return <TpwPreview locale={locale}/>;
}
