"use strict";
/**
 * edgy-boy-harness.js
 * Phase 2: Quality harness for EdgyBoyV2 scripts.
 *
 * scoreScript(script, cfg) → { pass, reasons[], metrics{} }
 * batchSummary(scripts, cfg) → { passRate, twoBeatRate, avgBoyWords,
 *                                commentBaitRate, screenshotPunchlineRate,
 *                                pushbackSanityRate }
 *
 * OPTION B RULE:
 *   "yes??" and "yes?" are CONFUSION, NOT eager acceptance.
 *   Eager accept triggers ONLY on affirmative yes/sure/of course/etc
 *   when NOT used as a question/confusion marker.
 */

// ---------------------------------------------------------------------------
// 1. Eager-accept detection (Option B rule)
// ---------------------------------------------------------------------------

const EAGER_ACCEPT_WORDS = [
  "sure",
  "of course",
  "absolutely",
  "definitely",
  "yes please",
  "sounds good",
  "i'd love",
  "id love",
  "let's do it",
  "lets do it",
  "im in",
  "i'm in",
  "deal",
  "ok deal",
  "you got it",
  "count me in"
];

// Patterns that are CONFUSION even though they contain "yes"
const CONFUSION_PATTERNS = [
  /^yes\s*\?+\s*$/i,            // "yes?" or "yes??" alone
  /^yes\s*\?+/i,                 // starts with "yes??"
  /yes\s*\?\s*\?/i,              // any "yes??"
  /^hm+\.*$/i,                   // "hmm" / "hm."
  /^\?{1,}/,                     // just question marks
  /^(why|what|huh|wait|who)\??$/i,
  /^(wait what|what\?+|why\?+|huh\?+)$/i
];

/**
 * Returns true if the text is an eager accept (plausibility failure).
 * "yes??" and "yes?" are confusion — return false (not eager).
 */
function isEagerAccept(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.trim().toLowerCase();

  // Check confusion patterns first — these override
  for (const pattern of CONFUSION_PATTERNS) {
    if (pattern.test(t)) return false;
  }

  // Plain "yes" (no question mark, not in a longer sentence that adds confusion)
  if (/^yes\.*$/.test(t)) return true;

  // Check eager accept phrases
  for (const phrase of EAGER_ACCEPT_WORDS) {
    if (t === phrase || t.startsWith(phrase + " ") || t.startsWith(phrase + ".") || t.startsWith(phrase + ",")) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 2. Two-beat innuendo detection
// ---------------------------------------------------------------------------

const SETUP_MARKERS = [
  /\bdo you like\b/i,
  /\bcan you\b/i,
  /\bhow flexible\b/i,
  /\byour body\b/i,
  /\byour body is\b/i,             // "your body is tea"
  /\bquick question\b/i,
  /\bfavorite (color|food|song|movie)\b/i,
  /\bdo you believe\b/i,
  /\breal quick\b/i,
  /\bburger or pizza\b/i,
  /\bmatcha\b/i,
  /\bthighs\b/i,
  /\bearmuffs\b/i,
  /\bi know \d+ ways\b/i,
  /\bi already told\b/i,
  /\bi already planned\b/i,        // "I already planned our first argument"
  /\bi would never\b/i,
  /\bhide and seek\b/i,
  /\byou the first\b/i,
  /\brat(ing|e)\b/i,
  /\d+\/10\b/,                     // "10/10", "9/10" — rating openers
  /\b10\/10\b/,
  /\bbreaking necks\b/i,           // accuse_baiting: "tired of breaking necks when you post?"
  /\btired of\b/i,                 // "you ever get tired of..."
  /\bget tired\b/i,
  /\byou posted this\b/i,          // "you posted this to start problems"
  /\byou posted that\b/i,
  /\bour kids\b/i,                 // "our kids would be unreal"
  /\bgiving\b/i,                           // "giving tea energy", "giving full-course-meal energy"
  /\bis your\b/i,                          // "is your shoulder a good pillow?"
  /\bdo you know how\b/i,                  // "do you know how long a minute is?"
  /\bhow long\b/i,                         // "how long a minute is"
  /\byou ever\b/i,                         // "you ever get tired of..."
  /\bi have \d+\b/i                        // "I have 100 reasons..."
];

const PAYOFF_MARKERS = [
  /\b69\b/,
  /\b70\b/,
  /\bmy type\b/i,
  /\bwhere my face belongs\b/i,
  /\bsoaked\b/i,
  /\btake your time\b/i,
  /\bworth every sip\b/i,
  /\bruin your week\b/i,
  /\bcompatible\b/i,
  /\buniverse\b/i,
  /\bbelongs?\b/i,
  /\bsit\s+on\b/i,
  /\bprove me wrong\b/i,
  /\bthe rest\b/i,
  /\bfirst one\b/i,
  /\byou mean it\b/i,
  /\breal for real\b/i,
  /\bimpossible to hide\b/i,          // "because someone like you is impossible to hide from"
  /\bfall for\b/i,                    // "keep falling for you"
  /\btake my breath\b/i,              // "you take my breath away"
  /\bnon.negotiable\b/i,              // "non-negotiable"
  /\breply this fast\b/i,             // "bored people don't reply this fast"
  /\bsomething better to do\b/i,      // "let me give you something better to do"
  /\binterest speaks louder\b/i,      // "interest speaks louder"
  /\bshe said you\b/i,                // "she said you would say that" (presumptive callback)
  /\bsense of chaos\b/i,              // "we already have the same sense of chaos"
  /\bboth our fault\b/i,              // "they'd be chaotic and somehow both our fault"
  /\bsame sense\b/i,
  /\bkeeping you\b/i,                 // "worth every sip. keeping you."
  /\btake your time with\b/i,         // "the kind you take your time with"
  /\bdifferent section\b/i,
  /\bnever seen anything like\b/i,    // "never seen anything like you"
  /\bfor the last \d+\b/i,            // "on my mind for the last 60"
  /\bstarted with\b.*6.*9\b/i,        // "starts with a 6 and ends with a 9"
  /\bends with a 9\b/i,
  /\btwo digits\b/i,
  /\brad.*down\b/i,                   // "what made it go down" (rate_reveal callback)
  /\bnine.*ten\b/i,                   // nine out of ten
  /\b9\/10\b/,                        // "9/10" (rate_reveal drop)
  /\bgo down\b/i,                     // "what made it go down"
  /\bstill here\b/i,                  // after pushback "still here"
  /\backnowledgment.s a formality\b/i, // "acknowledgment's a formality"
  /\bfalling for\b/i                   // "i keep falling for you"
];

/**
 * Detects two-beat innuendo: setup → (girl confusion/reaction) → payoff
 * within 1–2 messages from setup.
 */
function hasTwoBeat(script) {
  const messages = getAllMessages(script);
  if (messages.length < 2) return false;

  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    if (msg.from !== "boy") continue;

    const setupText = msg.text || "";
    const isSetup = SETUP_MARKERS.some((r) => r.test(setupText));
    if (!isSetup) continue;

    // Check payoff within next 2 messages (optionally through girl's reaction)
    for (let j = i + 1; j <= Math.min(i + 3, messages.length - 1); j++) {
      if (messages[j].from === "boy") {
        const payoffText = messages[j].text || "";
        const isPayoff = PAYOFF_MARKERS.some((r) => r.test(payoffText));
        if (isPayoff) return true;
        // If no payoff found in boy's reply, stop searching from this setup
        break;
      }
    }
  }

  // Also check reply text for setup or payoff
  // When the reply IS the setup, scan ALL subsequent boy messages for the payoff
  const reply = script.reply && script.reply.text ? script.reply.text : "";
  const replyIsSetup = SETUP_MARKERS.some((r) => r.test(reply));
  if (replyIsSetup) {
    // Check all boy messages in the thread for a payoff
    const boyMessages = messages.filter((m) => m.from === "boy");
    for (const boyMsg of boyMessages) {
      const isPayoff = PAYOFF_MARKERS.some((r) => r.test(boyMsg.text || ""));
      if (isPayoff) return true;
    }
  }

  // Fallback: detect two-beat via confusion pattern regardless of setup keyword.
  // If girl's first reply is clearly a confusion marker AND a boy payoff follows,
  // count as two-beat. This catches novel phrasings not in SETUP_MARKERS.
  const GIRL_CONFUSION_RE = /^(yes\?+|why\?*|what\?+|hm+\.*|huh\?*|ok\?*|yeah why|thanks i guess|ah okay|you don.t even know|maybe i.m|you misunderstood)\b/i;
  const firstGirl = messages.find((m) => m.from === "girl");
  if (firstGirl && GIRL_CONFUSION_RE.test((firstGirl.text || "").trim())) {
    const firstBoyMsg = messages.find((m, idx) => m.from === "boy" && idx > messages.indexOf(firstGirl));
    if (firstBoyMsg) {
      const isPayoff = PAYOFF_MARKERS.some((r) => r.test(firstBoyMsg.text || ""));
      if (isPayoff) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// 3. Comment-bait trigger detection
// ---------------------------------------------------------------------------

const COMMENT_BAIT_PATTERNS = [
  /\b69\b/,                          // classic comment-bait number
  /\bwould never\b/i,                // "i would never play hide and seek with you"
  /\bmy face belongs\b/i,
  /\bwhere my face\b/i,
  /\bruin your week\b/i,
  /\bi already told my mom\b/i,
  /\bour kids\b/i,
  /\bfirst argument\b/i,
  /\b70 ways\b/i,
  /\b70%\b/,                         // "70% my type"
  /\bmy type\b/i,                    // "you're my type"
  /\bmissionary\b/i,
  /\bthighs as earmuffs\b/i,
  /\bpressing charges\b/i,
  /\bsuing you\b/i,
  /\bemotional damage\b/i,
  /\bfiling a (noise|formal)\b/i,
  /\bimpossible to hide\b/i,         // "someone like you is impossible to hide from"
  /\binterest speaks louder\b/i,     // "acknowledgment's a formality. interest speaks louder."
  /\bsomething better to do\b/i,     // "let me give you something better to do"
  /\bworth every sip\b/i,            // "hot. worth every sip."
  /\bcompatible before\b/i,          // "checking if we're compatible before i ruin your week"
  /\bsection of the universe\b/i,    // "never seen anything like you in my section"
  /\bthe rest is\b/i,                // "the rest is 69"
  /\btwo digits\b/i,                 // "starts with a 6 and ends with a 9"
  /\bends with a 9\b/i,
  /\bkeeping you\b/i,                // "worth every sip. keeping you."
  /she would say that/i,             // "she said you would say that"
  /already planned our/i,            // "I already planned our first argument"
  /\bhide and seek\b/i,              // "I would never play hide and seek with you"
  /\bbreaking necks\b/i,              // "tired of breaking necks when you post"
  /\bfalling for\b/i,                // "i keep falling for you"
  /\bfor the last \d+\b/i,           // "you've been on my mind for the last 60"
  /\btake your time with\b/i         // "the kind you take your time with"
];

function hasCommentBait(script) {
  const allText = getAllTextLower(script);
  return COMMENT_BAIT_PATTERNS.some((r) => r.test(allText));
}

// ---------------------------------------------------------------------------
// 4. Screenshot-punchline detection
// ---------------------------------------------------------------------------

const SCREENSHOT_PATTERNS = [
  /\b69\b/,
  /\bmy type\b/i,
  /\bbelongs?\b/i,                   // "that's where my face belongs"
  /\bruin your week\b/i,
  /\bcompatible\b/i,
  /\bworth every sip\b/i,
  /\bour kids would be\b/i,
  /\bi already told my mom\b/i,
  /\b70 ways\b/i,
  /\b70%\b/,                         // "you're 70% my type"
  /\bthe rest is\b/i,
  /\bthe last one\b/i,
  /\bprove me wrong\b/i,
  /\bimpossible to hide\b/i,
  /\binterest speaks louder\b/i,
  /\bsomething better to do\b/i,
  /\bkeeping you\b/i,
  /\btake my breath\b/i,
  /\bsection of the universe\b/i,
  /\bhide and seek\b/i,
  /she would say that/i,
  /\bfalling for\b/i,               // "i keep falling for you"
  /\bfor the last \d+\b/i,          // "on my mind for the last 60"
  /\btake your time with\b/i        // "the kind you take your time with"
];

/**
 * A screenshotable punchline: a short boy line (< 70 chars) matching a known pattern.
 */
function hasScreenshotPunchline(script) {
  const messages = getAllMessages(script);
  const reply = script.reply && script.reply.text ? script.reply.text : "";
  const candidates = [
    { text: reply },
    ...messages.filter((m) => m.from === "boy")
  ];
  for (const m of candidates) {
    const t = String(m.text || "").trim();
    if (t.length > 0 && t.length <= 70) {
      if (SCREENSHOT_PATTERNS.some((r) => r.test(t))) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 5. Pushback sanity: girl's first reply should NOT be eager accept
// ---------------------------------------------------------------------------

function passesPushbackSanity(script) {
  const messages = getAllMessages(script);
  const firstGirl = messages.find((m) => m.from === "girl");
  if (!firstGirl) return true; // no girl message — not a failure of this check
  return !isEagerAccept(firstGirl.text);
}

// ---------------------------------------------------------------------------
// 6. Boy word count
// Boy messages = script.reply + all messages where from == "boy"
// ---------------------------------------------------------------------------

function computeBoyAvgWords(script) {
  const boyTexts = [];
  if (script.reply && typeof script.reply.text === "string" && script.reply.text.trim()) {
    boyTexts.push(script.reply.text);
  }
  const messages = getAllMessages(script);
  for (const m of messages) {
    if (m.from === "boy" && m.text) {
      boyTexts.push(m.text);
    }
  }
  if (!boyTexts.length) return 0;
  const totalWords = boyTexts.reduce((acc, t) => acc + t.trim().split(/\s+/).filter(Boolean).length, 0);
  return totalWords / boyTexts.length;
}

// ---------------------------------------------------------------------------
// 7. Helpers
// ---------------------------------------------------------------------------

function getAllMessages(script) {
  if (!script) return [];
  const msgs = Array.isArray(script.messages) ? script.messages : [];
  return msgs.filter((m) => m && typeof m.text === "string");
}

function getAllTextLower(script) {
  const parts = [];
  if (script && script.reply && typeof script.reply.text === "string") {
    parts.push(script.reply.text);
  }
  const msgs = getAllMessages(script);
  msgs.forEach((m) => parts.push(m.text || ""));
  return parts.join(" ").toLowerCase();
}

// ---------------------------------------------------------------------------
// 8. scoreScript — main scoring function
// ---------------------------------------------------------------------------

/**
 * Score a single script against EdgyBoyV2 checks.
 *
 * @param {Object} script  - Script object (same shape as generate.js output)
 * @param {Object} cfg     - experiments.edgyBoyV2 config block
 * @returns {{ pass: boolean, reasons: string[], metrics: Object }}
 */
function scoreScript(script, cfg) {
  const config = cfg || {};
  const avgBoyWordsTarget = Number(config.avgBoyWordsTarget) || 7;

  const reasons = [];
  const metrics = {};

  // --- Check 1: Two-beat innuendo
  const twoBeat = hasTwoBeat(script);
  metrics.twoBeat = twoBeat;
  if (!twoBeat) reasons.push("no_two_beat_innuendo");

  // --- Check 2: Boy word count
  const avgBoyWords = computeBoyAvgWords(script);
  metrics.avgBoyWords = parseFloat(avgBoyWords.toFixed(2));
  if (avgBoyWords > avgBoyWordsTarget) {
    reasons.push(`avg_boy_words_exceeded: ${avgBoyWords.toFixed(1)} > ${avgBoyWordsTarget}`);
  }

  // --- Check 3: Comment-bait trigger
  const commentBait = hasCommentBait(script);
  metrics.commentBait = commentBait;
  if (!commentBait) reasons.push("no_comment_bait");

  // --- Check 4: Screenshot-punchline
  const screenshotPunchline = hasScreenshotPunchline(script);
  metrics.screenshotPunchline = screenshotPunchline;
  if (!screenshotPunchline) reasons.push("no_screenshot_punchline");

  // --- Check 5: Pushback sanity (Option B rule)
  const pushbackSanity = passesPushbackSanity(script);
  metrics.pushbackSanity = pushbackSanity;
  if (!pushbackSanity) reasons.push("girl_first_reply_is_eager_accept");

  const pass = reasons.length === 0;
  return { pass, reasons, metrics };
}

// ---------------------------------------------------------------------------
// 9. batchSummary
// ---------------------------------------------------------------------------

/**
 * Summarize a batch of scripts.
 *
 * @param {Object[]} scripts - Array of script objects
 * @param {Object}   cfg     - experiments.edgyBoyV2 config block
 * @returns {Object} batch summary with rates
 */
function batchSummary(scripts, cfg) {
  if (!Array.isArray(scripts) || scripts.length === 0) {
    return {
      total: 0,
      passRate: 0,
      twoBeatRate: 0,
      avgBoyWords: 0,
      commentBaitRate: 0,
      screenshotPunchlineRate: 0,
      pushbackSanityRate: 0,
      scores: []
    };
  }

  const scores = scripts.map((s) => scoreScript(s, cfg));
  const n = scores.length;

  const passing = scores.filter((s) => s.pass).length;
  const twoBeatCount = scores.filter((s) => s.metrics.twoBeat).length;
  const commentBaitCount = scores.filter((s) => s.metrics.commentBait).length;
  const screenshotCount = scores.filter((s) => s.metrics.screenshotPunchline).length;
  const pushbackSanityCount = scores.filter((s) => s.metrics.pushbackSanity).length;
  const totalBoyWords = scores.reduce((acc, s) => acc + (s.metrics.avgBoyWords || 0), 0);

  return {
    total: n,
    passRate: parseFloat((passing / n).toFixed(4)),
    twoBeatRate: parseFloat((twoBeatCount / n).toFixed(4)),
    avgBoyWords: parseFloat((totalBoyWords / n).toFixed(2)),
    commentBaitRate: parseFloat((commentBaitCount / n).toFixed(4)),
    screenshotPunchlineRate: parseFloat((screenshotCount / n).toFixed(4)),
    pushbackSanityRate: parseFloat((pushbackSanityCount / n).toFixed(4)),
    scores
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  scoreScript,
  batchSummary,
  isEagerAccept,
  hasTwoBeat,
  hasCommentBait,
  hasScreenshotPunchline,
  passesPushbackSanity,
  computeBoyAvgWords
};
