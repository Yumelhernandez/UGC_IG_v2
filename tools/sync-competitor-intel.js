#!/usr/bin/env node
/**
 * sync-competitor-intel.js
 *
 * Reads competitor_intel/*.json files, dedupes against _synced.json,
 * and appends new hooks, conversations, and punchline pairs to the
 * generation data banks:
 *   - hook_lines.md
 *   - viral_examples.json
 *   - anchor_variants.json
 *
 * Run: node tools/sync-competitor-intel.js
 * Safe to re-run — idempotent via _synced.json dedup.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INTEL_DIR = path.join(ROOT, "competitor_intel");
const SYNCED_PATH = path.join(INTEL_DIR, "_synced.json");
const HOOKS_PATH = path.join(ROOT, "hook_lines.md");
const EXAMPLES_PATH = path.join(ROOT, "viral_examples.json");
const VARIANTS_PATH = path.join(ROOT, "anchor_variants.json");

function loadSynced() {
  try {
    return JSON.parse(fs.readFileSync(SYNCED_PATH, "utf8"));
  } catch {
    return [];
  }
}

function saveSynced(ids) {
  fs.writeFileSync(SYNCED_PATH, JSON.stringify(ids, null, 2));
}

function loadIntelFiles() {
  if (!fs.existsSync(INTEL_DIR)) return [];
  return fs
    .readdirSync(INTEL_DIR)
    .filter((f) => f.endsWith(".json") && f !== "_synced.json")
    .map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(INTEL_DIR, f), "utf8"));
        data._filename = f;
        return data;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// --- HOOKS ---

function loadExistingHooks() {
  try {
    const text = fs.readFileSync(HOOKS_PATH, "utf8");
    const lines = text.split("\n");
    const hooks = new Set();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("*") && !trimmed.startsWith("-")) {
        hooks.add(trimmed.toLowerCase());
      }
    }
    return hooks;
  } catch {
    return new Set();
  }
}

function appendHook(headline, subtitle) {
  const entry = subtitle ? `${headline}\n${subtitle}\n` : `${headline}\n`;
  fs.appendFileSync(HOOKS_PATH, `\n${entry}`);
}

// --- CONVERSATIONS ---

function loadExistingExamples() {
  try {
    return JSON.parse(fs.readFileSync(EXAMPLES_PATH, "utf8"));
  } catch {
    return [];
  }
}

function saveExamples(examples) {
  fs.writeFileSync(EXAMPLES_PATH, JSON.stringify(examples, null, 2));
}

// --- ANCHOR VARIANTS ---

function loadVariants() {
  try {
    return JSON.parse(fs.readFileSync(VARIANTS_PATH, "utf8"));
  } catch {
    return { variants: {} };
  }
}

function saveVariants(variants) {
  fs.writeFileSync(VARIANTS_PATH, JSON.stringify(variants, null, 2));
}

function pairExists(pairs, setup) {
  const normalized = (setup || "").toLowerCase().trim();
  return pairs.some((p) => (p.setup || "").toLowerCase().trim() === normalized);
}

// --- MAIN ---

function main() {
  const syncedIds = new Set(loadSynced());
  const intelFiles = loadIntelFiles();
  const newFiles = intelFiles.filter((f) => !syncedIds.has(f.video_id));

  if (newFiles.length === 0) {
    console.log("[sync] No new competitor intel to process.");
    return;
  }

  console.log(`[sync] Found ${newFiles.length} new intel files to process.`);

  const existingHooks = loadExistingHooks();
  const examples = loadExistingExamples();
  const existingExampleIds = new Set(examples.map((e) => e.video_id));
  const variants = loadVariants();

  let hooksAdded = 0;
  let convosAdded = 0;
  let pairsAdded = 0;

  for (const intel of newFiles) {
    const vid = intel.video_id;

    // 1. HOOKS — filter out noise (arena signage, app branding, single words)
    if (intel.hook && intel.hook.headline) {
      const headline = intel.hook.headline.trim();
      const headlineLower = headline.toLowerCase();
      const wordCount = headline.split(/\s+/).length;
      const isNoise = wordCount < 3 || /\.com|\.net|\.org/i.test(headline) || /^[A-Z]{1,5}$/i.test(headline);
      if (!isNoise && !existingHooks.has(headlineLower)) {
        const subtitle = intel.hook.subtitle || null;
        appendHook(intel.hook.headline, subtitle);
        existingHooks.add(headlineLower);
        hooksAdded++;
        console.log(`  [hook] + "${intel.hook.headline}"`);
      }
    }

    // 2. CONVERSATIONS
    if (
      Array.isArray(intel.conversation) &&
      intel.conversation.length >= 4 &&
      !existingExampleIds.has(vid)
    ) {
      const example = {
        video_id: vid,
        opener: intel.opener || (intel.conversation[0] && intel.conversation[0].text) || "",
        conversation: intel.conversation,
        arc_type: intel.arc_type || "number_exchange",
      };
      if (intel.punchline_pairs && intel.punchline_pairs.length > 0) {
        example.ai_card_punchline = intel.punchline_pairs[0].reframe || "";
      }
      examples.push(example);
      existingExampleIds.add(vid);
      convosAdded++;
      console.log(`  [convo] + ${vid} (${intel.conversation.length} msgs)`);
    }

    // 3. PUNCHLINE PAIRS
    if (Array.isArray(intel.punchline_pairs)) {
      for (const pair of intel.punchline_pairs) {
        if (!pair.setup || !pair.reframe) continue;
        const style = pair.style || "setup_reframe";
        const styleVariants = variants.variants && variants.variants[style];
        if (styleVariants && Array.isArray(styleVariants.pairs)) {
          if (!pairExists(styleVariants.pairs, pair.setup)) {
            styleVariants.pairs.push({
              setup: pair.setup,
              reframe: pair.reframe,
              type: pair.type || "competitor_mined",
            });
            pairsAdded++;
            console.log(`  [pair] + "${pair.setup}" → "${pair.reframe}"`);
          }
        }
      }
    }
  }

  // Save updated files
  if (convosAdded > 0) saveExamples(examples);
  if (pairsAdded > 0) saveVariants(variants);

  // Update synced list
  const allSynced = [...syncedIds, ...newFiles.map((f) => f.video_id)];
  saveSynced(allSynced);

  console.log(
    `\n[sync] Done: +${hooksAdded} hooks, +${convosAdded} conversations, +${pairsAdded} pairs from ${newFiles.length} new videos.`
  );
}

main();
