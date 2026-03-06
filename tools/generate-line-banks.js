#!/usr/bin/env node
/**
 * generate-line-banks.js
 *
 * One-time (or periodic) script that uses the LLM to produce large pools of
 * viral-quality lines for every hardcoded fallback category in generate.js.
 *
 * Usage:
 *   node tools/generate-line-banks.js
 *   node tools/generate-line-banks.js --count 300   # lines per category
 *
 * Output: line_banks.json in the project root.
 * generate.js loads this at startup and uses these pools in place of the
 * tiny hardcoded arrays. Run again whenever you want a fresh batch.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "line_banks.json");
const CONFIG_FILE = path.join(ROOT, "config.json");
const VIRAL_FILE = path.join(ROOT, "viral_patterns.json");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
const rizzaiConfig = config.rizzai || {};
const MODEL = rizzaiConfig.model || "gpt-5.1";
const API_KEY = process.env.OPENAI_API_KEY;

const args = process.argv.slice(2);
const countArg = args.indexOf("--count");
const onlyArg = args.indexOf("--only");
const ONLY_CATEGORY = onlyArg !== -1 ? args[onlyArg + 1] : null; // e.g. "pivot"
const TARGET_PER_CATEGORY = countArg !== -1 ? Number(args[countArg + 1]) || 200 : 200;
const BATCH_SIZE = 25; // lines per API call
const TARGET_PIVOTS = 100; // pairs for boy_random_pivot
const PIVOT_BATCH_SIZE = 15; // pairs per API call

if (!API_KEY) {
  console.error("OPENAI_API_KEY not set.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load viral patterns for style examples
// ---------------------------------------------------------------------------
let viralGirlResponses = [];
let viralBoyHooks = [];
try {
  const vp = JSON.parse(fs.readFileSync(VIRAL_FILE, "utf8"));
  viralGirlResponses = (vp.hook_patterns.girl_response_patterns || [])
    .filter((l) => l && l.length > 2 && l.length < 40 && /[a-zA-Z]/.test(l))
    .slice(0, 10);
  viralBoyHooks = (vp.hook_patterns.opening_lines_unique || [])
    .filter((l) => l && l.length > 8 && l.length < 80 && /[a-zA-Z]{3}/.test(l))
    .slice(0, 8);
} catch (_) {}

// ---------------------------------------------------------------------------
// API call helper
// ---------------------------------------------------------------------------
async function callLLM(systemPrompt, userPrompt, temperature = 1.1, maxTokens = 800) {
  const payload = {
    model: MODEL,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature,
    max_output_tokens: maxTokens
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  // Extract text from response
  const output = data.output || [];
  for (const item of output) {
    const content = item.content || [];
    for (const c of content) {
      if (c.type === "output_text" || c.type === "text") return c.text || "";
    }
    if (typeof item.text === "string") return item.text;
  }
  if (typeof data.output_text === "string") return data.output_text;
  throw new Error("No text in API response");
}

// ---------------------------------------------------------------------------
// Parse raw LLM output into individual lines
// ---------------------------------------------------------------------------
function parseLines(raw) {
  return raw
    .split("\n")
    .map((l) => l.replace(/^\s*[-•*\d.]+\s*/, "").trim())
    .filter((l) => l.length >= 2 && l.length <= 80)
    .filter((l) => /[a-zA-Z]/.test(l))
    .filter((l) => !l.includes("---") && !l.startsWith("#"));
}

// ---------------------------------------------------------------------------
// Generate lines for a given category
// ---------------------------------------------------------------------------
async function generateCategory({ name, systemPrompt, userPromptFn, validate }) {
  const collected = new Set();
  const batches = Math.ceil(TARGET_PER_CATEGORY / BATCH_SIZE);
  process.stdout.write(`  Generating ${name}:`);

  for (let b = 0; b < batches; b++) {
    const needed = TARGET_PER_CATEGORY - collected.size;
    if (needed <= 0) break;
    const ask = Math.min(BATCH_SIZE, needed + 5); // ask a few extra for filtering headroom
    try {
      const raw = await callLLM(systemPrompt, userPromptFn(ask, collected), 1.15, 1200);
      const lines = parseLines(raw);
      for (const line of lines) {
        if (validate && !validate(line)) continue;
        const norm = line.toLowerCase();
        if (!collected.has(norm)) collected.add(norm);
      }
      process.stdout.write(` ${collected.size}`);
    } catch (err) {
      process.stdout.write(` [err: ${err.message.slice(0, 40)}]`);
    }
    // Brief pause between calls
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(` → ${collected.size} lines`);
  // Return in original case (first occurrence wins)
  return Array.from(collected);
}

// ---------------------------------------------------------------------------
// Category definitions
// ---------------------------------------------------------------------------

// GIRL PUSHBACK — her first 1–5 word reaction to the boy's hook
const GIRL_PUSHBACK_SYSTEM = [
  "You write girl's pushback lines for viral Instagram DM flirt videos.",
  "The girl has just received a confident/cheeky opening DM from a guy and responds with a short skeptical line.",
  "Style: short (1–5 words), dismissive, skeptical, slightly curious — NOT mean.",
  "Real examples from viral videos: 'why?', 'no, why?', 'really?', 'that's concerning', 'bold assumption', 'nice try', 'nah', 'and?', 'oh?', 'huh?', 'you can't be fr'",
  "Never use hyphens. No emojis unless extremely subtle. All lowercase.",
  "Do not write things that are full sentences or too wordy.",
  "Do not use brackets, quotes, or numbering in your output.",
  "Output only the lines, one per line."
].join("\n");

// BOY MID-CONVERSATION — his teasing follow-up lines after her pushback
const BOY_MID_SYSTEM = [
  "You write a guy's mid-conversation banter lines for viral Instagram DM flirt videos.",
  "The guy is responding to a girl's skeptical pushback. He stays confident, playful, teasing — never desperate.",
  "Style: 4–10 words. Casual American English. No cheesy pickup lines.",
  "Vibes: bold, slightly cocky, self-aware, fun. References the girl's energy without being cringey.",
  "Examples of bad style: 'you look stunning', 'i like your vibe', 'you're so beautiful'",
  "Examples of good style: 'you typed that smiling, dont lie', 'talk is cheap, test me', 'you already want to know', 'this is going exactly as planned', 'you're scared you'll like it'",
  "Never use hyphens. All lowercase. No emojis.",
  "Output only the lines, one per line."
].join("\n");

// GIRL MID-CONVERSATION — her mid-conversation dismissive/playful replies
const GIRL_MID_SYSTEM = [
  "You write a girl's mid-conversation lines for viral Instagram DM flirt videos.",
  "She's playing hard to get — skeptical but engaged. Short, witty, keeps him working for it.",
  "Style: 1–6 words. Dismissive but not mean. Slightly playful.",
  "Real examples: 'prove it', 'pass', 'and?', '??', 'ok and', 'sure jan', 'try harder', 'still not impressed', 'keep going', 'talk is cheap', 'bold'",
  "Never use hyphens. All lowercase. Light emojis OK (max 1).",
  "Output only the lines, one per line."
].join("\n");

// CLOSE LINES — girl's final line (after giving the number / agreeing to hang)
const GIRL_CLOSE_SYSTEM = [
  "You write a girl's final line in a viral Instagram DM flirt video.",
  "She has just given her number or agreed to meet up. She says something that ends on a confident/playful note.",
  "Style: 4–10 words. Teasing, confident, slightly demanding. Like she's setting terms.",
  "Real examples: 'this better be worth it', 'im expecting elite banter', 'you're lucky you're cute', 'don't make this weird', 'you owe me a good time', 'clock's ticking', 'don't waste it'",
  "Never use hyphens. All lowercase. No emojis unless subtle.",
  "Output only the lines, one per line."
].join("\n");

// BOY FALLBACK — generic confident/teasing boy lines when LLM banter fails validation
const BOY_FALLBACK_SYSTEM = [
  "You write confident short replies a guy sends mid-conversation in an IG DM flirt exchange.",
  "She just challenged him or stayed skeptical. He responds briefly and confidently.",
  "Style: 3–8 words. Not desperate. Not generic pickup lines. Casual American English.",
  "Good examples: 'im not just talking', 'bet, let me prove it', 'you want proof say less', 'cool test me in person', 'talk is cheap watch me', 'keep that energy for me', 'youre trouble and i like it'",
  "Never use hyphens. All lowercase.",
  "Output only the lines, one per line."
].join("\n");

// BOY RANDOM PIVOT — unexpected non-sequitur that forces a 'wait what' reaction
// Format: setup line (boy) → punchline (boy, after her confused reply)
const BOY_PIVOT_SYSTEM = [
  "You write 'random pivot' setups and punchlines for viral Instagram DM flirt videos.",
  "The pattern: boy drops a totally random, unrelated question mid-thread (the 'setup').",
  "The girl responds confused (handled separately). Then the boy drops a clever punchline that ties it back to flirting.",
  "The setup should feel like a non-sequitur — unexpected, makes her stop and go 'wait what'.",
  "The punchline should land as a smooth, funny, slightly cocky flirt callback.",
  "Real example: setup='do you like water?' punchline='because you're like 70% my type'",
  "Other examples:",
  "  setup='quick question. favorite color?' punchline='just checking if we're compatible before i ruin your week'",
  "  setup='do you know how long a minute is?' punchline='because you've been on my mind for the last 60'",
  "  setup='random but do you believe in aliens?' punchline='asking for myself since i think i found one'",
  "  setup='do you prefer coffee or tea?' punchline='just seeing if you're the type to stay up late with me'",
  "  setup='serious question. do you cook?' punchline='need to know if i should bring the snacks or you will'",
  "  setup='be honest. do you snore?' punchline='asking because im already planning the first sleepover'",
  "Style: casual lowercase, no hyphens, under 12 words per line each.",
  "Output format: one pair per line in this exact format: setup|||punchline",
  "Do NOT include labels, numbers, or any other text. Just setup|||punchline pairs."
].join("\n");

// ---------------------------------------------------------------------------
// Pivot pair generator (different from generateCategory — handles paired format)
// ---------------------------------------------------------------------------
async function generatePivotCategory() {
  const collected = []; // array of {setup, punchline}
  const seenSetups = new Set();
  const batches = Math.ceil(TARGET_PIVOTS / PIVOT_BATCH_SIZE);
  process.stdout.write(`  Generating boy_random_pivot:`);

  for (let b = 0; b < batches; b++) {
    const needed = TARGET_PIVOTS - collected.length;
    if (needed <= 0) break;
    const ask = Math.min(PIVOT_BATCH_SIZE, needed + 3);
    const avoidRecent = collected.slice(-10).map((p) => p.setup).join(", ");
    const userPrompt = [
      `Write ${ask} different random pivot setup+punchline pairs for flirty DM exchanges.`,
      "Each pair must follow the format: setup|||punchline",
      "The setup is a random unexpected question the boy sends mid-thread.",
      "The punchline is his clever flirt callback (sent after her confused reply).",
      "Make them varied — different topics (food, time, nature, random facts, etc).",
      collected.length > 0 ? `Avoid setups similar to these already used: ${avoidRecent}` : "",
      `Output exactly ${ask} lines in setup|||punchline format. No other text.`
    ].filter(Boolean).join("\n");

    try {
      const raw = await callLLM(BOY_PIVOT_SYSTEM, userPrompt, 1.15, 1000);
      const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.includes("|||")) continue;
        const sepIdx = line.indexOf("|||");
        const setup = line.slice(0, sepIdx).trim().replace(/^[-*\d.]+\s*/, "");
        const punchline = line.slice(sepIdx + 3).trim();
        if (!setup || !punchline) continue;
        if (setup.length > 100 || punchline.length > 100) continue;
        if (!/[a-zA-Z]/.test(setup) || !/[a-zA-Z]/.test(punchline)) continue;
        const normSetup = setup.toLowerCase();
        if (seenSetups.has(normSetup)) continue;
        seenSetups.add(normSetup);
        collected.push({ setup: setup.toLowerCase(), punchline: punchline.toLowerCase() });
      }
      process.stdout.write(` ${collected.length}`);
    } catch (err) {
      process.stdout.write(` [err: ${err.message.slice(0, 40)}]`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(` → ${collected.length} pairs`);
  return collected;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------
const isShort = (max) => (l) => l.split(/\s+/).length <= max;
const notEmpty = (l) => l.trim().length > 1;
const noHyphen = (l) => !l.includes("-");
const maxLen = (n) => (l) => l.length <= n;

function combineValidators(...fns) {
  return (l) => fns.every((fn) => fn(l));
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------
function girlPushbackPrompt(count, existing) {
  const avoid = Array.from(existing).slice(-20).join("\n");
  return [
    `Write ${count} different girl pushback lines.`,
    viralGirlResponses.length
      ? `Inspired by these real viral examples (do not copy exactly):\n${viralGirlResponses.map((l) => `- ${l}`).join("\n")}`
      : "",
    existing.size > 0
      ? `Do NOT repeat or paraphrase these already-generated lines:\n${avoid}`
      : "",
    `Output ${count} lines, one per line.`
  ]
    .filter(Boolean)
    .join("\n\n");
}

function boyMidPrompt(count, existing) {
  const avoid = Array.from(existing).slice(-20).join("\n");
  return [
    `Write ${count} different mid-conversation teasing lines the guy sends after her pushback.`,
    `Avoid referencing specific story details (captions, locations). Keep them universally applicable.`,
    existing.size > 0 ? `Do NOT repeat: \n${avoid}` : "",
    `Output ${count} lines, one per line.`
  ]
    .filter(Boolean)
    .join("\n\n");
}

function girlMidPrompt(count, existing) {
  const avoid = Array.from(existing).slice(-20).join("\n");
  return [
    `Write ${count} different girl mid-conversation dismissive/skeptical lines.`,
    existing.size > 0 ? `Do NOT repeat: \n${avoid}` : "",
    `Output ${count} lines, one per line.`
  ]
    .filter(Boolean)
    .join("\n\n");
}

function girlClosePrompt(count, existing) {
  const avoid = Array.from(existing).slice(-20).join("\n");
  return [
    `Write ${count} different girl closing lines (said after she gives her number or agrees to hang).`,
    existing.size > 0 ? `Do NOT repeat: \n${avoid}` : "",
    `Output ${count} lines, one per line.`
  ]
    .filter(Boolean)
    .join("\n\n");
}

function boyFallbackPrompt(count, existing) {
  const avoid = Array.from(existing).slice(-20).join("\n");
  return [
    `Write ${count} different short confident guy lines for a mid-DM flirt exchange.`,
    existing.size > 0 ? `Do NOT repeat: \n${avoid}` : "",
    `Output ${count} lines, one per line.`
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  // --only pivot: patch just the pivot bank into an existing line_banks.json
  if (ONLY_CATEGORY === "pivot") {
    console.log(`Generating boy_random_pivot only (${TARGET_PIVOTS} pairs) using ${MODEL}…`);
    console.log();
    const existingBanks = fs.existsSync(OUT_FILE)
      ? JSON.parse(fs.readFileSync(OUT_FILE, "utf8"))
      : {};
    existingBanks.boy_random_pivot = await generatePivotCategory();
    if (!existingBanks._meta) existingBanks._meta = {};
    existingBanks._meta.pivot_generated_at = new Date().toISOString();
    existingBanks._meta.pivot_count = existingBanks.boy_random_pivot.length;
    fs.writeFileSync(OUT_FILE, JSON.stringify(existingBanks, null, 2) + "\n", "utf8");
    console.log();
    console.log(`✓ Patched boy_random_pivot → ${OUT_FILE}`);
    console.log(`  ${existingBanks.boy_random_pivot.length} pairs written`);
    return;
  }

  console.log(`Generating line banks (${TARGET_PER_CATEGORY} per category) using ${MODEL}…`);
  console.log();

  const banks = {};

  banks.girl_pushback = await generateCategory({
    name: "girl_pushback",
    systemPrompt: GIRL_PUSHBACK_SYSTEM,
    userPromptFn: girlPushbackPrompt,
    validate: combineValidators(notEmpty, noHyphen, isShort(8), maxLen(50))
  });

  banks.girl_mid = await generateCategory({
    name: "girl_mid",
    systemPrompt: GIRL_MID_SYSTEM,
    userPromptFn: girlMidPrompt,
    validate: combineValidators(notEmpty, noHyphen, isShort(10), maxLen(60))
  });

  banks.boy_mid = await generateCategory({
    name: "boy_mid",
    systemPrompt: BOY_MID_SYSTEM,
    userPromptFn: boyMidPrompt,
    validate: combineValidators(notEmpty, noHyphen, isShort(12), maxLen(70))
  });

  banks.girl_close = await generateCategory({
    name: "girl_close",
    systemPrompt: GIRL_CLOSE_SYSTEM,
    userPromptFn: girlClosePrompt,
    validate: combineValidators(notEmpty, noHyphen, isShort(12), maxLen(70))
  });

  banks.boy_fallback = await generateCategory({
    name: "boy_fallback",
    systemPrompt: BOY_FALLBACK_SYSTEM,
    userPromptFn: boyFallbackPrompt,
    validate: combineValidators(notEmpty, noHyphen, isShort(12), maxLen(70))
  });

  banks.boy_random_pivot = await generatePivotCategory();

  banks._meta = {
    generated_at: new Date().toISOString(),
    model: MODEL,
    target_per_category: TARGET_PER_CATEGORY,
    target_pivots: TARGET_PIVOTS,
    counts: Object.fromEntries(
      Object.entries(banks)
        .filter(([k]) => !k.startsWith("_"))
        .map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
    )
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(banks, null, 2) + "\n", "utf8");
  console.log();
  console.log(`✓ Written to ${OUT_FILE}`);
  console.log("Category counts:", banks._meta.counts);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
