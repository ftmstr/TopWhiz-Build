/**
 * Explicit local Cloudflare Vite plugin entry for vinext.
 * NO HTTP writes, remote bindings, external service credentials or deployment.
 * Vite's rsc/ssr child environments are configured in vite.workerd.config.ts.
 */
import handler from "vinext/server/fetch-handler";
export default {
  async fetch(request:Request,env:any,ctx:any){
    const result=await handler.fetch(request,env,ctx);
    // The RSC/SSR HTML must not be stored by browsers or an intermediary.
    // A cached HIT could bypass the rights/revocation security barriers.
    // Cloudflare Worker pre-handler cache is independently disabled in
    // vite.workerd.config.ts; headers alone cannot flush prior edge HITs.
    const headers=new Headers(result.headers);
    headers.set("Cache-Control","private, no-store, max-age=0, must-revalidate");
    headers.set("CDN-Cache-Control","no-store");
    headers.set("Cloudflare-CDN-Cache-Control","no-store");
    return new Response(result.body,{status:result.status,statusText:result.statusText,headers});
  }
};
