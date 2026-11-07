import { isUuid } from "./policy.mjs";
import { readPublicPrices } from "./db/reader";
import { readPublishedCms } from "./cms/public-reader";
import { readApprovedMediaAsset } from "./cms/media-reader";
import { handleCmsMedia } from "./cms/media-handler.mjs";

interface Env {
  DATABASE_URL?: string; // Cloudflare encrypted secret; NEVER in Git, response or logs.
  MEDIA_BUCKET?: {get(key:string):Promise<unknown>}; // unbound unless explicitly configured
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}
function empty(status: string) {
  return { status, offers: [], priceBasis: "product_plus_mandatory_shipping", market: "TR", currency: "TRY" };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    if (url.pathname === "/health") return json({ status: "ok", mode: "read_only" });
    if (url.pathname.startsWith("/v1/media/")) {
      if(!env.DATABASE_URL || !/^postgres(ql)?:\/\//.test(env.DATABASE_URL) || !env.MEDIA_BUCKET)
        return json({error:"not_configured"},503);
      return handleCmsMedia(request,{
        bucket:env.MEDIA_BUCKET,
        findApprovedAsset:(id:string)=>readApprovedMediaAsset(env.DATABASE_URL!,id)
      });
    }

    if (url.pathname === "/v1/content" || url.pathname.startsWith("/v1/content/")) {
      const parts=url.pathname.split("/").filter(Boolean);
      const listing=parts.length===2 && parts[1]==="content";
      const detail=parts.length===4 && parts[1]==="content";
      const kind=listing?url.searchParams.get("type"):detail?parts[2]:null;
      const slug=detail?parts[3]:undefined;
      if (!["news","phone"].includes(kind??"") ||
          (listing && (url.searchParams.size!==1 || url.searchParams.getAll("type").length!==1)) ||
          (!listing && (!detail || url.searchParams.size!==0)) ||
          (slug && (slug.length>100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)))) {
        return json({error:"invalid_content_query"},400);
      }
      if (!env.DATABASE_URL || !/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) {
        return json({status:"not_configured",items:[]},503);
      }
      try {
        const data=await readPublishedCms(env.DATABASE_URL,kind as "news"|"phone",slug);
        if (detail && !data) return json({error:"not_found"},404);
        return listing?json({status:"ok",items:data}):json({status:"ok",item:data});
      } catch {
        return json({status:"temporarily_unavailable",items:[]},503);
      }
    }

    if (url.pathname !== "/v1/prices") return json({ error: "not_found" }, 404);

    // Strict public query contract; do not accept user-supplied seller URLs or SQL filters.
    const keys = [...url.searchParams.keys()];
    if (keys.length !== 2 || keys.some((key) => key !== "variantId" && key !== "market") ||
        url.searchParams.getAll("variantId").length !== 1 || url.searchParams.getAll("market").length !== 1) {
      return json({ error: "invalid_query" }, 400);
    }
    const variantId = url.searchParams.get("variantId");
    if (!variantId || !isUuid(variantId) || url.searchParams.get("market") !== "TR") {
      return json({ error: "unsupported_variant_or_market" }, 400);
    }
    if (!env.DATABASE_URL || !/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) {
      return json(empty("not_configured"), 503);
    }
    try {
      const offers = await readPublicPrices(env.DATABASE_URL, variantId, new Date());
      return json({ status: "ok", offers, market: "TR", currency: "TRY",
        priceBasis: "product_plus_mandatory_shipping", freshnessMaxHours: 6 });
    } catch {
      // No raw driver errors, connection strings or unreviewed content leak.
      return json(empty("temporarily_unavailable"), 503);
    }
  }
};
