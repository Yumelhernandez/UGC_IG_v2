const fs = require("fs");
const os = require("os");
const path = require("path");
const { computeCaps, buildSlate, validateSlate } = require("../tools/lib/fatigue");
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

  const c1 = computeCaps(1);
  assert(c1.hook_type === 1 && c1.payoff_type === 1 && c1.template_id === 1 && c1.mechanic_combo === 1 && c1.format_wrapper === 1, "computeCaps(1)");

  const c3 = computeCaps(3);
  assert(c3.hook_type === 1, "computeCaps(3) hook");
  assert(c3.payoff_type === 1, "computeCaps(3) payoff");
  assert(c3.template_id === 1, "computeCaps(3) template");
  assert(c3.mechanic_combo === 1, "computeCaps(3) mechanic");
  assert(c3.format_wrapper === 2, "computeCaps(3) wrapper");

  const c4 = computeCaps(4);
  assert(c4.payoff_type === 2, "computeCaps(4) payoff=2");

  const c10 = computeCaps(10);
  assert(c10.hook_type === 2 && c10.payoff_type === 3 && c10.template_id === 2 && c10.mechanic_combo === 2 && c10.format_wrapper === 4, "computeCaps(10)");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fatigue-test-"));
  const a = buildSlate(config, "2026-03-02", 42, 3, null, tmpDir);
  const b = buildSlate(config, "2026-03-02", 42, 3, null, tmpDir);
  const c = buildSlate(config, "2026-03-02", 42, 4, null, tmpDir);

  assert(JSON.stringify(a) === JSON.stringify(b), "buildSlate deterministic for same seed/count");
  assert(a.slots.length === 3, "buildSlate count=3 length");
  assert(c.slots.length === 4, "buildSlate count=4 length");
  assert(a.fatigue_caps.daily_count === 3, "buildSlate caps.daily_count=3");
  assert(c.fatigue_caps.payoff_type === 2, "buildSlate caps payoff for 4");
  assert(a.slots[0].slot_index === 1 && a.slots[2].slot_index === 3, "slot index boundaries");

  const scriptsDir = path.join(tmpDir, "scripts-ok");
  fs.mkdirSync(scriptsDir, { recursive: true });
  for (let i = 0; i < 3; i += 1) {
    const slot = a.slots[i];
    const script = {
      video_id: `2026-03-02-00${i + 1}`,
      meta: {
        format: slot.format,
        format_variant: slot.format_variant,
        hook_type: slot.hook_type,
        payoff_type: slot.payoff_type,
        template_id: slot.template_id,
        mechanic_ids: slot.mechanic_ids
      },
      messages: [
        { from: "girl", text: "what", type_at: 1 },
        { from: "boy", text: "ok", type_at: 2 }
      ]
    };
    fs.writeFileSync(path.join(scriptsDir, `video-${i + 1}.json`), JSON.stringify(script, null, 2));
  }

  const validResult = validateSlate(scriptsDir, a.fatigue_caps);
  assert(validResult.valid, "validateSlate valid case");

  const badDir = path.join(tmpDir, "scripts-bad");
  fs.mkdirSync(badDir, { recursive: true });
  for (let i = 0; i < 3; i += 1) {
    const script = {
      video_id: `2026-03-02-bad-${i + 1}`,
      meta: {
        format: "B",
        format_variant: "short",
        hook_type: "cold_open_bold",
        payoff_type: "number_drop",
        template_id: "T-01",
        mechanic_ids: ["M-ARC-number_exchange", "M-HOOK-cold_open_bold"]
      },
      messages: [
        { from: "girl", text: "what", type_at: 1 },
        { from: "boy", text: "ok", type_at: 2 }
      ]
    };
    fs.writeFileSync(path.join(badDir, `video-bad-${i + 1}.json`), JSON.stringify(script, null, 2));
  }

  const invalidResult = validateSlate(badDir, computeCaps(3));
  assert(!invalidResult.valid, "validateSlate invalid case");
  assert(invalidResult.violations.some((v) => v.startsWith("FATIGUE_HOOK_TYPE_CAP")), "validateSlate emits fatigue violation");

  fs.rmSync(tmpDir, { recursive: true, force: true });

  if (failed > 0) {
    console.error(`fatigue.test.js: ${failed} failed`);
    process.exit(1);
  }
  console.log("fatigue.test.js: all passed");
})();
