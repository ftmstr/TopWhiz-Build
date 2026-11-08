import type { MetadataRoute } from "next";

/** Private development preview: disallow *all* crawlers until trademark,
 * rights, domain and release reviews are signed off. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
