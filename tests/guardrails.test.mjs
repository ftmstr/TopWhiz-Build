import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url));
const catalog = JSON.parse(read("apps/web/data/demo-catalog.json").toString("utf8"));
test("all catalog entries are unique synthetic demo fixtures with complete, nonempty comparison fields", () => {
  assert.ok(catalog.length >= 4);
  assert.equal(new Set(catalog.map((item) => item.id)).size, catalog.length);
  const fields = ["display", "processor", "ram", "storage", "battery", "weight", "connection"];
  for (const item of catalog) {
    assert.ok(["Telefon", "Dizüstü", "Tablet"].includes(item.category));
    assert.ok(item.name && item.id && item.tag);
    for (const field of fields) assert.ok(typeof item.specs[field] === "string" && item.specs[field].trim());
    assert.ok(!("price" in item), "No fabricated price claims are allowed");
    assert.ok(!("source" in item), "Demo fixtures must not fabricate citations");
  }
});
test("chosen source logo PNG is committed without conversion", () => {
  const png = read("apps/web/public/brand/TopWhiz_Logo_02_KirmiziSariMavi.png");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 1254);
  assert.equal(png.readUInt32BE(20), 1254);
});
test("design and prelaunch indexing gates are present", () => {
  const css = read("apps/web/app/globals.css").toString("utf8");
  const layout = read("apps/web/app/layout.tsx").toString("utf8");
  const home = read("apps/web/components/home.tsx").toString("utf8");
  const robots = read("apps/web/public/robots.txt").toString("utf8");
  for (const token of ["--red:", "--gold:", "--blue:", "--bg:"]) assert.ok(css.includes(token));
  assert.ok(layout.includes("index: false"));
  assert.ok(robots.includes("Disallow: /"));
  assert.ok(home.includes("TASARIM ÖNİZLEMESİ"));
  assert.ok(home.includes("DEMO"));
  assert.ok(home.includes('lang="tr"') || layout.includes('lang="tr"'));
});
