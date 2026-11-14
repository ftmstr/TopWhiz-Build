import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir:"./dragon-cinematic-e2e",
  testMatch:"cinematic.spec.ts",
  timeout:45_000,
  expect:{timeout:8_000},
  retries:0,
  workers:1,
  reporter:"line",
  use:{headless:true,browserName:"chromium",
    baseURL:"http://127.0.0.1:3118",trace:"retain-on-failure"},
  webServer:{
    command:"node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3118",
    url:"http://127.0.0.1:3118/dragon-point",
    reuseExistingServer:false,
    timeout:120_000
  }
});
