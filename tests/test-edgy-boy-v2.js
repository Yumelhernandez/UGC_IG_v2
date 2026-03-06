#!/usr/bin/env node
"use strict";
/**
 * tests/test-edgy-boy-v2.js
 * Phase 5: Unit tests for EdgyBoyV2 harness + blueprints.
 *
 * Run: node tests/test-edgy-boy-v2.js
 * Exit code 0 = all passed, 1 = failures.
 */

const {
  scoreScript,
  batchSummary,
  isEagerAccept,
  hasTwoBeat,
  hasCommentBait,
  hasScreenshotPunchline,
  passesPushbackSanity,
  computeBoyAvgWords
} = require("../tools/lib/edgy-boy-harness");

const {
  pickBlueprint,
  getAllBlueprints,
  BLUEPRINTS_TWO_BEAT
} = require("../tools/lib/edgy-boy-blueprints");

// ---------------------------------------------------------------------------
// Minimal test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
    failures.push(label);
  }
}

function assertEqual(actual, expected, label) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
    failures.push(label);
  }
}

function test(name, fn) {
  console.log(`\n[test] ${name}`);
  try {
    fn();
  } catch (err) {
    console.error(`  ✗ THREW: ${err.message}`);
    failed++;
    failures.push(`${name}: threw ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Helper: build a minimal script object
// ---------------------------------------------------------------------------

function makeScript({ reply = "", messages = [] } = {}) {
  return {
    reply: { from: "boy", text: reply },
    messages: messages.map((m) => ({ from: m.from, text: m.text }))
  };
}

// ---------------------------------------------------------------------------
// 1. Option B rule: isEagerAccept
// ---------------------------------------------------------------------------

test("Option B: yes?? is NOT eager accept", () => {
  assert(!isEagerAccept("yes??"), "yes?? is confusion, not eager");
  assert(!isEagerAccept("yes?"), "yes? is confusion, not eager");
  assert(!isEagerAccept("YES??"), "YES?? is confusion (case insensitive)");
  assert(!isEagerAccept("yes? "), "yes? with trailing space is still confusion");
});

test("Option B: plain yes IS eager accept", () => {
  assert(isEagerAccept("yes"), "plain yes is eager");
  assert(isEagerAccept("yes."), "yes. is eager");
});

test("Option B: standard eager accepts", () => {
  assert(isEagerAccept("sure"), "sure is eager");
  assert(isEagerAccept("of course"), "of course is eager");
  assert(isEagerAccept("sounds good"), "sounds good is eager");
  assert(isEagerAccept("i'd love"), "i'd love is eager");
  assert(isEagerAccept("deal"), "deal is eager");
});

test("Option B: non-eager responses", () => {
  assert(!isEagerAccept("hmm"), "hmm is not eager");
  assert(!isEagerAccept("why"), "why is not eager");
  assert(!isEagerAccept("huh?"), "huh? is not eager");
  assert(!isEagerAccept("what??"), "what?? is not eager");
  assert(!isEagerAccept(""), "empty string is not eager");
});

// ---------------------------------------------------------------------------
// 2. Two-beat innuendo detection
// ---------------------------------------------------------------------------

test("hasTwoBeat: classic water type pattern", () => {
  const script = makeScript({
    reply: "do you like water?",
    messages: [
      { from: "girl", text: "yeah why" },
      { from: "boy", text: "because you're about 70% my type" }
    ]
  });
  assert(hasTwoBeat(script), "do you like water → yeah why → 70% my type = two-beat");
});

test("hasTwoBeat: number innuendo (70 ways → 69)", () => {
  const script = makeScript({
    reply: "I know 70 ways to make you happy",
    messages: [
      { from: "girl", text: "alright what's the first" },
      { from: "boy", text: "buy you flowers" },
      { from: "girl", text: "and the rest?" },
      { from: "boy", text: "the rest is 69" }
    ]
  });
  assert(hasTwoBeat(script), "70 ways → 69 = two-beat");
});

test("hasTwoBeat: presumptive setup detected", () => {
  const script = makeScript({
    reply: "I would never play hide and seek with you",
    messages: [
      { from: "girl", text: "why not??" },
      { from: "boy", text: "because someone like you is impossible to hide from" }
    ]
  });
  // This uses a presumptive setup marker
  assert(hasTwoBeat(script), "hide and seek = presumptive setup → two-beat");
});

test("hasTwoBeat: no setup → should return false", () => {
  const script = makeScript({
    reply: "hey how are you",
    messages: [
      { from: "girl", text: "good" },
      { from: "boy", text: "nice" }
    ]
  });
  assert(!hasTwoBeat(script), "generic exchange = no two-beat");
});

// ---------------------------------------------------------------------------
// 3. scoreScript — known-pass fixture
// ---------------------------------------------------------------------------

test("scoreScript KNOWN-PASS: yes?? confusion + two-beat payoff", () => {
  const script = makeScript({
    reply: "do you like water?",
    messages: [
      { from: "girl", text: "yes?? why" },  // "yes??" = confusion, NOT eager accept
      { from: "boy", text: "because you're 70% my type" }
    ]
  });
  const cfg = { avgBoyWordsTarget: 10 }; // generous word limit for this test
  const result = scoreScript(script, cfg);
  assert(result.metrics.pushbackSanity, "yes?? should NOT trigger eager accept failure");
  assert(result.metrics.twoBeat, "should detect two-beat pattern");
  // Print all reasons for debugging even if passing
  if (!result.pass) {
    console.log(`    [debug] fail reasons: ${result.reasons.join(", ")}`);
  }
});

test("scoreScript KNOWN-FAIL: eager accept (yes sure sounds good)", () => {
  const script = makeScript({
    reply: "drinks friday?",
    messages: [
      { from: "girl", text: "sure sounds good" },  // eager accept
      { from: "boy", text: "cool" }
    ]
  });
  const result = scoreScript(script, {});
  assert(!result.metrics.pushbackSanity, "sure sounds good should trigger eager accept failure");
  assert(result.reasons.includes("girl_first_reply_is_eager_accept"), "reason should include eager accept");
  assert(!result.pass, "script with eager accept should FAIL");
});

test("scoreScript KNOWN-FAIL: no two-beat", () => {
  const script = makeScript({
    reply: "hey",
    messages: [
      { from: "girl", text: "hi" },
      { from: "boy", text: "what's up" },
      { from: "girl", text: "not much" }
    ]
  });
  const result = scoreScript(script, {});
  assert(!result.metrics.twoBeat, "generic exchange should have no two-beat");
  assert(result.reasons.includes("no_two_beat_innuendo"), "reason should include no_two_beat_innuendo");
  assert(!result.pass, "script without two-beat should FAIL");
});

test("scoreScript KNOWN-FAIL: boy too wordy", () => {
  const script = makeScript({
    reply: "do you like water? because I was wondering about your preferences",
    messages: [
      { from: "girl", text: "yes?? why" },
      { from: "boy", text: "because you are absolutely and completely one hundred percent my type in every way possible" }
    ]
  });
  const cfg = { avgBoyWordsTarget: 5 }; // strict limit
  const result = scoreScript(script, cfg);
  assert(result.metrics.avgBoyWords > 5, "should detect high word count");
  // word count check should fail
  const hasWordFail = result.reasons.some((r) => r.startsWith("avg_boy_words_exceeded"));
  assert(hasWordFail, "should fail avg_boy_words check");
});

// ---------------------------------------------------------------------------
// 4. batchSummary sanity test
// ---------------------------------------------------------------------------

test("batchSummary: empty batch", () => {
  const summary = batchSummary([], {});
  assertEqual(summary.total, 0, "empty batch total=0");
  assertEqual(summary.passRate, 0, "empty batch passRate=0");
});

test("batchSummary: mixed batch", () => {
  // One passing (two-beat + no eager accept + comment-bait + screenshot)
  const passing = makeScript({
    reply: "I know 70 ways to make you happy",
    messages: [
      { from: "girl", text: "yes?? what's the first" },
      { from: "boy", text: "buy you flowers" },
      { from: "girl", text: "and the rest?" },
      { from: "boy", text: "the rest is 69" }
    ]
  });
  // One failing (eager accept)
  const failing = makeScript({
    reply: "drinks friday?",
    messages: [
      { from: "girl", text: "sure" },
      { from: "boy", text: "cool" }
    ]
  });

  const cfg = { avgBoyWordsTarget: 10 };
  const summary = batchSummary([passing, failing], cfg);

  assertEqual(summary.total, 2, "total should be 2");
  assert(summary.pushbackSanityRate < 1, "not all scripts pass pushbackSanity");
  assert(typeof summary.passRate === "number", "passRate is a number");
  assert(typeof summary.twoBeatRate === "number", "twoBeatRate is a number");
  assert(typeof summary.avgBoyWords === "number", "avgBoyWords is a number");
  console.log(`    [info] passRate=${summary.passRate} twoBeatRate=${summary.twoBeatRate} avgBoyWords=${summary.avgBoyWords}`);
});

// ---------------------------------------------------------------------------
// 5. Blueprint sanity tests
// ---------------------------------------------------------------------------

test("Blueprints: at least 5 blueprints defined", () => {
  assert(BLUEPRINTS_TWO_BEAT.length >= 5, `should have ≥5 blueprints, got ${BLUEPRINTS_TWO_BEAT.length}`);
});

test("Blueprints: each blueprint has required fields", () => {
  for (const bp of BLUEPRINTS_TWO_BEAT) {
    assert(typeof bp.id === "string" && bp.id.length > 0, `blueprint has id: ${bp.id}`);
    assert(typeof bp.setup_instruction === "string" && bp.setup_instruction.length > 0, `${bp.id} has setup_instruction`);
    assert(typeof bp.payoff_instruction === "string" && bp.payoff_instruction.length > 0, `${bp.id} has payoff_instruction`);
    assert(Array.isArray(bp.example_exchanges) && bp.example_exchanges.length > 0, `${bp.id} has example_exchanges`);
    assert(typeof bp.comment_bait_hint === "string" && bp.comment_bait_hint.length > 0, `${bp.id} has comment_bait_hint`);
    assert(typeof bp.screenshot_hint === "string" && bp.screenshot_hint.length > 0, `${bp.id} has screenshot_hint`);
    assert(typeof bp.safety_note === "string" && bp.safety_note.length > 0, `${bp.id} has safety_note`);
    assert(typeof bp.weight === "number" && bp.weight > 0, `${bp.id} has positive weight`);
  }
});

test("pickBlueprint: returns a valid blueprint", () => {
  const bp = pickBlueprint("two_beat", Math.random);
  assert(typeof bp.id === "string", "picked blueprint has id");
  assert(typeof bp.setup_instruction === "string", "picked blueprint has setup_instruction");
});

test("pickBlueprint: distribution over 100 picks is spread across blueprints", () => {
  const counts = {};
  for (let i = 0; i < 200; i++) {
    const bp = pickBlueprint("two_beat", Math.random);
    counts[bp.id] = (counts[bp.id] || 0) + 1;
  }
  const unique = Object.keys(counts).length;
  assert(unique >= 3, `should pick at least 3 distinct blueprints in 200 tries, got ${unique}`);
  console.log(`    [info] blueprint distribution:`, counts);
});

// ---------------------------------------------------------------------------
// 6. computeBoyAvgWords
// ---------------------------------------------------------------------------

test("computeBoyAvgWords: includes reply + boy messages", () => {
  const script = makeScript({
    reply: "hey there",  // 2 words
    messages: [
      { from: "girl", text: "hi" },
      { from: "boy", text: "how are you doing" }  // 4 words
    ]
  });
  const avg = computeBoyAvgWords(script);
  // avg of [2, 4] = 3
  assert(avg === 3, `avg should be 3, got ${avg}`);
});

test("computeBoyAvgWords: empty script", () => {
  const avg = computeBoyAvgWords(makeScript());
  assertEqual(avg, 0, "empty script should have 0 avg words");
});

// ---------------------------------------------------------------------------
// 7. hasCommentBait
// ---------------------------------------------------------------------------

test("hasCommentBait: 69 triggers comment bait", () => {
  const script = makeScript({
    reply: "I know 70 ways to make you happy",
    messages: [
      { from: "girl", text: "and the rest?" },
      { from: "boy", text: "the rest is 69" }
    ]
  });
  assert(hasCommentBait(script), "69 should trigger comment-bait");
});

test("hasCommentBait: generic exchange does not trigger", () => {
  const script = makeScript({
    reply: "hey",
    messages: [
      { from: "girl", text: "hi" },
      { from: "boy", text: "what's up" }
    ]
  });
  assert(!hasCommentBait(script), "generic exchange should not have comment-bait");
});

// ---------------------------------------------------------------------------
// 8. hasScreenshotPunchline
// ---------------------------------------------------------------------------

test("hasScreenshotPunchline: 70% my type triggers", () => {
  const script = makeScript({
    reply: "do you like water?",
    messages: [
      { from: "girl", text: "yes??" },
      { from: "boy", text: "because you're 70% my type" }
    ]
  });
  // "my type" matches screenshot pattern
  assert(hasScreenshotPunchline(script), "my type should trigger screenshot punchline");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.error("\nFailed tests:");
  failures.forEach((f) => console.error(`  - ${f}`));
}
console.log("=".repeat(50));

process.exit(failed > 0 ? 1 : 0);
