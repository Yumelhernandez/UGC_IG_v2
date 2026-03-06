const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildSlate, validateSlate } = require("../../tools/lib/fatigue");
const { verifyScript } = require("../../tools/lib/verifier");
const { loadConfig } = require("../../tools/lib/utils");

let failed = 0;

function assert(condition, label, detail = "") {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${label}${detail ? ` (${detail})` : ""}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

function makeScript(date, slot) {
  return {
    video_id: `${date}-${String(slot.slot_index).padStart(3, "0")}`,
    meta: {
      arc_type: slot.arc_type,
      format: slot.format,
      format_variant: slot.format_variant,
      hook_type: slot.hook_type,
      payoff_type: slot.payoff_type,
      template_id: slot.template_id,
      mechanic_ids: slot.mechanic_ids,
      payoff_punch_score: 7.1
    },
    story: { username: "maya", age: 21, caption: "caption", asset: "baddies/story-001.jpg" },
    reply: { from: "boy", text: "you look dangerous" },
    persona: { boy: { name: "Jake", age: 24 }, girl: { name: "Maya", age: 21 } },
    messages: [
      { from: "girl", text: "why", type_at: 1.0 },
      { from: "boy", text: "drop your number then", type_at: 2.2 },
      { from: "girl", text: "fine 305 555 1212", type_at: 3.8 }
    ]
  };
}

(function run() {
  const rootDir = path.join(__dirname, "..", "..");
  const config = loadConfig(rootDir);
  const date = "2026-03-02";

  const manifest = buildSlate(config, date, 42, 4);
  const scripts = manifest.slots.map((slot) => makeScript(date, slot));

  const verified = scripts.map((script) =>
    verifyScript(script, config, {
      stage: "pre_render",
      caps: manifest.fatigue_caps,
      batchScripts: scripts
    })
  );
  assert(verified.every((result) => result.pass), "all scripts pass pre_render verifier with planned slate");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-integration-"));
  scripts.forEach((script, index) => {
    fs.writeFileSync(path.join(tmpDir, `video-${index + 1}.json`), JSON.stringify(script, null, 2));
  });
  const valid = validateSlate(tmpDir, manifest.fatigue_caps);
  assert(valid.valid, "validateSlate passes on planned scripts");

  // Force fatigue cap violation for hook_type at N=4 (cap=1)
  const badScripts = scripts.map((script) => ({ ...script, meta: { ...script.meta, hook_type: "cold_open_bold" } }));
  const badCheck = verifyScript(badScripts[3], config, {
    stage: "pre_render",
    caps: manifest.fatigue_caps,
    batchScripts: badScripts
  });
  assert(!badCheck.pass, "verifier catches fatigue cap violation");
  assert(badCheck.violations.some((v) => v.code === "FATIGUE_HOOK_TYPE_CAP"), "fatigue hook code emitted");

  fs.rmSync(tmpDir, { recursive: true, force: true });

  if (failed > 0) {
    console.error(`verifier-fatigue-integration.test.js: ${failed} failed`);
    process.exit(1);
  }
  console.log("verifier-fatigue-integration.test.js: all passed");
})();
