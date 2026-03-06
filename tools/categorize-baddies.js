#!/usr/bin/env node
/**
 * categorize-baddies.js
 *
 * Uses GPT-4o-mini vision to categorize every image in the baddies/ folder
 * and extract brief visual details for joke-writing.
 *
 * Output: baddies/manifest.json — each entry has:
 *   filename  – image filename
 *   category  – one of: selfie, mirror, travel, nightlife, food, fitness, beach, casual
 *   details   – 1-sentence visual description for the LLM to reference when writing openers
 *               e.g. "in a hammock at a tropical villa with glass doors behind her"
 *                    "gym mirror selfie in a sports bra, trees visible outside"
 *
 * Usage:
 *   node tools/categorize-baddies.js
 *   node tools/categorize-baddies.js --force   # re-categorize already-done images
 */

"use strict";

const fs   = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const ROOT        = path.resolve(__dirname, "..");
const BADDIES_DIR = path.join(ROOT, "baddies");
const OUT_FILE    = path.join(BADDIES_DIR, "manifest.json");
const API_KEY     = process.env.OPENAI_API_KEY;
const MODEL       = "gpt-4o-mini";
const BATCH_SIZE  = 5; // images per API call
const DELAY_MS    = 400;

const VALID_CATEGORIES = ["selfie", "mirror", "travel", "nightlife", "food", "fitness", "beach", "casual"];

// Full caption pool from content.js — included here so the vision model can pick the best fit per image
const ALL_CAPTIONS_BY_CATEGORY = {
  selfie:    ["no filter", "soft light", "quick selfie", "just me", "low key", "late scroll", "mirror light", "after hours", "quiet flex", "close up"],
  mirror:    ["mirror check", "fit check", "after hours mirror", "late mirror", "hallway mirror", "elevator mirror", "clean fit", "all black", "casual fit", "quick fit"],
  travel:    ["weekend escape", "sunset skyline", "airport view", "late night drive", "rooftop lights", "new city", "small getaway", "open road", "postcard view", "golden hour"],
  nightlife: ["night out", "after hours", "city glow", "rooftop lights", "late plans", "no sleep", "dance floor", "neon lights", "midnight mood", "club night"],
  food:      ["coffee run", "midnight snack", "late brunch", "sweet tooth", "street bite", "late plate", "breakfast mode", "dessert run", "quick bite", "food mood"],
  fitness:   ["gym mirror", "studio warmup", "leg day", "post workout", "early lift", "sweat check", "strong day", "training mode", "weight room", "gym flow"],
  beach:     ["beach day", "salt air", "ocean mood", "sunset swim", "coast time", "shoreline", "waves today", "sun glow", "sand day", "sea breeze"],
  casual:    ["rainy walk", "slow morning", "lazy sunday", "coffee run", "soft day", "quiet day", "casual day", "home mood", "day off", "low key"]
};
const ALL_CAPTIONS_FLAT = Object.values(ALL_CAPTIONS_BY_CATEGORY).flat();

const forceFlag = process.argv.includes("--force");
// --upgrade: re-process only images already in the manifest but missing hook/captions
const upgradeFlag = process.argv.includes("--upgrade");

if (!API_KEY) {
  console.error("OPENAI_API_KEY not set.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load existing manifest — supports incremental runs and preserves details
// ---------------------------------------------------------------------------
// results shape: { [filename]: { category, details, hook, captions } }
let existing = {};
if (fs.existsSync(OUT_FILE) && !forceFlag) {
  try {
    const raw = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
    if (Array.isArray(raw)) {
      raw.forEach((e) => {
        if (e && e.filename) {
          existing[e.filename] = {
            category: e.category || "selfie",
            details: e.details || "",
            hook: e.hook || "",
            captions: Array.isArray(e.captions) ? e.captions : []
          };
        }
      });
    }
    console.log(`[categorize] Loaded ${Object.keys(existing).length} existing entries.`);
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Collect images to categorize
// ---------------------------------------------------------------------------
const allFiles = fs.readdirSync(BADDIES_DIR)
  .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
  .sort();

const needsUpgrade = (f) => {
  const e = existing[f];
  return e && (!e.hook || !Array.isArray(e.captions) || e.captions.length === 0);
};
const todo = upgradeFlag
  ? allFiles.filter((f) => !existing[f] || needsUpgrade(f))
  : allFiles.filter((f) => !existing[f]);
console.log(`[categorize] ${allFiles.length} total images, ${todo.length} need categorization.`);

if (todo.length === 0) {
  console.log("[categorize] All images already categorized. Use --force to redo.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// API call helper — returns { filename, category, details } for each image
// ---------------------------------------------------------------------------
async function callVision(batch) {
  const imageContent = batch.map((filename, idx) => {
    const imgPath = path.join(BADDIES_DIR, filename);
    const ext = path.extname(filename).replace(".", "").toLowerCase();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
    const b64 = fs.readFileSync(imgPath).toString("base64");
    return [
      { type: "text", text: `Image ${idx + 1} (${filename}):` },
      { type: "image_url", image_url: { url: `data:${mime};base64,${b64}`, detail: "low" } }
    ];
  }).flat();

  const captionListStr = ALL_CAPTIONS_FLAT.join(", ");
  const prompt = [
    "You are analyzing Instagram-style story images for a flirty DM content pipeline.",
    `For each of the ${batch.length} images, return FOUR things:`,
    "",
    "1. CATEGORY — pick ONE from:",
    "   selfie   – face/portrait close-up, any background",
    "   mirror   – mirror selfie, fitting room, gym mirror, hallway mirror",
    "   travel   – airport, rooftop view, skyline, road trip, hotel, city view from above",
    "   nightlife – club, bar, party, neon lights, night out",
    "   food     – coffee, food, café, restaurant, drinks",
    "   fitness  – gym equipment, workout, yoga, athletic setting",
    "   beach    – beach, pool, water, sand, ocean, poolside",
    "   casual   – couch, hammock, home, rainy day, low-key indoors, outdoor sitting",
    "",
    "2. DETAILS — one sentence (max 20 words) of specific visual props a guy would notice:",
    "   Mention specific items: drinks (color, type), food, accessories, setting details, what she's doing.",
    '   Good: "at a rainy outdoor café, green matcha and croissant on table, headphones on, tablet open"',
    '   Good: "gym mirror selfie in a black sports bra, water bottle and towel on the bench"',
    '   Good: "in a hammock at a tropical villa, glass doors and lush plants behind her"',
    "   Bad: 'a woman sitting outdoors' (too generic — name the actual props visible)",
    "",
    "3. HOOK — the single most textable visual detail a guy could naturally drop into a flirty opener (max 10 words).",
    "   This should be a SPECIFIC prop, combo, or moment — something only visible in THIS image.",
    '   Good: "green matcha and croissant at a rainy café"',
    '   Good: "hammock at a tropical villa with glass doors"',
    '   Bad: "she looks good" (not specific enough)',
    "",
    "4. CAPTIONS — pick exactly 2 captions from this list that are visually accurate for this image:",
    `   [${captionListStr}]`,
    "   Only pick captions whose theme actually matches what's visible. Return as a JSON array of 2 strings.",
    '   Example: ["coffee run", "quiet day"] for a café scene. Never pick "rainy walk" for an indoor shot.',
    "",
    `Return ONLY a JSON object with keys "1" through "${batch.length}".`,
    'Each value must have "category", "details", "hook", and "captions" fields.',
    'Example: {"1":{"category":"casual","details":"at a rainy outdoor café, green matcha on table, headphones on","hook":"green matcha and headphones at a rainy café","captions":["coffee run","quiet day"]}}',
    "No extra text, no markdown, just the JSON object."
  ].join("\n");

  const payload = {
    model: MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...imageContent
        ]
      }
    ],
    max_tokens: 600,
    temperature: 0
  };

  const visionController = new AbortController();
  const visionTimeoutId = setTimeout(() => visionController.abort(), 60000);
  let resp;
  try {
    resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(payload),
      signal: visionController.signal
    });
  } finally {
    clearTimeout(visionTimeoutId);
  }

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content?.trim() || "{}";
  try {
    const parsed = JSON.parse(text);
    return batch.map((filename, idx) => {
      const entry = parsed[String(idx + 1)] || {};
      const cat = entry.category || "selfie";
      const captions = Array.isArray(entry.captions)
        ? entry.captions.filter((c) => ALL_CAPTIONS_FLAT.includes(c)).slice(0, 2)
        : [];
      return {
        filename,
        category: VALID_CATEGORIES.includes(cat) ? cat : "selfie",
        details: String(entry.details || "").trim().slice(0, 150),
        hook: String(entry.hook || "").trim().slice(0, 80),
        captions
      };
    });
  } catch (_) {
    console.warn("[categorize] Failed to parse JSON for batch, defaulting to selfie:", text.slice(0, 200));
    return batch.map((filename) => ({ filename, category: "selfie", details: "", hook: "", captions: [] }));
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Helpers to write manifest
// ---------------------------------------------------------------------------
function buildManifest(results) {
  return Object.entries(results)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([filename, { category, details, hook, captions }]) => ({
      filename,
      category,
      details,
      hook: hook || "",
      captions: captions || []
    }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  const results = { ...existing };

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    process.stdout.write(`[categorize] Processing ${i + 1}–${Math.min(i + BATCH_SIZE, todo.length)} / ${todo.length}...`);

    let entries;
    try {
      entries = await callVision(batch);
    } catch (err) {
      console.error(`\n[categorize] Batch failed: ${err.message} — defaulting to selfie`);
      entries = batch.map((filename) => ({ filename, category: "selfie", details: "" }));
    }

    entries.forEach(({ filename, category, details, hook, captions }) => {
      results[filename] = { category, details, hook, captions };
    });

    console.log(` done. (${entries.map((e) => e.category).join(", ")})`);

    // Save incrementally so progress isn't lost on interruption
    fs.writeFileSync(OUT_FILE, JSON.stringify(buildManifest(results), null, 2));

    if (i + BATCH_SIZE < todo.length) await sleep(DELAY_MS);
  }

  // Final save (already sorted in buildManifest)
  const manifest = buildManifest(results);
  fs.writeFileSync(OUT_FILE, JSON.stringify(manifest, null, 2));

  const counts = {};
  manifest.forEach(({ category }) => { counts[category] = (counts[category] || 0) + 1; });
  console.log(`\n[categorize] Done. ${manifest.length} images categorized.`);
  console.log("[categorize] Breakdown:", counts);
  console.log(`[categorize] Written to: ${OUT_FILE}`);
})();
