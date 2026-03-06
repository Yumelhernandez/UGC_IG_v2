#!/usr/bin/env node
/**
 * gen-anchor-variants.js
 *
 * One-time script: calls GPT to generate variant pools for each punchline style's
 * anchor lines, then writes anchor_variants.json.
 *
 * Usage:
 *   node -r dotenv/config tools/gen-anchor-variants.js
 *   node -r dotenv/config tools/gen-anchor-variants.js --preview   # preview picks only, no write
 *
 * After running: review anchor_variants.json and remove any flat or cringe lines.
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { callLlm } = require("./lib/llm");

const ROOT = path.join(__dirname, "..");
const OUT_PATH = path.join(ROOT, "anchor_variants.json");
const MODEL = "gpt-5.1";
const API_KEY = process.env.OPENAI_API_KEY;
const PREVIEW_ONLY = process.argv.includes("--preview");

if (!API_KEY) {
  console.error("[gen-anchor-variants] OPENAI_API_KEY not set");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Prompt definitions — one per anchor group
// ---------------------------------------------------------------------------

const PROMPTS = [
  {
    key: ["numeric_reveal", "math_punchlines"],
    type: "flat",
    count: 20,
    system: "You write viral IG DM banter lines. Short, lowercase, casual Gen Z tone.",
    user: `Generate 20 unique unhinged/brainrot variations of this viral DM math punchline mechanic:

Mechanic: boy uses a water/human-body fact → calculates % → drops a confident punchline.
Setup: boy asks "do you like water?" → girl says "yeah why" → boy drops the line.

CRITICAL: Use AT LEAST 4 DIFFERENT sentence structures. Do NOT default to "so you already like X% of me".

Required structure variety — generate ~5 per structure:

Structure A — BODY/CELLS AS AGENT (body acts without her permission):
  "your own cells are down bad and you haven't even caught up yet"
  "girl your own body clocked me before you even replied"
  "your body said yes. i'm just here for the confirmation."

Structure B — MAJORITY/DEMOCRATIC LOGIC (reframe as a vote):
  "3 out of 5 of you said yes before you even opened your mouth"
  "that's a majority. i'm taking that."
  "majority rules and majority likes me. not my fault."

Structure C — INVERTED (focus on the remaining %, not the %):
  "the other 40% just hasn't met me yet"
  "only 40% left. that's basically a formality."
  "60% locked in. the other 40% is just paperwork."

Structure D — SHORT UNHINGED CONFIDENCE (possessive, science, legal):
  "claiming 60% effective immediately."
  "this isn't flirting this is literally biology."
  "60% water. 60% mine. 0% coincidence."
  "do the math. then give me your number."

Rules:
- Lowercase, casual Gen Z tone, ≤ 65 chars
- No "bro" (boy is talking TO a girl)
- The % logic must hold (humans are ~60% water)
- Return ONLY a JSON array of strings, nothing else`,
  },
  {
    key: ["list_reveal", "list_openers"],
    type: "flat",
    count: 20,
    system: "You write viral IG DM banter lines. Short, lowercase, casual Gen Z tone.",
    user: `Generate 20 unique variations of this viral DM list opener structure:
"i got 3 things im trynna put into you — 1. [innocent], 2. [innocent], 3. ur number"

Pattern: boy presents a numbered list where items 1 and 2 are innocent/funny,
item 3 is "ur number" (or a variant like "your digits" / "ur contact").

Rules:
- Vary the list framing (not always "i got 3 things") — try: "3 requests", "real quick", "one sec", "i need 3 things", etc.
- Items 1 and 2 should be [innocent] placeholders (keep them as [innocent] in the template)
- Item 3 should vary: "ur number", "your digits", "ur contact", "ur @", etc.
- Lowercase, casual, ≤ 70 chars total
- Return ONLY a JSON array of strings, nothing else`,
  },
  {
    key: ["setup_reframe", "pairs"],
    type: "pairs",
    count: 15,
    keys: ["setup", "reframe"],
    system: "You write viral IG DM banter lines. Short, lowercase, casual Gen Z tone.",
    user: `Generate 15 setup+reframe pairs following this viral DM structure:

Boy says something alarming/weird → girl says "excuse me??" → boy reframes it as something sweet/charming.

Example pairs:
{"setup":"i want to ruin your whole week","reframe":"by being the person you cant stop thinking about"}
{"setup":"i'm filing a noise complaint on your profile","reframe":"because all i do is replay it"}

Rules:
- Setup sounds alarming or weird on first read
- Reframe must connect DIRECTLY to the setup word/concept (e.g. "ruin" → "by being...", "noise" → "all i do is replay it")
- Both lines lowercase, casual
- Setup: 4-10 words. Reframe: 4-12 words (starts with "by" or "for" or similar)
- Return ONLY a JSON array of {"setup":"...","reframe":"..."} objects, nothing else`,
  },
  {
    key: ["persistence_flip", "first_reframes"],
    type: "flat",
    count: 20,
    system: "You write viral IG DM banter lines. Short, lowercase, casual Gen Z tone.",
    user: `Generate 20 unique variations of this viral DM persistence line:
"your replies say otherwise"

Pattern: girl says she's not interested / doesn't know the boy → boy reframes her reply/action as proof of interest.

Other examples:
- "no is a great start. tell me more."
- "yet here you are still typing"
- "if you weren't curious you'd have left already"

Rules:
- Each must flip her rejection into evidence of interest
- Lowercase, confident, no apology energy
- 3-10 words
- Vary the structure (not all "your X says otherwise")
- Return ONLY a JSON array of strings, nothing else`,
  },
  {
    key: ["presumptive_close", "pairs"],
    type: "pairs",
    count: 15,
    keys: ["assumption", "followthrough"],
    system: "You write viral IG DM banter lines. Short, lowercase, casual Gen Z tone.",
    user: `Generate 15 assumption+followthrough pairs following this viral DM structure:

Boy acts like they're already in a relationship / already have plans → girl reacts confused/amused → boy doubles down with a specific follow-through detail.

Example pairs:
{"assumption":"i already told my mom about us","followthrough":"she said monday at 7 works"}
{"assumption":"already cleared my schedule for our date","followthrough":"friday night. be there."}

Rules:
- Assumption: boy acts like something is already decided (relationship, date, etc.)
- Followthrough: a specific logistical detail that makes the assumption more real/funny
- Both lowercase, casual, confident
- Assumption: 5-10 words. Followthrough: 4-8 words
- Vary the premise: mom, friends, schedule, calendar, contacts, etc.
- Return ONLY a JSON array of {"assumption":"...","followthrough":"..."} objects, nothing else`,
  },
  {
    key: ["roast_flip", "pairs"],
    type: "pairs",
    count: 15,
    keys: ["roast", "reframe"],
    system: "You write viral IG DM banter lines. Short, lowercase, casual Gen Z tone.",
    user: `Generate 15 roast+reframe pairs following this viral DM structure:

Boy "roasts" girl with a backhanded line → girl says "excuse me?? 💀" → boy reframes the key word from his roast into something charming.

Example pairs:
{"roast":"you're mid","reframe":"mid as in exactly where i want to be"}
{"roast":"you look like trouble","reframe":"trouble as in exactly my type"}
{"roast":"honestly 6.5","reframe":"6.5 on the way to a 10 with me"}

Rules:
- The reframe MUST reuse the key word or concept from the roast
- Roast sounds like a diss on first read, reframe flips it to a compliment
- Both lowercase, casual
- Roast: 3-8 words. Reframe: 5-12 words
- Return ONLY a JSON array of {"roast":"...","reframe":"..."} objects, nothing else`,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickRandom(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function validateFlat(arr, count) {
  if (!Array.isArray(arr)) throw new Error("Expected array");
  if (arr.length < count * 0.7) throw new Error(`Too few items: got ${arr.length}, want ~${count}`);
  for (const item of arr) {
    if (typeof item !== "string" || !item.trim()) throw new Error(`Invalid item: ${JSON.stringify(item)}`);
    if (item.length > 80) throw new Error(`Item too long (${item.length}): ${item}`);
  }
  return arr.map(s => s.trim());
}

function validatePairs(arr, keys, count) {
  if (!Array.isArray(arr)) throw new Error("Expected array");
  if (arr.length < count * 0.7) throw new Error(`Too few pairs: got ${arr.length}, want ~${count}`);
  for (const pair of arr) {
    for (const k of keys) {
      if (typeof pair[k] !== "string" || !pair[k].trim()) throw new Error(`Missing key "${k}" in pair`);
    }
  }
  return arr.map(p => {
    const out = {};
    for (const k of keys) out[k] = p[k].trim();
    return out;
  });
}

function parseJsonFromText(text) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON array found in response");
  return JSON.parse(match[0]);
}

async function generateGroup(prompt, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { text } = await callLlm({
        provider: "openai",
        apiKey: API_KEY,
        payload: {
          model: MODEL,
          input: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
          temperature: 1.1,
          max_output_tokens: 2000,
        },
        endpoint: "gen-anchor-variants",
      });
      const parsed = parseJsonFromText(text);
      if (prompt.type === "flat") return validateFlat(parsed, prompt.count);
      return validatePairs(parsed, prompt.keys, prompt.count);
    } catch (e) {
      if (attempt === retries) throw e;
      console.warn(`  [retry ${attempt + 1}] ${e.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("[gen-anchor-variants] Generating variant pools for 6 punchline styles...\n");

  const variants = {};

  for (const prompt of PROMPTS) {
    const [style, group] = prompt.key;
    process.stdout.write(`  ${style}.${group} (${prompt.count} ${prompt.type})... `);
    try {
      const result = await generateGroup(prompt);
      if (!variants[style]) variants[style] = {};
      variants[style][group] = result;
      console.log(`✅ ${result.length} generated`);
    } catch (e) {
      console.log(`❌ FAILED: ${e.message}`);
      process.exit(1);
    }
  }

  // Print sample picks per style (run twice to see variety)
  console.log("\n--- Sample picks (run again to see different picks) ---");
  console.log(`numeric_reveal:     ${pickRandom(variants.numeric_reveal?.math_punchlines)}`);
  console.log(`list_reveal:        ${pickRandom(variants.list_reveal?.list_openers)}`);
  const srp = pickRandom(variants.setup_reframe?.pairs);
  console.log(`setup_reframe:      "${srp?.setup}" → "${srp?.reframe}"`);
  console.log(`persistence_flip:   ${pickRandom(variants.persistence_flip?.first_reframes)}`);
  const pcp = pickRandom(variants.presumptive_close?.pairs);
  console.log(`presumptive_close:  "${pcp?.assumption}" → "${pcp?.followthrough}"`);
  const rfp = pickRandom(variants.roast_flip?.pairs);
  console.log(`roast_flip:         "${rfp?.roast}" → "${rfp?.reframe}"`);

  if (PREVIEW_ONLY) {
    console.log("\n[preview only — not writing file]");
    return;
  }

  const out = {
    meta: {
      generated_at: new Date().toISOString(),
      model: MODEL,
      note: "Review this file and remove any flat or cringe lines before use.",
    },
    variants,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\n✅ Written to ${OUT_PATH}`);
  console.log("   → Review the file, remove bad lines, then commit.");
}

main().catch(e => { console.error(e); process.exit(1); });
