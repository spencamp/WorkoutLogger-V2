import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("service worker precaches the full module graph for the app shell", () => {
  const swSource = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

  assert.match(swSource, /"\.\/backup-utils\.js"/);
  assert.match(swSource, /"\.\/entry-utils\.js"/);
  assert.match(swSource, /"\.\/stats-utils\.js"/);
});
