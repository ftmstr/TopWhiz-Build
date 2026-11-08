/**
 * Explicit local Cloudflare Vite plugin entry for vinext.
 * NO HTTP writes, remote bindings, external service credentials or deployment.
 * Vite's rsc/ssr child environments are configured in vite.workerd.config.ts.
 */
import handler from "vinext/server/fetch-handler";
export default {
  fetch(request:Request,env:any,ctx:any){
    return handler.fetch(request,env,ctx);
  }
};
