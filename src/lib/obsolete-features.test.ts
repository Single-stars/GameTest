import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("obsolete prototype route and entry point are removed", () => {
  const obsoleteSegment = ["control", "maze", "prototype"].join("-");
  const obsoleteEntryText = ["控制力", "原型"].join("");
  const obsoleteRoute = new URL(`../app/${obsoleteSegment}/page.tsx`, import.meta.url);
  const resultPage = new URL("../app/page.tsx", import.meta.url);
  const resultPageSource = readFileSync(resultPage, "utf8");

  assert.equal(existsSync(obsoleteRoute), false);
  assert.equal(resultPageSource.includes(`/${obsoleteSegment}`), false);
  assert.equal(resultPageSource.includes(obsoleteEntryText), false);
});
