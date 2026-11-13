import { defineConfig } from "@playwright/test";

export default defineConfig({
 testDir:"./beta-e2e",
 testMatch:"beta-static.spec.ts",
 fullyParallel:false,
 workers:1,
 retries:0,
 reporter:"line",
 use:{headless:true,baseURL:"http://127.0.0.1:4173",browserName:"chromium"},
 webServer:{
   command:"python3 -m http.server 4173 --bind 127.0.0.1 --directory ../../beta",
   url:"http://127.0.0.1:4173",
   reuseExistingServer:false,
   timeout:20000
 }
});
