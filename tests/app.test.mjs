import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const required = [
  "index.html",
  "src/main.js",
  "src/store.js",
  "src/model.js",
  "public/config/activity.json",
  "public/assets/liukanshan.glb"
];

for (const path of required) {
  const info = await stat(path);
  assert.ok(info.size > 0, `${path} should not be empty`);
}

const config = JSON.parse(await readFile("public/config/activity.json", "utf8"));
assert.equal(config.questions.length, 5, "exactly five question slots are required");
assert.equal(config.speakers.length, 5, "exactly five speaker slots are required");
assert.equal(config.experts.length, 5, "exactly five expert slots are required");

const main = await readFile("src/main.js", "utf8");
for (const phase of ["drawingQuestion", "drawingSpeaker", "drawingExpert", "commenting", "complete"]) {
  assert.ok(main.includes(phase), `main flow should include ${phase}`);
}

const css = await readFile("src/styles.css", "utf8");
assert.ok(!css.includes("fonts.googleapis.com"), "production page should not depend on remote fonts");

const model = await stat("public/assets/liukanshan.glb");
assert.ok(model.size < 5 * 1024 * 1024, "3D model should stay below 5 MB");

console.log("All product checks passed.");
