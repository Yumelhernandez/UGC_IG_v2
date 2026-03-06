/**
 * Deterministic unit tests for enforceArcEndingContracts.
 * No API calls, no network — verifies contract behavior on synthetic message arrays.
 * Run: node tests/test-arc-contracts.js
 */

const { enforceArcEndingContracts } = require("../tools/generate");

// Deterministic rng: always picks first item in pool (0.1 < first bucket in most distributions)
const rng = () => 0.1;

const beats = { pushback_index: 0, reveal_index: 7, win_index: 17, shareable_index: 5 };
const maxChars = 70;
const usedGirlLines = new Set();

function msg(from, text) {
  return { from, text, type_at: 1, response_type: "test" };
}

function makeConversation(n, overrides = {}) {
  const msgs = [];
  for (let i = 0; i < n; i++) {
    msgs.push(msg(i % 2 === 0 ? "girl" : "boy", `message ${i}`));
  }
  Object.entries(overrides).forEach(([idx, m]) => {
    msgs[Number(idx)] = { ...msgs[Number(idx)], ...m };
  });
  return msgs;
}

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ": " + detail : ""}`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────
// TEST 1: rejection — phone in last girl message is stripped
// ─────────────────────────────────────────────────────────────
console.log("\nTest 1: rejection — strips phone from last girl message");
{
  const msgs = makeConversation(10, {
    9: { from: "girl", text: "555 123 4567 call me" }
  });
  const result = enforceArcEndingContracts({ messages: msgs, beats, arcType: "rejection", rng, maxChars, usedGirlLines, format: "D" });
  const last = result[result.length - 1];
  assert("last message is from girl", last.from === "girl");
  assert("last message has no phone number", !/\d{3}[\s-]\d{3,4}[\s-]\d{4}/.test(last.text), last.text);
  assert("last message is a rejection line", /\b(not|nah|pass|hard pass|no shot|i'm good|still no|good luck|keeping it moving|yeah no|i don't think so|that's a no)\b/.test(last.text.toLowerCase()), last.text);
}

// ─────────────────────────────────────────────────────────────
// TEST 2: rejection — double-girl at end collapses to single close
// ─────────────────────────────────────────────────────────────
console.log("\nTest 2: rejection — double-girl at end collapses to single close");
{
  const msgs = makeConversation(10, {
    8: { from: "girl", text: "you're kind of funny though" },
    9: { from: "girl", text: "ok fine" }
  });
  const before = msgs.slice(-2).map(m => m.from);
  const result = enforceArcEndingContracts({ messages: msgs, beats, arcType: "rejection", rng, maxChars, usedGirlLines, format: "D" });
  const last2 = result.slice(-2);
  assert("input had double-girl", before[0] === "girl" && before[1] === "girl");
  assert("output does NOT end with double-girl", !(last2[0].from === "girl" && last2[1].from === "girl"),
    `[-2]=${last2[0].from} [-1]=${last2[1].from}`);
  assert("last message is rejection pool", /\b(not|nah|pass|hard pass|no shot|i'm good|still no|good luck|keeping it moving|yeah no|i don't think so|that's a no)\b/.test(result[result.length - 1].text.toLowerCase()), result[result.length - 1].text);
}

// ─────────────────────────────────────────────────────────────
// TEST 3: number_exchange — triple-girl collapses to double
// ─────────────────────────────────────────────────────────────
console.log("\nTest 3: number_exchange — triple-girl collapses to phone + closer");
{
  const msgs = makeConversation(16, {
    13: { from: "boy", text: "give me your number" },
    14: { from: "girl", text: "and why would i do that" },
    15: { from: "girl", text: "you're annoying. 555 141 9996" }
  });
  // Manually append a closer to simulate triple-girl
  msgs.push({ from: "girl", text: "don't let it go to your head", type_at: 18, response_type: "condition" });

  const l3 = msgs.slice(-3);
  const tripleGirlBefore = l3[0].from === "girl" && l3[1].from === "girl" && l3[2].from === "girl";
  const result = enforceArcEndingContracts({ messages: msgs, beats, arcType: "number_exchange", rng, maxChars, usedGirlLines, format: "D" });
  const l3After = result.slice(-3);
  const tripleGirlAfter = l3After[0].from === "girl" && l3After[1].from === "girl" && l3After[2].from === "girl";

  assert("input had triple-girl", tripleGirlBefore);
  assert("output does NOT have triple-girl", !tripleGirlAfter,
    `[-3]=${l3After[0].from} [-2]=${l3After[1].from} [-1]=${l3After[2].from}`);
  const phonePresent = result.some(m => /\d{3}[\s-]\d{3,4}[\s-]\d{4}/.test(m.text));
  assert("phone number is still present in output", phonePresent);
}

// ─────────────────────────────────────────────────────────────
// TEST 4: cliffhanger — LLM acceptance phrase gets replaced
// ─────────────────────────────────────────────────────────────
console.log("\nTest 4: cliffhanger — LLM acceptance phrase is replaced");
{
  const msgs = makeConversation(10, {
    9: { from: "girl", text: "you're on" }
  });
  const result = enforceArcEndingContracts({ messages: msgs, beats, arcType: "cliffhanger", rng, maxChars, usedGirlLines, format: "D" });
  const last = result[result.length - 1];
  assert("last message is from girl", last.from === "girl");
  assert("last message is NOT an acceptance phrase", !/\b(you're on|locked in|see you|deal)\b/.test(last.text.toLowerCase()), last.text);
  assert("no phone number in output", !result.some(m => /\d{3}[\s-]\d{3,4}[\s-]\d{4}/.test(m.text)));
}

// ─────────────────────────────────────────────────────────────
// TEST 5: comedy Format B — does NOT use LLM-first (uses pool line)
// ─────────────────────────────────────────────────────────────
console.log("\nTest 5: comedy Format B — pool line used, NOT mid-conversation banter");
{
  // 8 messages: alternating girl/boy. [6]=girl banter (non-filler), [7]=boy
  const msgs = [
    msg("girl", "no"),
    msg("boy", "you sure about that"),
    msg("girl", "very sure"),
    msg("boy", "bold claim"),
    msg("girl", "i stand by it"),
    msg("boy", "noted"),
    msg("girl", "ok this is getting weird"),   // prevIdx = 6, non-filler girl
    msg("boy", "told you"),                    // lastIdx = 7
  ];
  const result = enforceArcEndingContracts({ messages: msgs, beats, arcType: "comedy", rng, maxChars, usedGirlLines, format: "B" });
  const last = result[result.length - 1];
  assert("last message is from girl", last.from === "girl", last.from);
  // LLM-first would have kept "ok this is getting weird" — pool should replace it
  assert("last message is a comedy pool line (not LLM's banter)",
    last.text !== "ok this is getting weird",
    last.text);
  assert("no phone number in output", !result.some(m => /\d{3}[\s-]\d{3,4}[\s-]\d{4}/.test(m.text)));
}

// ─────────────────────────────────────────────────────────────
// TEST 6: comedy Format D — LLM-first fires when prevIdx is genuine close
// ─────────────────────────────────────────────────────────────
console.log("\nTest 6: comedy Format D — LLM-first fires, keeps LLM's genuine close");
{
  // 18 messages: [16]=girl genuine close, [17]=boy
  const msgs = makeConversation(18, {
    16: { from: "girl", text: "i hate how funny that was" },
    17: { from: "boy", text: "told you" }
  });
  const result = enforceArcEndingContracts({ messages: msgs, beats, arcType: "comedy", rng, maxChars, usedGirlLines, format: "D" });
  const last = result[result.length - 1];
  assert("last message is from girl", last.from === "girl", last.from);
  assert("LLM's genuine close was kept", last.text === "i hate how funny that was", last.text);
  assert("total messages decreased by 1 (boy message spliced)", result.length === 17, `length=${result.length}`);
}

// ─────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log("\nAll tests passed.");
}
