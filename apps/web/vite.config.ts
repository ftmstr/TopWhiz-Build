/**
 * TUR009 experimental vinext-only Vite entry. Next.js remains the primary
 * build; no Cloudflare plugin, resources or deployment are configured.
 * The local CI probe runs vinext build but does NOT deploy or serve a URL.
 *
 * vinext exposes a Vite plugin and supplies the Vite CLI through its own
 * package; exporting a plain Vite-compatible config object keeps this
 * probe dependency-free until a full reviewed migration.
 */
import vinext from "vinext";
export default {
  plugins: [vinext()],
};
