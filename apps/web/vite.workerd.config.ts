/**
 * TUR011 CI-only local Cloudflare workerd experiment.
 * Only invoked with explicit --config vite.workerd.config.ts.
 * Does NOT replace Next.js or normal local vinext Vite config.
 * No external service, Account ID, worker route, secret, R2, Queue or deploy.
 * Refrain from running this process against untrusted code locally.
 */
import {defineConfig} from "vite";
import vinext from "vinext";
import {cloudflare} from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment:{name:"rsc",childEnvironments:["ssr"]},
      remoteBindings:false,
      config:{
        name:"topwhiz-tur011-synthetic-local-only",
        main:"./workerd-entry.ts",
        compatibility_date:"2026-09-25",
        compatibility_flags:["nodejs_compat"],
        workers_dev:false,
        // Cloudflare Worker pre-handler cache must be explicitly disabled:
        // a stale edge HIT can bypass ALL revocation code.
        cache:{enabled:false}
      }
    })
  ],
  server:{host:"127.0.0.1",port:3116,strictPort:true},
  preview:{host:"127.0.0.1",port:3116,strictPort:true}
});
