/**
 * Cloudflare Queue consumer, ready for a future explicit binding.
 * No trigger is declared in Wrangler; this cannot process live messages yet.
 */
import { createCloudflareZonePurger, consumeCmsPurgeBatch } from "./cloudflare-adapters.mjs";

interface Msg { body: unknown; ack(): void; retry(): void }
interface Batch { messages: Msg[]; retryAll(): void }
interface Env {
  CF_ZONE_ID?:string;
  CF_PURGE_TOKEN?:string;
  SITE_ORIGIN?:string;
}
export default {
  async fetch(): Promise<Response> {
    return new Response("not_found",{status:404,headers:{"Cache-Control":"no-store"}});
  },
  async queue(batch:Batch, env:Env):Promise<void>{
    if(!env.CF_ZONE_ID || !env.CF_PURGE_TOKEN || !env.SITE_ORIGIN){
      batch.retryAll();
      return;
    }
    try {
      const purge=createCloudflareZonePurger({
        fetcher:fetch,zoneId:env.CF_ZONE_ID,
        apiToken:env.CF_PURGE_TOKEN,origin:env.SITE_ORIGIN
      });
      await consumeCmsPurgeBatch(batch,purge);
    } catch {
      batch.retryAll();
    }
  }
};
