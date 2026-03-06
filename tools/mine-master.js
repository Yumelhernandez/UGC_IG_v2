#!/usr/bin/env node
// One-time script: mines viral_video_breakdowns_unique_MASTER.md
// → rebuilds viral_patterns.json with clean opener/response/pair data.
// Run: node tools/mine-master.js

const fs = require("fs");
const path = require("path");

const MASTER_PATH = process.argv[2] || path.join(process.env.HOME, "Downloads/viral_video_breakdowns_unique_MASTER.md");
const OUT_PATH = path.join(__dirname, "..", "viral_patterns.json");

const raw = fs.readFileSync(MASTER_PATH, "utf8");

// ─── helpers ─────────────────────────────────────────────────────────────────

function clean(s) {
  return s
    .replace(/^["'"'`]+|["'"'`]+$/g, "")   // strip surrounding quotes
    .replace(/\s+/g, " ")
    .trim();
}

function isGarbled(s, allowShort = false) {
  if (!s || s.length < 2) return true;
  // No vowels at all (OCR noise like "mee Se" doesn't apply but "penal", "sh" do)
  if (!/[aeiou]/i.test(s)) return true;
  // All caps single word with no spaces that's not a common word
  if (/^[A-Z]{4,}$/.test(s) && !s.includes(" ")) return true;
  // Has non-ASCII garbage characters (control chars etc.)
  if (/[\x00-\x1F\x7F]/.test(s)) return true;
  // Long prose leak: contains "Resolution:" or "UNVERIFIED" or "pts_time"
  if (/resolution:|unverified|pts_time|sender identity/i.test(s)) return true;
  // Single word under 3 chars (not a common short reply)
  if (!allowShort && !s.includes(" ") && s.length < 3) return true;
  return false;
}

function normalizeOpener(s) {
  // Lowercase, trim emoji at start
  return s.replace(/^\s*[\p{Extended_Pictographic}]+\s*/u, "").trim();
}

// ─── extract per-video sections ───────────────────────────────────────────────

const videoSections = raw.split(/^## Video:/m).slice(1);

const allOpeners = [];          // boy's first outgoing bubble per video
const allResponses = [];        // girl's first incoming bubble per video
const allPairs = [];            // {hook, response} pairs
const allReveals = [];          // CTA pill button reveals (punchlines)
const allConversations = [];    // full conversation sequences for reference

for (const section of videoSections) {
  // Extract all outgoing/incoming bubble lines.
  // Only match lines that are actual bullet items (start with optional spaces + dash)
  // to avoid picking up analysis prose.
  const outgoing = [];
  const incoming = [];
  const reveals = [];

  // Format 1 (early videos): "- Outgoing bubble (right, blue): "text""
  const outgoingRx1 = /^[ \t]*-[ \t]+Outgoing bubble[^:\n]*:\s*[""\u201C]([^""\u201D\n]+)[""\u201D]/gm;
  // Format 2 (later videos): "Right-side outgoing bubble in purple gradient with white text: "text""
  const outgoingRx2 = /Right-side (?:outgoing|purple outgoing) bubble[^:\n]*:\s*[""\u201C]([^""\u201D\n]+)[""\u201D]/gm;
  // Format 3: "Large outgoing-style bubble/pill ... : "text""
  const outgoingRx3 = /Large outgoing[^:\n]*:\s*[""\u201C]([^""\u201D\n]+)[""\u201D]/gm;

  let m;
  for (const rx of [outgoingRx1, outgoingRx2, outgoingRx3]) {
    while ((m = rx.exec(section)) !== null) {
      const text = clean(m[1]);
      if (!isGarbled(text)) outgoing.push(text);
    }
  }

  // Format 1 (early videos): "- Incoming bubble (left, dark gray): "text""
  const incomingRx1 = /^[ \t]*-[ \t]+Incoming bubble[^:\n]*:\s*[""\u201C]([^""\u201D\n]+)[""\u201D]/gm;
  // Format 2 (later videos): "Left-side incoming bubble in dark gray with white text: "text""
  const incomingRx2 = /Left-side incoming bubble[^:\n]*:\s*[""\u201C]([^""\u201D\n]+)[""\u201D]/gm;

  for (const rx of [incomingRx1, incomingRx2]) {
    while ((m = rx.exec(section)) !== null) {
      const text = clean(m[1]);
      if (!isGarbled(text, true)) incoming.push(text);
    }
  }

  const ctaRx = /^[ \t]*-[ \t]+CTA pill button[^:\n]*:\s*[""\u201C]([^""\u201D\n]+)[""\u201D]/gm;
  while ((m = ctaRx.exec(section)) !== null) {
    const text = clean(m[1]);
    if (!isGarbled(text)) reveals.push(text);
  }

  if (reveals.length > 0) allReveals.push(...reveals);

  if (outgoing.length === 0) continue;

  // First outgoing = opener
  const opener = outgoing[0];
  allOpeners.push(opener);

  // First incoming = girl's first response
  if (incoming.length > 0) {
    allResponses.push(incoming[0]);
    allPairs.push({ hook: opener, response: incoming[0] });
  }

  // Build a cleaned conversation sequence (up to 8 messages)
  const conversation = [];
  // Interleave outgoing/incoming in order found in section
  // Use positions in section to order them
  const allBubbles = [];
  const convOutRxs = [
    /^[ \t]*-[ \t]+Outgoing bubble[^:\n]*:\s*[""\u201C]([^""\u201D\n]+)[""\u201D]/gm,
    /Right-side (?:outgoing|purple outgoing) bubble[^:\n]*:\s*[""\u201C]([^""\u201D\n]+)[""\u201D]/gm
  ];
  const convInRxs = [
    /^[ \t]*-[ \t]+Incoming bubble[^:\n]*:\s*[""\u201C]([^""\u201D\n]+)[""\u201D]/gm,
    /Left-side incoming bubble[^:\n]*:\s*[""\u201C]([^""\u201D\n]+)[""\u201D]/gm
  ];
  for (const rx of convOutRxs) {
    while ((m = rx.exec(section)) !== null) {
      const text = clean(m[1]);
      if (!isGarbled(text)) allBubbles.push({ pos: m.index, from: "boy", text });
    }
  }
  for (const rx of convInRxs) {
    while ((m = rx.exec(section)) !== null) {
      const text = clean(m[1]);
      if (!isGarbled(text, true)) allBubbles.push({ pos: m.index, from: "girl", text });
    }
  }
  allBubbles.sort((a, b) => a.pos - b.pos);

  // Deduplicate consecutive same-text bubbles (scroll UI repeats same bubble)
  const deduped = [];
  let lastText = null;
  for (const b of allBubbles) {
    if (b.text !== lastText) {
      deduped.push(b);
      lastText = b.text;
    }
  }
  allConversations.push({ opener, exchanges: deduped.slice(0, 10) });
}

// ─── curate the data ──────────────────────────────────────────────────────────

// Deduplicate openers (case-insensitive canonical)
function canonical(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

const seenOpeners = new Set();
const cleanOpeners = [];
for (const o of allOpeners) {
  const k = canonical(o);
  if (!seenOpeners.has(k) && !isGarbled(o)) {
    seenOpeners.add(k);
    cleanOpeners.push(o);
  }
}

const seenResponses = new Set();
const cleanResponses = [];
for (const r of allResponses) {
  const k = canonical(r);
  if (!seenResponses.has(k) && !isGarbled(r)) {
    seenResponses.add(k);
    cleanResponses.push(r);
  }
}

// Keep pairs where both hook and response are clean
const seenPairs = new Set();
const cleanPairs = [];
for (const p of allPairs) {
  const k = `${canonical(p.hook)}|||${canonical(p.response)}`;
  if (!seenPairs.has(k) && !isGarbled(p.hook) && !isGarbled(p.response)) {
    seenPairs.add(k);
    cleanPairs.push(p);
  }
}

const seenReveals = new Set();
const cleanReveals = [];
for (const r of allReveals) {
  const k = canonical(r);
  if (!seenReveals.has(k) && !isGarbled(r)) {
    seenReveals.add(k);
    cleanReveals.push(r);
  }
}

// ─── also add manually curated lines not in the MASTER (from memory of viral patterns) ──

const MANUAL_OPENERS = [
  // From videos 1-6 (confirmed in MASTER.md)
  "are u still mad?",
  "Burger or Pizza?",
  "do you like water?",
  "pasta or steak?",
  "jelly or jam?",
  "matcha n missionary?",
  "Your body is tea",
  "can I use your thighs as earmuffs??",
  "roses are red",
  "You the first 10/10 i ever seen",
  "You're mid",
  "I got 3 things I'm trynna put into you",
  "8/10 lips 💋",
  "Wanna feel young again?",
  "You just ruined the beach for everyone else",
  "You taste as good as you look?",
  "I would never play hide and seek with you 🥺",
  "Quick question why don't you have a boyfriend",
  // From videos 33-41 (different format, manually confirmed)
  "If it ain't rice then it ain't nice",
  "So is your name Gillette?",
  "which is better jelly or jam?",
];

const MANUAL_REVEALS = [
  "the rest is 69",
  "just collecting information for our first date",
  "so you already like 73% of me",
  "Prove me wrong then",
  "3. my face",
  "Can you set on it then?",
  "Can I also rate the vertical ones?",
  "that beautiful smile of yours",
  "I hope to be the man from your dreams",
  "gathering all the information for our first date",
];

const MANUAL_PAIRS = [
  // Confirmed from MASTER.md video breakdowns
  { hook: "are u still mad?", response: "yes" },
  { hook: "I know 70 ways to make you happy", response: "alright what's the first" },
  { hook: "do you like water?", response: "yeah why" },
  { hook: "do you like water?", response: "everyone likes water" },
  { hook: "Burger or Pizza?", response: "Burger??" },
  { hook: "pasta or steak?", response: "steak I guess" },
  { hook: "steak I guess", response: "why are you asking me that?" },
  { hook: "just collecting information for our first date", response: "oh 😭" },
  { hook: "You're mid", response: "excuse me??" },
  { hook: "Prove me wrong then", response: "this mid??" },
  { hook: "can I use your thighs as earmuffs??", response: "hmmm…" },
  { hook: "can I use your thighs as earmuffs??", response: "hm." },
  { hook: "Don't play... you know that's exactly where my face belongs.", response: "okay" },
  { hook: "You just ruined the beach for everyone else", response: "Huh? How? 😭" },
  { hook: "Cuz now every wave looks boring compared to you", response: "Oh goddd 😭😭" },
  { hook: "You taste as good as you look?", response: "lmao i have a bf, sorry" },
  { hook: "I got 3 things I'm trynna put into you", response: "Creep" },
  { hook: "3. my face", response: "😮😮" },
  { hook: "quick question why don't you have a boyfriend 🥺", response: "Because my parents are strict :(" },
  { hook: "You the first 10/10 i ever seen", response: "You misunderstood me" },
  { hook: "you more like 9/10", response: "So what made it go down?" },
  { hook: "where did you get that from?", response: "Get what?" },
  { hook: "that beautiful smile of yours", response: "Who are you?" },
  { hook: "I would never play hide and seek with you 🥺", response: "Why?? 😭" },
  { hook: "so you already like 73% of me", response: "LMAO NO😭" },
  // From videos 33-41
  { hook: "If it ain't rice then it ain't nice", response: "Excuse me??" },
  { hook: "You heard me", response: "What happened to a simple hello?" },
  { hook: "You're questioning my authority?", response: "No sir" },
  { hook: "So is your name Gillette?", response: "why lol" },
];

// Merge manual into clean lists
for (const o of MANUAL_OPENERS) {
  const k = canonical(o);
  if (!seenOpeners.has(k)) { seenOpeners.add(k); cleanOpeners.push(o); }
}
for (const r of MANUAL_REVEALS) {
  const k = canonical(r);
  if (!seenReveals.has(k)) { seenReveals.add(k); cleanReveals.push(r); }
}
for (const p of MANUAL_PAIRS) {
  const k = `${canonical(p.hook)}|||${canonical(p.response)}`;
  if (!seenPairs.has(k)) { seenPairs.add(k); cleanPairs.push(p); }
}

// ─── build output ─────────────────────────────────────────────────────────────

const output = {
  meta: {
    total_videos: videoSections.length,
    source_file: MASTER_PATH,
    mined_at: new Date().toISOString(),
    extraction_errors: []
  },
  hook_patterns: {
    total_unique_hooks: cleanOpeners.length,
    opening_lines_unique: cleanOpeners,
    girl_response_patterns: cleanResponses,
    hook_response_pairs: cleanPairs,
    punchline_reveals: cleanReveals,
  },
  // Keep videos array for backward compat (now populated where data exists)
  videos: allConversations.map((c, i) => ({
    video_id: `viral_${String(i + 1).padStart(3, "0")}`,
    conversation: {
      hook_line: c.opener,
      first_response: c.exchanges.find(e => e.from === "girl")?.text || "",
      messages: c.exchanges.map(e => ({ from: e.from, text: e.text })),
      message_count: c.exchanges.length
    }
  }))
};

fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");

console.log(`\n✅ viral_patterns.json rebuilt`);
console.log(`  Openers:  ${cleanOpeners.length}`);
console.log(`  Responses: ${cleanResponses.length}`);
console.log(`  Pairs:    ${cleanPairs.length}`);
console.log(`  Reveals:  ${cleanReveals.length}`);
console.log(`  Videos:   ${videoSections.length} sections processed`);
console.log(`\nOpeners sample:`);
cleanOpeners.slice(0, 10).forEach(o => console.log(`  - ${o}`));
console.log(`\nPairs sample:`);
cleanPairs.slice(0, 8).forEach(p => console.log(`  "${p.hook}" → "${p.response}"`));
console.log(`\nReveals:`);
cleanReveals.forEach(r => console.log(`  - ${r}`));
