/**
 * Offline dry-run tests for the brainrot arc integration.
 * Tests the validator, parser, retry feedback, and candidate selection.
 * No API key or network access required.
 *
 * Run: node tests/test-brainrot-generation.js
 */

"use strict";

const {
  scoreBrainrotScript,
  recontextualizationScore,
  containsValidCue,
  isExactValidCue,
  buildRetryFeedback,
  selectBestCandidate,
  VALID_DISRUPTION_CUES
} = require("../tools/lib/brainrot-validator");

const { parseBrainrotScripts } = require("../tools/lib/llm");

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed += 1;
  } else {
    console.error(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
    failed += 1;
  }
}

// ---------------------------------------------------------------------------
// SECTION 1: containsValidCue / isExactValidCue
// ---------------------------------------------------------------------------
console.log("\n── Section 1: Disruption Cue Matching ──");

for (const cue of VALID_DISRUPTION_CUES) {
  assert(`containsValidCue exact: "${cue}"`, containsValidCue(cue));
  assert(`isExactValidCue exact: "${cue}"`, isExactValidCue(cue));
}

// Fuzzy matches that should pass containsValidCue but fail isExactValidCue
const fuzzyMatches = [
  "pause rn",
  "pause.",
  "hello?? bestie",
  "wait what??",
  "be fr though",
  "say less bro"
];
for (const txt of fuzzyMatches) {
  assert(`containsValidCue fuzzy accepts: "${txt}"`, containsValidCue(txt));
  assert(`isExactValidCue rejects fuzzy: "${txt}"`, !isExactValidCue(txt));
}

// Strings that should NOT match either
const nonCues = [
  "yeah that's fair",
  "i know right",
  "okay sure",
  "interesting",
  ""
];
for (const txt of nonCues) {
  assert(`containsValidCue rejects non-cue: "${txt}"`, !containsValidCue(txt));
}

// ---------------------------------------------------------------------------
// SECTION 2: scoreBrainrotScript — passing script
// ---------------------------------------------------------------------------
console.log("\n── Section 2: Passing Script ──");

const PERFECT_SCRIPT = {
  reply:  "I filed a noise complaint against your laugh in 47 states",
  msg1:   "Why does that sentence make sense to you",
  msg2:   "My lawyer says it's a gray area in 3 of them",
  msg3:   "pause",
  msg4:   "The HOA already has a restraining order on my uncle for the same laugh",
  msg5:   "Your laugh is already in our incident report from last Tuesday"
};

const perfectResult = scoreBrainrotScript(PERFECT_SCRIPT, {});
assert("perfect script passes", perfectResult.pass);
assert("perfect script score > 8", perfectResult.score > 8, `score=${perfectResult.score}`);
assert("perfect script has no failures", perfectResult.failures.length === 0,
  JSON.stringify(perfectResult.failures));
assert("recontextScore > 0", perfectResult.recontextScore > 0,
  `score=${perfectResult.recontextScore}`);

// ---------------------------------------------------------------------------
// SECTION 3: scoreBrainrotScript — individual rule violations
// ---------------------------------------------------------------------------
console.log("\n── Section 3: Hard-Fail Rules ──");

// RULE 2: round number in reply
{
  const s = { ...PERFECT_SCRIPT, reply: "I filed a noise complaint in 100 states" };
  const r = scoreBrainrotScript(s, {});
  assert("RULE_2: round number in reply fails", !r.pass);
  assert("RULE_2: failure listed", r.failures.some(f => f.startsWith("RULE_2")));
}

// RULE 3: invalid disruption cue in msg3
{
  const s = { ...PERFECT_SCRIPT, msg3: "that's interesting honestly" };
  const r = scoreBrainrotScript(s, {});
  assert("RULE_3: invalid cue fails", !r.pass);
  assert("RULE_3: failure listed", r.failures.some(f => f.startsWith("RULE_3")));
}

// RULE 4: msg4 logically follows msg3 (cue=pause, msg4 starts with "i know")
{
  const s = { ...PERFECT_SCRIPT, msg3: "pause", msg4: "i know this is crazy but she had it coming" };
  const r = scoreBrainrotScript(s, {});
  assert("RULE_4: logical follow fails", !r.pass);
  assert("RULE_4: failure listed", r.failures.some(f => f.startsWith("RULE_4")));
}

// RULE 5: msg5 too short (< 4 words)
{
  const s = { ...PERFECT_SCRIPT, msg5: "we're done" };
  const r = scoreBrainrotScript(s, {});
  assert("RULE_5: short msg5 fails", !r.pass);
  assert("RULE_5: failure listed", r.failures.some(f => f.startsWith("RULE_5")));
}

// RULE 6: self-aware phrase
{
  const s = { ...PERFECT_SCRIPT, msg1: "okay i know this sounds crazy but I have to ask" };
  const r = scoreBrainrotScript(s, {});
  assert("RULE_6: self-aware phrase fails", !r.pass);
  assert("RULE_6: failure listed", r.failures.some(f => f.startsWith("RULE_6")));
}

// RULE 11: banned phrase
{
  const s = { ...PERFECT_SCRIPT, msg2: "there's a spreadsheet for this" };
  const r = scoreBrainrotScript(s, { bannedPhrases: ["spreadsheet"] });
  assert("RULE_11: banned phrase fails", !r.pass);
  assert("RULE_11: failure listed", r.failures.some(f => f.startsWith("RULE_11")));
}

// ---------------------------------------------------------------------------
// SECTION 4: recontextualizationScore
// ---------------------------------------------------------------------------
console.log("\n── Section 4: Recontextualization Score ──");

// msg5 shares "noise" and "states" from reply — should score > 0
const reconResult = recontextualizationScore(PERFECT_SCRIPT);
assert("recontextScore > 0 for overlapping msg5", reconResult > 0, `score=${reconResult}`);

// msg5 shares nothing
const noOverlapScript = {
  ...PERFECT_SCRIPT,
  msg5: "quantum physics explains zebra migration patterns"
};
const noOverlapResult = recontextualizationScore(noOverlapScript);
// This could still score >0 if short common words slip through, but generally should be low
assert("recontextScore is a number", typeof noOverlapResult === "number");

// ---------------------------------------------------------------------------
// SECTION 5: buildRetryFeedback
// ---------------------------------------------------------------------------
console.log("\n── Section 5: Retry Feedback Generation ──");

const fakeFail = scoreBrainrotScript(
  { ...PERFECT_SCRIPT, msg3: "that's interesting honestly" },
  {}
);
const feedback = buildRetryFeedback(fakeFail.failures);
assert("feedback is non-empty string", typeof feedback === "string" && feedback.length > 0);
assert("feedback mentions msg3", feedback.toLowerCase().includes("msg3"));
assert("feedback lists valid cues", feedback.includes("be fr") || feedback.includes("hello??"));

const emptyFeedback = buildRetryFeedback([]);
assert("empty failures returns empty string", emptyFeedback === "");

// ---------------------------------------------------------------------------
// SECTION 6: selectBestCandidate
// ---------------------------------------------------------------------------
console.log("\n── Section 6: Candidate Selection ──");

const candidates = [
  { result: PERFECT_SCRIPT, scoreResult: scoreBrainrotScript(PERFECT_SCRIPT, {}) },
  { result: { ...PERFECT_SCRIPT, msg3: "that's interesting honestly" },
    scoreResult: scoreBrainrotScript({ ...PERFECT_SCRIPT, msg3: "that's interesting honestly" }, {}) }
];

const best = selectBestCandidate(candidates);
assert("selectBestCandidate returns winner", best !== null);
assert("winner is passing candidate", best.scoreResult.pass);

// When all fail, still returns best
const allFail = [
  { result: { ...PERFECT_SCRIPT, msg3: "nope" },
    scoreResult: scoreBrainrotScript({ ...PERFECT_SCRIPT, msg3: "nope" }, {}) },
  { result: { ...PERFECT_SCRIPT, msg3: "also nope", msg5: "ok" },
    scoreResult: scoreBrainrotScript({ ...PERFECT_SCRIPT, msg3: "also nope", msg5: "ok" }, {}) }
];
const bestOfBad = selectBestCandidate(allFail);
assert("selectBestCandidate returns best-of-bad", bestOfBad !== null);

// Empty array returns null
assert("selectBestCandidate handles empty array", selectBestCandidate([]) === null);

// ---------------------------------------------------------------------------
// SECTION 7: parseBrainrotScripts
// ---------------------------------------------------------------------------
console.log("\n── Section 7: Parser ──");

const SAMPLE_LLM_RESPONSE = `
reply: I filed a noise complaint against your laugh in 47 states
msg1: Why does that sentence make sense to you
msg2: My lawyer says it's a gray area in 3 of them
msg3: pause
msg4: The HOA already has a restraining order on my uncle for the same laugh
msg5: Your laugh is already in our incident report from last Tuesday

---

reply: My dentist sent a certified letter about your smile to the IRS
msg1: Why is your dentist involved in my taxes
msg2: He filed it under dental hazards affecting national revenue
msg3: what??
msg4: The FDA opened an investigation after my cousin showed them a picture
msg5: You already have a case number in the federal registry from March
`.trim();

let parsed;
try {
  parsed = parseBrainrotScripts(SAMPLE_LLM_RESPONSE);
  assert("parseBrainrotScripts returns array", Array.isArray(parsed));
  assert("parseBrainrotScripts finds 2 candidates", parsed.length === 2,
    `found ${parsed.length}`);
} catch (e) {
  console.error(`  ✗ parseBrainrotScripts threw: ${e.message}`);
  failed += 2;
  parsed = [];
}

if (parsed.length >= 1) {
  const first = parsed[0];
  assert("first candidate has reply", typeof first.reply === "string" && first.reply.length > 0,
    `reply="${first.reply}"`);
  assert("first candidate has msg1", typeof first.msg1 === "string" && first.msg1.length > 0);
  assert("first candidate has msg5", typeof first.msg5 === "string" && first.msg5.length > 0);
  assert("first candidate reply has 47", first.reply.includes("47"));
}

if (parsed.length >= 2) {
  const second = parsed[1];
  assert("second candidate has reply", typeof second.reply === "string" && second.reply.length > 0);
  assert("second candidate msg3 is 'what??'",
    (second.msg3 || "").toLowerCase().trim() === "what??",
    `msg3="${second.msg3}"`);
}

// Malformed — only one valid candidate, one is broken
const MIXED_RESPONSE = `
reply: Good opener with specific number 13
msg1: First girl line here
msg2: Boy responds with something
msg3: be fr
msg4: Drop something chaotic about a third party
msg5: She already had this planned before he started

---

reply: Missing some fields here
msg1: Only msg1
`.trim();

let parsedMixed;
try {
  parsedMixed = parseBrainrotScripts(MIXED_RESPONSE);
  assert("parser handles partial/malformed candidates gracefully", Array.isArray(parsedMixed));
  assert("parser returns at least 1 valid candidate from mixed response",
    parsedMixed.length >= 1, `found ${parsedMixed.length}`);
} catch (e) {
  console.error(`  ✗ parser threw on mixed input: ${e.message}`);
  failed += 2;
}

// Empty response — should throw (intentional: empty API response is always an error)
let emptyThrew = false;
try {
  parseBrainrotScripts("");
} catch (e) {
  emptyThrew = true;
}
assert("parser throws on empty string (expected behavior)", emptyThrew);

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n⚠️  ${failed} test(s) failed — review above`);
  process.exit(1);
} else {
  console.log(`\n✅ All tests passed`);
}
