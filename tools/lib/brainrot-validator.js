"use strict";

// ---------------------------------------------------------------------------
// brainrot-validator.js
// Shared validation logic for the "brainrot" arc type.
// Called from two places:
//   1. generateBrainrotScript() in llm.js — to score candidates and gate retries
//   2. qa.js — to emit QA signals on final scripts
//
// DO NOT import from generate.js, batch.js, or qa.js here.
// Zero circular-dependency risk by keeping this module leaf-level.
// ---------------------------------------------------------------------------

const VALID_DISRUPTION_CUES = [
  "be fr",
  "hello??",
  "pause",
  "under oath?",
  "what??",
  "cap",
  "say less"
];

const ROUND_NUMBER_PATTERN = /\b(10|20|30|40|50|60|70|80|90|100|200|500|1000)\b/;

const SELF_AWARE_PHRASES = [
  "okay i know this sounds",
  "i know this is weird",
  "i realize this",
  "sounds crazy but",
  "i know how this looks",
  "before you say anything",
  "i know how that sounds",
  "this might sound crazy",
  "bear with me"
];

const VAGUE_LOCATION_WORDS = [
  "apartment",
  " office",   // leading space avoids false match on "officer"
  "outside",
  "somewhere",
  "nearby",
  "the place",
  "some place"
];

// Default banned phrases — extended by config.brainrot_banned_phrases at call time
const DEFAULT_BANNED = ["spreadsheet", "excuse me"];

// Per-cue logical-follow patterns: if msg3 is this cue and msg4 starts with
// one of these starters, msg4 is probably logically responding instead of
// dropping new chaos.
const LOGICAL_FOLLOW_PATTERNS = [
  { cue: "under oath?",  starters: ["yes", "no", "i swear", "absolutely", "i do"] },
  { cue: "be fr",        starters: ["i am", "im serious", "dead serious", "i swear", "for real"] },
  { cue: "pause",        starters: ["i know", "yeah", "okay", "so ", "look"] },
  { cue: "hello??",      starters: ["i know", "right", "exactly", "i said", "hello"] },
  { cue: "what??",       starters: ["i said", "you heard", "exactly", "yeah", "what i said"] },
  { cue: "cap",          starters: ["no cap", "i swear", "its real", "true", "not cap"] },
  { cue: "say less",     starters: ["exactly", "i know", "right", "so ", "yeah"] }
];

const STOP_WORDS = new Set([
  "i", "the", "a", "an", "and", "to", "of", "in", "is", "it",
  "you", "my", "we", "me", "your", "our", "at", "on", "for",
  "that", "this", "its", "s", "re", "ve", "ll", "m", "t",
  "be", "was", "are", "do", "did", "has", "have", "but", "or",
  "so", "if", "as", "up", "he", "she", "they", "her", "him",
  "not", "no", "by", "from", "with", "just", "already", "now"
]);

// ---------------------------------------------------------------------------
// containsValidCue(text) — FUZZY match, used for retry gating
// Accepts: "pause rn", "pause.", "wait pause", "like hello??"
// Rejects: "yeah that's fair", "i know right"
// ---------------------------------------------------------------------------
function containsValidCue(text) {
  const lower = (text || "").toLowerCase().trim();
  const normalized = lower.replace(/[.!,]+$/, "").trim();
  return VALID_DISRUPTION_CUES.some(
    (cue) =>
      normalized === cue ||
      normalized.startsWith(cue) ||
      normalized.endsWith(cue) ||
      normalized.includes(cue)
  );
}

// ---------------------------------------------------------------------------
// isExactValidCue(text) — EXACT match, used for QA soft-warn logging only
// ---------------------------------------------------------------------------
function isExactValidCue(text) {
  return VALID_DISRUPTION_CUES.includes((text || "").toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// recontextualizationScore(result)
// Higher = msg5 references more content from earlier in the conversation.
// Window = ALL prior lines (reply, msg1, msg2, msg3, msg4).
// Bonus weight for msg5 sharing named-party words introduced in msg4.
// ---------------------------------------------------------------------------
function recontextualizationScore(result) {
  const msg5Words = new Set(
    (result.msg5 || "")
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z]/g, ""))
      .filter((w) => w.length > 2)
  );

  const allPriorWords = new Set(
    [result.reply, result.msg1, result.msg2, result.msg3, result.msg4]
      .flatMap((line) =>
        (line || "")
          .toLowerCase()
          .split(/\s+/)
          .map((w) => w.replace(/[^a-z]/g, ""))
      )
      .filter((w) => w.length > 2)
  );

  const msg4Words = new Set(
    (result.msg4 || "")
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z]/g, ""))
      .filter((w) => w.length > 3)
  );

  let score = 0;
  for (const w of msg5Words) {
    if (STOP_WORDS.has(w)) continue;
    if (allPriorWords.has(w)) {
      score += 1;
      // Bonus: if this word also appeared specifically in msg4 (named third party pattern)
      if (msg4Words.has(w)) score += 0.5;
    }
  }
  return score;
}

// ---------------------------------------------------------------------------
// buildRetryFeedback(failures)
// Converts hard-fail reasons into a human-readable block to inject into
// the next LLM prompt so it knows exactly what to fix.
// ---------------------------------------------------------------------------
function buildRetryFeedback(failures) {
  if (!failures || failures.length === 0) return "";

  const lines = [
    "Your previous attempt failed these checks. Fix ONLY the flagged issues in your next output.",
    "Do not change any line that was not flagged.",
    ""
  ];

  for (const f of failures) {
    if (f.startsWith("RULE_3")) {
      lines.push(
        `- [msg3 WRONG]: "${f.split('"')[1]}" is not a valid disruption cue.`,
        `  msg3 must be EXACTLY one of: "be fr" / "hello??" / "pause" / "under oath?" / "what??" / "cap" / "say less"`,
        `  Pick the one that matches the involuntary emotional reaction to msg2.`
      );
    } else if (f.startsWith("RULE_4")) {
      lines.push(
        `- [msg4 WRONG]: msg4 logically follows msg3. msg4 must introduce a BRAND NEW chaos element`,
        `  unrelated to the disruption cue. Drop a new name, institution, location, or third party`,
        `  with zero setup — stated as if it's already obvious context.`
      );
    } else if (f.startsWith("RULE_2")) {
      lines.push(
        `- [reply WRONG]: reply contains a round number. Replace it with a weird specific number`,
        `  (e.g. 47, 4.7, 11, 23, 9). The number IS the joke — round numbers kill it.`
      );
    } else if (f.startsWith("RULE_5")) {
      lines.push(
        `- [msg5 WRONG]: msg5 is too short. msg5 must be a quiet revelation that reframes the`,
        `  entire conversation — not a punchline. She reveals she was already inside his system`,
        `  before he started it. At least 4-8 words, stated matter-of-fact.`
      );
    } else if (f.startsWith("RULE_6")) {
      lines.push(
        `- [SELF-AWARE]: A character acknowledged how unhinged the situation is. Remove it.`,
        `  Every line must sound like the character has NO IDEA how insane they sound.`,
        `  Calm. Proud. Matter-of-fact. Zero self-awareness.`
      );
    } else if (f.startsWith("RULE_11")) {
      const phrase = f.match(/"([^"]+)"/)?.[1] || "";
      lines.push(
        `- [BANNED]: Remove the phrase "${phrase}" — it is not allowed in brainrot scripts.`
      );
    } else {
      lines.push(`- ${f}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// scoreBrainrotScript(result, opts)
// result = { reply, msg1, msg2, msg3, msg4, msg5 }
// opts.bannedPhrases = string[] (from config.brainrot_banned_phrases)
//
// Returns: { pass, score, failures, warnings }
//   pass    — true if zero hard failures (safe to use this candidate)
//   score   — 0–10 (10 = perfect, used to rank passing candidates)
//   failures — hard-fail reasons (each starts with RULE_N or SPEAKER)
//   warnings — soft-fail reasons (logged but don't block)
// ---------------------------------------------------------------------------
function scoreBrainrotScript(result, opts) {
  const bannedPhrases = (opts && opts.bannedPhrases) || DEFAULT_BANNED;
  const failures = [];
  const warnings = [];

  const allTexts = [
    result.reply,
    result.msg1,
    result.msg2,
    result.msg3,
    result.msg4,
    result.msg5
  ];

  // --- HARD CHECKS (failures block the candidate / trigger retry) ---

  // RULE 2: no round numbers in reply
  if (ROUND_NUMBER_PATTERN.test(result.reply || "")) {
    failures.push(`RULE_2: reply contains a round number — "${result.reply}"`);
  }

  // RULE 3: msg3 must contain a valid disruption cue (fuzzy for retry gating)
  const msg3Clean = (result.msg3 || "").toLowerCase().trim();
  if (!containsValidCue(msg3Clean)) {
    failures.push(`RULE_3: msg3 "${result.msg3}" is not a valid disruption cue`);
  }

  // RULE 4: msg4 must not logically follow msg3
  const msg4Lower = (result.msg4 || "").toLowerCase();
  const followPattern = LOGICAL_FOLLOW_PATTERNS.find((p) => {
    const cueNorm = (result.msg3 || "").toLowerCase().trim().replace(/[.!,]+$/, "").trim();
    return cueNorm === p.cue || cueNorm.startsWith(p.cue) || cueNorm.endsWith(p.cue);
  });
  if (followPattern) {
    const badStarter = followPattern.starters.find((s) => msg4Lower.startsWith(s));
    if (badStarter) {
      failures.push(
        `RULE_4: msg4 logically follows msg3 (starts with "${badStarter}") — must drop new chaos`
      );
    }
  }

  // RULE 5: msg5 must be long enough to be a revelation (not a punchline)
  const msg5Words = (result.msg5 || "").trim().split(/\s+/);
  if (msg5Words.length < 4) {
    failures.push(`RULE_5: msg5 "${result.msg5}" too short for recontextualization (< 4 words)`);
  }

  // RULE 6: no character may seem self-aware
  for (const txt of allTexts) {
    const lower = (txt || "").toLowerCase();
    const selfAware = SELF_AWARE_PHRASES.find((p) => lower.includes(p));
    if (selfAware) {
      failures.push(`RULE_6: self-aware phrase "${selfAware}" detected in "${txt}"`);
      break;
    }
  }

  // RULE 11: banned phrases
  for (const txt of allTexts) {
    const lower = (txt || "").toLowerCase();
    for (const phrase of bannedPhrases) {
      if (lower.includes(phrase.toLowerCase())) {
        failures.push(`RULE_11: banned phrase "${phrase}" detected in "${txt}"`);
      }
    }
  }

  // --- SOFT CHECKS (warnings — logged, don't block) ---

  // RULE 2: round numbers anywhere (not just reply)
  for (const txt of [result.msg1, result.msg2, result.msg4, result.msg5]) {
    if (ROUND_NUMBER_PATTERN.test(txt || "")) {
      warnings.push(`RULE_2_SOFT: round number in non-reply line — "${txt}"`);
    }
  }

  // RULE 7: vague location words
  for (const txt of allTexts) {
    const lower = (txt || "").toLowerCase();
    const vagueMatch = VAGUE_LOCATION_WORDS.find((v) => lower.includes(v));
    if (vagueMatch) {
      warnings.push(`RULE_7: vague location word "${vagueMatch.trim()}" in "${txt}"`);
    }
  }

  // RULE 16: typo presence + placement checks
  // HARD FAIL: at least one of msg2/msg4 must contain a detectable typo
  if (!hasRequiredTypo(result.msg2, result.msg4)) {
    failures.push(
      `RULE_16: no intentional typo found in msg2 or msg4. ` +
      `Add one transposed/dropped-letter typo to msg2 (e.g. 'shoud' for 'should', 'protocls' for 'protocols').`
    );
  }
  // SOFT WARN: typo on protected lines (reply/msg3/msg5) is not allowed
  const typoRiskLines = [result.reply, result.msg3, result.msg5];
  for (const txt of typoRiskLines) {
    if (looksLikeTypo(txt)) {
      warnings.push(`RULE_16: possible typo on protected line (reply/msg3/msg5) — "${txt}"`);
    }
  }

  // msg3 exact-cue check (soft — exact match preferred for clean QA logs)
  if (!isExactValidCue(msg3Clean) && containsValidCue(msg3Clean)) {
    warnings.push(`RULE_3_SOFT: msg3 "${result.msg3}" is fuzzy-valid but not exact — acceptable`);
  }

  // Recontextualization score (informational)
  const recontextScore = recontextualizationScore(result);
  if (recontextScore === 0) {
    warnings.push(`RULE_5_SOFT: msg5 shares no meaningful words with prior lines — may be weak reveal`);
  }

  const hardCount = failures.length;
  return {
    pass: hardCount === 0,
    score: Math.max(0, 10 - hardCount * 2 - warnings.length * 0.25),
    recontextScore,
    failures,
    warnings
  };
}

// ---------------------------------------------------------------------------
// looksLikeTypo(text) — heuristic for typo detection on a line of text.
// Used in two contexts:
//   1. Protected-line check (reply/msg3/msg5) — soft warn if typo found here
//   2. Required-line check (msg2/msg4) — hard-fail if NO typo found on both
//
// Detects:
//   - Known RULE 16 typo patterns ('watdh', 'protocls', 'clearnece', etc.)
//   - Unusual consonant clusters (3+ consonants not normal in English)
//   - Missing-vowel patterns in longer words
// ---------------------------------------------------------------------------
const KNOWN_TYPO_SIGNALS = [
  /watdh/,           // watch
  /shoud/,           // should
  /protocls/,        // protocols
  /clearnec/,        // clearance
  /emegenc/,         // emergency
  /srpeads/,         // spreads
  /beleiv/,          // believe
  /enerolem/,        // enrollment (too garbled but detect it anyway)
  /\bpgo\b/,         // pgo (bad typo)
  /handl[^ei]/,      // handing/handling swap
  /\w{4,}[bcdfghjklmnpqrstvwxyz]{3}\w/  // 3+ consonants mid-word (unusual in English)
];

function looksLikeTypo(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return KNOWN_TYPO_SIGNALS.some((re) => re.test(lower));
}

// ---------------------------------------------------------------------------
// hasRequiredTypo(msg2, msg4) — checks whether at least one of the two
// "allowed typo" lines contains a detectable typo.
// Returns true if a typo is found, false if neither line has one.
// ---------------------------------------------------------------------------
function hasRequiredTypo(msg2, msg4) {
  return looksLikeTypo(msg2) || looksLikeTypo(msg4);
}

// ---------------------------------------------------------------------------
// selectBestCandidate(candidates, opts)
// candidates = array of { result, scoreResult } objects
// Returns the best passing candidate, or best overall if none pass.
// ---------------------------------------------------------------------------
function selectBestCandidate(candidates) {
  if (!candidates || candidates.length === 0) return null;

  const passing = candidates.filter((c) => c.scoreResult.pass);
  const pool = passing.length > 0 ? passing : candidates;

  // Sort by: recontextScore desc, then score desc, then msg5 length desc
  pool.sort((a, b) => {
    const rDiff = b.scoreResult.recontextScore - a.scoreResult.recontextScore;
    if (Math.abs(rDiff) > 0.4) return rDiff;
    const sDiff = b.scoreResult.score - a.scoreResult.score;
    if (Math.abs(sDiff) > 0.1) return sDiff;
    return (b.result.msg5 || "").split(/\s+/).length - (a.result.msg5 || "").split(/\s+/).length;
  });

  return pool[0];
}

module.exports = {
  scoreBrainrotScript,
  recontextualizationScore,
  containsValidCue,
  isExactValidCue,
  buildRetryFeedback,
  selectBestCandidate,
  looksLikeTypo,
  hasRequiredTypo,
  VALID_DISRUPTION_CUES
};
