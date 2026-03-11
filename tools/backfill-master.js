#!/usr/bin/env node
/**
 * backfill-master.js
 *
 * One-time parser for viral_video_breakdowns_unique_MASTER.md.
 * Extracts hooks, conversations, and openers from all 104 videos
 * and writes them as competitor_intel/{video_id}.json files.
 *
 * Run: node tools/backfill-master.js
 * Safe to re-run — overwrites existing intel files for same video IDs.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MASTER_PATH = path.join(ROOT, "viral_video_breakdowns_unique_MASTER.md");
const INTEL_DIR = path.join(ROOT, "competitor_intel");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function parseVideo(block) {
  const result = {
    video_id: null,
    account: null,
    views: null,
    date: null,
    hook: { headline: null, subtitle: null },
    conversation: [],
    opener: null,
    punchline_pairs: [],
    arc_type: "number_exchange",
  };

  // Extract video ID
  const idMatch = block.match(/^## Video:\s*(.+?)(?:\.mp4)?\s*$/m);
  if (idMatch) result.video_id = idMatch[1].trim();
  if (!result.video_id) return null;

  // Extract hook from Shot 1 overlay text
  const shot1Match = block.match(/Shot 1[\s\S]*?(?=\d+\.\s*Shot 2|### |$)/);
  if (shot1Match) {
    const shot1 = shot1Match[0];
    // Look for text overlay lines
    const overlayLines = [];
    const overlayRe = /(?:Text overlay|overlay text|Large centered overlay text)[^\u201c"]*[\u201c"]([^\u201d"]+)[\u201d"]/gi;
    let m;
    while ((m = overlayRe.exec(shot1)) !== null) {
      overlayLines.push(m[1].trim());
    }
    if (overlayLines.length >= 2) {
      result.hook.headline = overlayLines[0];
      result.hook.subtitle = overlayLines[1].startsWith("*") ? overlayLines[1] : `*${overlayLines[1]}*`;
    } else if (overlayLines.length === 1) {
      result.hook.headline = overlayLines[0];
    }
  }

  // Extract conversation from bubble text
  // Uses a line-by-line approach to handle all format variations:
  //   - "Outgoing bubble (right, blue): "text"" or \u201ctext\u201d
  //   - "Right-side purple: "text"" or \u201ctext\u201d
  //   - "Incoming bubble (left, dark gray): "text""
  //   - "Left gray bubble: "text""
  const lines = block.split("\n");
  for (const line of lines) {
    // Extract quoted text — handle both straight and smart quotes
    const quotedMatch = line.match(/[\u201c"]([^\u201d"]{2,})[\u201d"]/);
    if (!quotedMatch) continue;
    const text = quotedMatch[1].trim();
    if (!text || text.length > 120) continue; // skip non-message content
    // Skip non-message lines (timing info, descriptions, etc.)
    if (/fps|pts_time|duration|format|source|resolution|Hz|contactsheet|export/i.test(text)) continue;
    const lineLower = line.toLowerCase();
    // Determine direction
    let from = null;
    if (/outgoing|right.?side\s+purple|right\s+purple|purple\s+bubble/i.test(lineLower)) {
      from = "boy";
    } else if (/incoming|left.?side|left\s+gray|gray\s+bubble|dark\s+gray/i.test(lineLower)) {
      from = "girl";
    } else if (/(?:blue|purple)\s+bubble|cta\s+pill/i.test(lineLower)) {
      from = "boy"; // AI app suggested line (usually boy's punchline)
    }
    if (!from) continue;
    // Skip duplicates (same message shown across multiple shots)
    const lastMsg = result.conversation[result.conversation.length - 1];
    if (lastMsg && lastMsg.text === text && lastMsg.from === from) continue;
    result.conversation.push({ from, text });
  }

  // Also try CTA pill button text (AI app punchline)
  const ctaRe = /CTA pill button[^\u201c"]*[\u201c"]([^\u201d"]+)[\u201d"]/gi;
  let ctaMatch;
  while ((ctaMatch = ctaRe.exec(block)) !== null) {
    const ctaText = ctaMatch[1].trim();
    // This is often the AI-suggested punchline
    if (ctaText && ctaText.length < 80) {
      // Check if it's already in the conversation
      const alreadyThere = result.conversation.some((m) => m.text === ctaText);
      if (!alreadyThere) {
        // It's the AI card punchline — note it but don't add to convo
        // (it appears in the app card, then gets sent as a message)
      }
    }
  }

  // Set opener
  if (result.conversation.length > 0) {
    const firstBoy = result.conversation.find((m) => m.from === "boy");
    if (firstBoy) result.opener = firstBoy.text;
  }

  // Deduplicate consecutive identical messages (shown across multiple shots)
  const deduped = [];
  for (const msg of result.conversation) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.from === msg.from && prev.text === msg.text) continue;
    deduped.push(msg);
  }
  result.conversation = deduped;

  return result;
}

function main() {
  if (!fs.existsSync(MASTER_PATH)) {
    console.error(`[backfill] MASTER file not found: ${MASTER_PATH}`);
    process.exit(1);
  }

  ensureDir(INTEL_DIR);

  const text = fs.readFileSync(MASTER_PATH, "utf8");

  // Split by video headers
  const blocks = text.split(/(?=^## Video:)/m).filter((b) => b.startsWith("## Video:"));

  console.log(`[backfill] Found ${blocks.length} video blocks in MASTER file.`);

  let written = 0;
  let skipped = 0;
  let noConvo = 0;

  for (const block of blocks) {
    const intel = parseVideo(block);
    if (!intel || !intel.video_id) {
      skipped++;
      continue;
    }

    if (intel.conversation.length < 2) {
      noConvo++;
      continue;
    }

    const outPath = path.join(INTEL_DIR, `${intel.video_id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(intel, null, 2));
    written++;
  }

  console.log(
    `[backfill] Done: ${written} intel files written, ${skipped} skipped (no ID), ${noConvo} skipped (no conversation).`
  );
  console.log(`[backfill] Output: ${INTEL_DIR}/`);
  console.log(`\n[backfill] Next: run 'node tools/sync-competitor-intel.js' to sync into data banks.`);
}

main();
