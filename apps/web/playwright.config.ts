import {defineConfig} from "@playwright/test";

export default defineConfig({
  testDir:"./e2e",
  testMatch:"*.spec.ts",
  timeout:30_000,
  expect:{timeout:8_000},
  retries:0,
  workers:2,
  reporter:[["list"],["html",{open:"never",outputFolder:"playwright-report"}]],
  use:{
    baseURL:"http://127.0.0.1:3109",
    browserName:"chromium",
    trace:"retain-on-failure",
    screenshot:"only-on-failure"
  },
  outputDir:"test-results"
});
