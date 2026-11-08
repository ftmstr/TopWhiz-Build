/**
 * TUR010 reproducible vinext App Router compatibility build alongside Next.js.
 * Frozen React/RSC peer dependencies are pinned in apps/web/package.json.
 * This config has NO Cloudflare integration, bindings, DNS, preview or deploy.
 * Cloudflare's actual vinext workerd adapter is a future isolated QA gate.
 */
import vinext from "vinext";
export default { plugins: [vinext()] };
