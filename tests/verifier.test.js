const { verifyScript } = require("../tools/lib/verifier");

let failed = 0;

function assert(condition, label, detail = "") {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${label}${detail ? ` (${detail})` : ""}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

function baseConfig() {
  return {
    banned_phrases: ["onlyfans"],
    safety: {
      banned_phrases: ["send nudes"],
      risk_patterns: [/\\bkys\\b/i]
    },
    script_quality: {
      first_gap_max: 4.8
    },
    verifier: {
      post_m1_cutover_date: "2026-03-02"
    }
  };
}

function buildScript(overrides = {}) {
  const base = {
    video_id: "2026-03-02-001",
    meta: {
      arc_type: "number_exchange",
      format: "B",
      format_variant: "short",
      hook_type: "cold_open_bold",
      payoff_type: "number_drop",
      template_id: "T-01",
      mechanic_ids: ["M-01"],
      payoff_punch_score: 7.2,
      ...((overrides && overrides.meta) || {})
    },
    story: { username: "maya", age: 21, caption: "caption", asset: "baddies/story-001.jpg" },
    reply: { from: "boy", text: "you look dangerous" },
    persona: { boy: { name: "Jake", age: 23 }, girl: { name: "Maya", age: 21 } },
    messages: [
      { from: "girl", text: "why are you like this", type_at: 1.0 },
      { from: "boy", text: "drop your number then", type_at: 2.4 },
      { from: "girl", text: "fine 305 555 1212", type_at: 3.8 }
    ],
  };
  const merged = { ...base, ...overrides };
  merged.meta = { ...base.meta, ...((overrides && overrides.meta) || {}) };
  return merged;
}

(function run() {
  const config = baseConfig();

  const missingMessages = buildScript();
  delete missingMessages.messages;
  const r1 = verifyScript(missingMessages, config, { stage: "post_generate" });
  assert(!r1.pass, "missing messages fails");
  assert(r1.violations.some((v) => v.code === "SCHEMA_MISSING_FIELD"), "missing field violation present");

  const banned = buildScript({
    messages: [
      { from: "girl", text: "send nudes", type_at: 1 },
      { from: "boy", text: "no", type_at: 2 }
    ]
  });
  const r2 = verifyScript(banned, config, { stage: "post_generate" });
  assert(!r2.pass, "banned phrase fails");
  assert(r2.violations.some((v) => v.code === "SAFETY_BANNED_PHRASE"), "safety banned phrase code");

  const missingPayoff = buildScript({ meta: { payoff_punch_score: null } });
  const r3 = verifyScript(missingPayoff, config, { stage: "post_generate" });
  assert(r3.pass, "post_generate missing payoff is warn-only");
  assert(r3.violations.some((v) => v.code === "PAYOFF_SCORE_MISSING" && v.severity === "warn"), "missing payoff warn at post_generate");

  const r4 = verifyScript(missingPayoff, config, { stage: "post_repair" });
  assert(!r4.pass, "post_repair missing payoff is fatal");
  assert(r4.violations.some((v) => v.code === "PAYOFF_SCORE_MISSING" && v.severity === "fatal"), "missing payoff fatal at post_repair");

  const lowScore = buildScript({ meta: { payoff_punch_score: 5.5 } });
  const r5 = verifyScript(lowScore, config, { stage: "pre_render" });
  assert(!r5.pass, "pre_render low payoff fails");
  assert(r5.violations.some((v) => v.code === "PAYOFF_SCORE_BELOW_THRESHOLD"), "below threshold code at pre_render");

  const preM1 = buildScript({ video_id: "2026-02-20-001", meta: { hook_type: undefined } });
  delete preM1.meta.hook_type;
  const r6 = verifyScript(preM1, config, { stage: "post_generate" });
  assert(r6.violations.some((v) => v.code === "SCHEMA_NEW_FIELD_MISSING" && v.severity === "warn"), "pre-M1 missing new field warns");

  const postM1 = buildScript({ video_id: "2026-03-03-001", meta: { hook_type: undefined } });
  delete postM1.meta.hook_type;
  const r7 = verifyScript(postM1, config, { stage: "post_generate" });
  assert(!r7.pass, "post-M1 missing new field fails");
  assert(r7.violations.some((v) => v.code === "SCHEMA_NEW_FIELD_MISSING" && v.severity === "fatal"), "post-M1 missing new field fatal");

  const caps = { hook_type: 1, payoff_type: 1, template_id: 1, mechanic_combo: 1, format_wrapper: 1 };
  const sA = buildScript({ video_id: "2026-03-02-001" });
  const sB = buildScript({ video_id: "2026-03-02-002" });
  const r8 = verifyScript(sB, config, { stage: "post_generate", caps, batchScripts: [sA, sB] });
  assert(!r8.pass, "fatigue over-cap fails");
  assert(r8.violations.some((v) => v.code === "FATIGUE_HOOK_TYPE_CAP"), "fatigue hook cap code");

  for (let i = 0; i < 50; i += 1) {
    const fuzz = buildScript();
    if (i % 2 === 0) fuzz.messages[0].type_at = "bad";
    if (i % 3 === 0) fuzz.meta.arc_type = "invalid_arc";
    if (i % 5 === 0) fuzz.messages[1].text = "";
    const result = verifyScript(fuzz, config, { stage: "post_generate" });
    assert(typeof result.pass === "boolean", `fuzz result has pass boolean #${i}`);
    assert(Array.isArray(result.violations), `fuzz result has violations array #${i}`);
  }

  if (failed > 0) {
    console.error(`verifier.test.js: ${failed} failed`);
    process.exit(1);
  }
  console.log("verifier.test.js: all passed");
})();
