#!/usr/bin/env node
/**
 * Performance Agent — closes the learning loop
 *
 * Tracks @rizzpsych video views, correlates with script attributes,
 * identifies winners/losers, and recommends config changes.
 *
 * Usage:
 *   node tools/performance-agent.js                    # full daily report
 *   node tools/performance-agent.js --scrape           # just scrape views
 *   node tools/performance-agent.js --report           # just analyze
 *   node tools/performance-agent.js --auto-update      # analyze + apply changes to config
 *   node tools/performance-agent.js --show-data        # show raw tracking data
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "performance");
const TRACKING_FILE = path.join(DATA_DIR, "video_tracking.json");
const REPORTS_DIR = path.join(DATA_DIR, "reports");
const CONFIG_PATH = path.join(ROOT, "config.json");
const ACCOUNT = "rizzpsych";

// ── Scraping ──────────────────────────────────────────────────

function scrapeAccount() {
  console.log(`[scrape] Fetching @${ACCOUNT} videos...`);

  const ytdlp = findYtdlp();
  if (!ytdlp) {
    console.error("[scrape] yt-dlp not found. Install with: pip install yt-dlp");
    return [];
  }

  try {
    const result = execSync(
      `${ytdlp} --flat-playlist --dump-json "https://www.tiktok.com/@${ACCOUNT}" 2>/dev/null`,
      { maxBuffer: 50 * 1024 * 1024, timeout: 120000 }
    ).toString();

    const videos = result
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); } catch (_) { return null; }
      })
      .filter(Boolean)
      .map((v) => ({
        id: v.id || v.webpage_url_basename,
        title: v.title || v.description || "",
        description: v.description || "",
        view_count: v.view_count || 0,
        like_count: v.like_count || 0,
        comment_count: v.comment_count || 0,
        share_count: v.repost_count || v.share_count || 0,
        duration: v.duration || 0,
        upload_date: v.upload_date || "",
        url: v.webpage_url || v.url || "",
      }));

    console.log(`[scrape] Found ${videos.length} videos`);
    return videos;
  } catch (e) {
    console.error(`[scrape] Error: ${e.message.substring(0, 100)}`);
    return [];
  }
}

function findYtdlp() {
  const candidates = [
    "yt-dlp",
    path.join(process.env.HOME || "", ".local/bin/yt-dlp"),
    "/.sprite/languages/python/pyenv/versions/3.13.7/bin/yt-dlp",
  ];
  for (const c of candidates) {
    try { execSync(`${c} --version 2>/dev/null`); return c; } catch (_) {}
  }
  return null;
}

// ── Data Persistence ──────────────────────────────────────────

function loadTracking() {
  if (!fs.existsSync(TRACKING_FILE)) return { videos: {}, scrape_history: [] };
  return JSON.parse(fs.readFileSync(TRACKING_FILE, "utf8"));
}

function saveTracking(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TRACKING_FILE, JSON.stringify(data, null, 2));
}

function updateTracking(scraped) {
  const tracking = loadTracking();
  const now = new Date().toISOString();
  let newCount = 0;

  for (const video of scraped) {
    const existing = tracking.videos[video.id];
    if (!existing) {
      tracking.videos[video.id] = {
        ...video,
        first_seen: now,
        view_history: [{ date: now, views: video.view_count }],
        matched_script: null,
      };
      newCount++;
    } else {
      // Update counts
      existing.view_count = video.view_count;
      existing.like_count = video.like_count;
      existing.comment_count = video.comment_count;
      existing.share_count = video.share_count;
      existing.view_history.push({ date: now, views: video.view_count });
    }
  }

  tracking.scrape_history.push({
    date: now,
    video_count: scraped.length,
    new_videos: newCount,
  });

  saveTracking(tracking);
  console.log(`[tracking] Updated ${scraped.length} videos (${newCount} new)`);
  return tracking;
}

// ── Script Matching ───────────────────────────────────────────

function matchVideosToScripts(tracking) {
  const scriptsDir = path.join(ROOT, "scripts");
  if (!fs.existsSync(scriptsDir)) return;

  const scriptDirs = fs.readdirSync(scriptsDir).filter((d) => d.startsWith("2026-"));

  for (const dir of scriptDirs) {
    const fullDir = path.join(scriptsDir, dir);
    if (!fs.statSync(fullDir).isDirectory()) continue;

    const files = fs.readdirSync(fullDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const script = JSON.parse(fs.readFileSync(path.join(fullDir, file), "utf8"));
        const hookText = (script.hook && script.hook.headline) || "";
        const caption = script.tiktok_caption || "";

        // Match by caption text overlap
        for (const [videoId, video] of Object.entries(tracking.videos)) {
          if (video.matched_script) continue;
          const desc = (video.description || video.title || "").toLowerCase();
          if (hookText && desc.includes(hookText.toLowerCase().substring(0, 20))) {
            video.matched_script = {
              file: `${dir}/${file}`,
              arc_type: script.meta.arc_type,
              punchline_style: script.meta.punchline_style || "none",
              format_variant: script.meta.format_variant || "short",
              duration_s: script.meta.duration_s || 0,
              hook_headline: hookText,
              girl_archetype: script.meta.girl_archetype || "default",
            };
          }
        }
      } catch (_) {}
    }
  }
}

// ── Analysis ──────────────────────────────────────────────────

function analyzePerformance(tracking) {
  const videos = Object.values(tracking.videos);
  if (videos.length < 3) {
    console.log("[analysis] Need at least 3 videos to analyze. Post more!");
    return null;
  }

  const totalViews = videos.reduce((s, v) => s + v.view_count, 0);
  const avgViews = Math.round(totalViews / videos.length);

  // Winners and losers
  const sorted = [...videos].sort((a, b) => b.view_count - a.view_count);
  const winners = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.2)));
  const losers = sorted.slice(-Math.max(1, Math.floor(sorted.length * 0.2)));

  // Performance by attribute (only for matched videos)
  const matched = videos.filter((v) => v.matched_script);
  const byAttribute = {};

  const attrs = ["arc_type", "punchline_style", "format_variant", "girl_archetype"];
  for (const attr of attrs) {
    byAttribute[attr] = {};
    for (const v of matched) {
      const val = v.matched_script[attr] || "unknown";
      if (!byAttribute[attr][val]) byAttribute[attr][val] = { views: [], count: 0 };
      byAttribute[attr][val].views.push(v.view_count);
      byAttribute[attr][val].count++;
    }
    // Compute averages
    for (const val of Object.keys(byAttribute[attr])) {
      const arr = byAttribute[attr][val].views;
      byAttribute[attr][val].avg = Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
    }
  }

  // Duration buckets
  const durationBuckets = { short: { views: [], count: 0 }, long: { views: [], count: 0 } };
  for (const v of matched) {
    const bucket = v.matched_script.duration_s < 30 ? "short" : "long";
    durationBuckets[bucket].views.push(v.view_count);
    durationBuckets[bucket].count++;
  }
  for (const b of Object.keys(durationBuckets)) {
    const arr = durationBuckets[b].views;
    durationBuckets[b].avg = arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
  }

  return {
    total_videos: videos.length,
    matched_videos: matched.length,
    total_views: totalViews,
    avg_views: avgViews,
    winners: winners.map((v) => ({
      id: v.id,
      views: v.view_count,
      script: v.matched_script,
    })),
    losers: losers.map((v) => ({
      id: v.id,
      views: v.view_count,
      script: v.matched_script,
    })),
    by_attribute: byAttribute,
    duration_buckets: durationBuckets,
    generated_at: new Date().toISOString(),
  };
}

// ── Recommendations ───────────────────────────────────────────

function generateRecommendations(analysis) {
  if (!analysis) return [];
  const recs = [];

  // Punchline style recommendations
  const ps = analysis.by_attribute.punchline_style || {};
  const psSorted = Object.entries(ps)
    .filter(([_, v]) => v.count >= 2)
    .sort((a, b) => b[1].avg - a[1].avg);

  if (psSorted.length >= 2) {
    const best = psSorted[0];
    const worst = psSorted[psSorted.length - 1];
    if (best[1].avg > worst[1].avg * 1.5) {
      recs.push({
        type: "reweight_punchline",
        message: `${best[0]} gets ${best[1].avg} avg views vs ${worst[0]} at ${worst[1].avg}. Consider increasing ${best[0]} weight.`,
        action: { increase: best[0], decrease: worst[0] },
        confidence: psSorted[0][1].count >= 5 ? "high" : "low",
      });
    }
  }

  // Duration recommendations
  const dur = analysis.duration_buckets;
  if (dur.short.count >= 3 && dur.long.count >= 3) {
    const ratio = dur.short.avg / Math.max(1, dur.long.avg);
    if (ratio > 1.3) {
      recs.push({
        type: "adjust_duration",
        message: `Short videos (${dur.short.avg} avg) outperform long (${dur.long.avg} avg) by ${Math.round((ratio - 1) * 100)}%. Consider increasing short weight.`,
        action: { increase_short: true },
        confidence: "medium",
      });
    } else if (ratio < 0.7) {
      recs.push({
        type: "adjust_duration",
        message: `Long videos (${dur.long.avg} avg) outperform short (${dur.short.avg} avg). Consider increasing long weight.`,
        action: { increase_long: true },
        confidence: "medium",
      });
    }
  }

  // Winner pattern extraction
  for (const winner of analysis.winners) {
    if (winner.script && winner.views > analysis.avg_views * 2) {
      recs.push({
        type: "replicate_winner",
        message: `Video ${winner.id} got ${winner.views} views (${Math.round(winner.views / analysis.avg_views)}x average). Pattern: ${winner.script.punchline_style}, ${winner.script.format_variant}, hook="${winner.script.hook_headline}"`,
        action: { replicate: winner.script },
        confidence: "high",
      });
    }
  }

  return recs;
}

// ── Report Generation ─────────────────────────────────────────

function generateReport(analysis, recommendations) {
  if (!analysis) return "Not enough data for a report. Post more videos!";

  const lines = [];
  lines.push("═══════════════════════════════════════════════════════");
  lines.push("  PERFORMANCE REPORT — @rizzpsych");
  lines.push(`  Generated: ${new Date().toISOString().split("T")[0]}`);
  lines.push("═══════════════════════════════════════════════════════");
  lines.push("");
  lines.push(`  Total videos: ${analysis.total_videos}`);
  lines.push(`  Matched to scripts: ${analysis.matched_videos}`);
  lines.push(`  Total views: ${analysis.total_views.toLocaleString()}`);
  lines.push(`  Average views: ${analysis.avg_views.toLocaleString()}`);
  lines.push("");

  lines.push("  TOP PERFORMERS:");
  for (const w of analysis.winners) {
    const ps = w.script ? w.script.punchline_style : "unknown";
    lines.push(`    ${w.views.toLocaleString()} views | ${ps} | ${w.id}`);
  }
  lines.push("");

  lines.push("  LOWEST PERFORMERS:");
  for (const l of analysis.losers) {
    const ps = l.script ? l.script.punchline_style : "unknown";
    lines.push(`    ${l.views.toLocaleString()} views | ${ps} | ${l.id}`);
  }
  lines.push("");

  lines.push("  PERFORMANCE BY PUNCHLINE STYLE:");
  const ps = analysis.by_attribute.punchline_style || {};
  const psSorted = Object.entries(ps).sort((a, b) => b[1].avg - a[1].avg);
  for (const [style, data] of psSorted) {
    const bar = "█".repeat(Math.min(30, Math.round(data.avg / Math.max(1, analysis.avg_views) * 15)));
    lines.push(`    ${style.padEnd(22)} ${String(data.avg).padStart(6)} avg  (${data.count} videos) ${bar}`);
  }
  lines.push("");

  lines.push("  PERFORMANCE BY DURATION:");
  for (const [bucket, data] of Object.entries(analysis.duration_buckets)) {
    if (data.count === 0) continue;
    lines.push(`    ${bucket.padEnd(10)} ${String(data.avg).padStart(6)} avg  (${data.count} videos)`);
  }
  lines.push("");

  if (recommendations.length > 0) {
    lines.push("  RECOMMENDATIONS:");
    for (const rec of recommendations) {
      lines.push(`    [${rec.confidence.toUpperCase()}] ${rec.message}`);
    }
  } else {
    lines.push("  No recommendations yet. Need more data (20+ videos).");
  }

  return lines.join("\n");
}

// ── Auto-Update Config ────────────────────────────────────────

function autoUpdateConfig(recommendations) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  let changed = false;

  for (const rec of recommendations) {
    if (rec.confidence !== "high") continue;

    if (rec.type === "reweight_punchline" && rec.action) {
      console.log(`[auto-update] Would reweight ${rec.action.increase} up, ${rec.action.decrease} down`);
      // Only log for now — uncomment to auto-apply:
      // changed = true;
    }

    if (rec.type === "adjust_duration" && rec.action) {
      console.log(`[auto-update] Would adjust duration mix`);
      // changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log("[auto-update] Config updated");
  } else {
    console.log("[auto-update] No high-confidence changes to apply (need more data)");
  }
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const doScrape = args.includes("--scrape") || (!args.length);
  const doReport = args.includes("--report") || (!args.length);
  const doAutoUpdate = args.includes("--auto-update");
  const showData = args.includes("--show-data");

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  let tracking = loadTracking();

  if (doScrape) {
    const scraped = scrapeAccount();
    if (scraped.length > 0) {
      tracking = updateTracking(scraped);
      matchVideosToScripts(tracking);
      saveTracking(tracking);
    }
  }

  if (showData) {
    const videos = Object.values(tracking.videos);
    console.log(`\nTracked videos: ${videos.length}`);
    videos.sort((a, b) => b.view_count - a.view_count);
    for (const v of videos.slice(0, 20)) {
      const matched = v.matched_script ? `${v.matched_script.punchline_style}` : "unmatched";
      console.log(`  ${String(v.view_count).padStart(8)} views | ${matched.padEnd(20)} | ${(v.description || "").substring(0, 50)}`);
    }
    return;
  }

  if (doReport || doAutoUpdate) {
    const analysis = analyzePerformance(tracking);
    const recs = generateRecommendations(analysis);
    const report = generateReport(analysis, recs);

    console.log(report);

    // Save report
    const reportDate = new Date().toISOString().split("T")[0];
    const reportPath = path.join(REPORTS_DIR, `${reportDate}.txt`);
    fs.writeFileSync(reportPath, report);
    console.log(`\nReport saved: ${reportPath}`);

    if (doAutoUpdate) {
      autoUpdateConfig(recs);
    }
  }
}

main().catch(console.error);
