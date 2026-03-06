const fs = require("fs");
const path = require("path");
const { buildSlate } = require("../tools/lib/fatigue");
const { loadConfig } = require("../tools/lib/utils");

let failed = 0;

function assert(condition, label, detail = "") {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${label}${detail ? ` (${detail})` : ""}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

(function run() {
  const rootDir = path.join(__dirname, "..");
  const config = loadConfig(rootDir);

  [3, 4, 10].forEach((n) => {
    const a = buildSlate(config, "2026-03-02", 42, n);
    const b = buildSlate(config, "2026-03-02", 42, n);
    const c = buildSlate(config, "2026-03-02", 42, n);
    assert(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(b) === JSON.stringify(c), `deterministic buildSlate n=${n}`);
  });

  const goldenPath = path.join(rootDir, "tests", "golden", "slate-seed-42-n3.json");
  const current = buildSlate(config, "2026-03-02", 42, 3);
  const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
  assert(JSON.stringify(current) === JSON.stringify(golden), "golden manifest stable for n=3");

  if (failed > 0) {
    console.error(`regression-determinism.test.js: ${failed} failed`);
    process.exit(1);
  }
  console.log("regression-determinism.test.js: all passed");
})();
