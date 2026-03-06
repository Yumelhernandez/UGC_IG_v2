const fs = require("fs");
const path = require("path");
const { dateStamp, ensureDir, loadConfig } = require("./lib/utils");
const { validateScript } = require("./lib/qa");

function parseArgs(argv) {
  const args = { date: null };
  argv.forEach((arg) => {
    if (arg.startsWith("--date=")) args.date = arg.split("=")[1];
  });
  return args;
}

function extractDatePrefix(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function parseDatePrefix(value) {
  const prefix = extractDatePrefix(value);
  if (!prefix) return null;
  const parsed = new Date(`${prefix}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function computeWindowCutoffDate(baseDate, windowDays) {
  const safeWindow = Math.max(1, Number(windowDays) || 1);
  const cutoff = new Date(baseDate.getTime());
  cutoff.setUTCDate(cutoff.getUTCDate() - (safeWindow - 1));
  return cutoff;
}

function normalizeNoveltyLine(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadRecentReplyHistory({ rootDir, date, windowDays }) {
  const scriptsRoot = path.join(rootDir, "scripts");
  const currentDir = path.join(scriptsRoot, date);
  const batchDate = parseDatePrefix(date) || new Date();
  const cutoff = computeWindowCutoffDate(batchDate, windowDays);
  const seen = new Set();
  let scannedDirs = 0;
  if (!fs.existsSync(scriptsRoot)) {
    return { seen, scannedDirs };
  }
  let dateDirs = [];
  try {
    dateDirs = fs
      .readdirSync(scriptsRoot)
      .filter((dirName) => {
        if (!/^\d{4}-\d{2}-\d{2}/.test(dirName)) return false;
        const dirPath = path.join(scriptsRoot, dirName);
        if (dirPath === currentDir) return false;
        const dirDate = parseDatePrefix(dirName);
        if (!dirDate) return false;
        return dirDate >= cutoff && dirDate <= batchDate;
      })
      .sort();
  } catch (_) {
    return { seen, scannedDirs };
  }

  for (const dirName of dateDirs) {
    const dirPath = path.join(scriptsRoot, dirName);
    scannedDirs += 1;
    let files = [];
    try {
      files = fs.readdirSync(dirPath).filter((file) => file.endsWith(".json"));
    } catch (_) {
      continue;
    }
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dirPath, file), "utf8");
        const script = JSON.parse(raw);
        const reply = script && script.reply && typeof script.reply.text === "string" ? script.reply.text : "";
        const key = normalizeNoveltyLine(reply);
        if (key) seen.add(key);
      } catch (_) {}
    }
  }

  return { seen, scannedDirs };
}

function reasonBucket(reason) {
  const text = String(reason || "").toLowerCase();
  if (!text) return "other";
  if (text.includes("arc")) return "arc_integrity";
  if (text.includes("hook")) return "hook_quality";
  if (text.includes("timing") || text.includes("reveal_time") || text.includes("win_time")) {
    return "timing_pacing";
  }
  if (text.includes("novelty") || text.includes("repeated")) return "novelty";
  if (text.includes("safety") || text.includes("banned")) return "safety";
  if (
    text.includes("missing") ||
    text.includes("invalid") ||
    text.includes("duration") ||
    text.includes("asset")
  ) {
    return "schema_metadata";
  }
  if (text.includes("ask") || text.includes("win") || text.includes("reveal")) return "mechanics";
  return "other";
}

function suggestedActions(topBuckets) {
  const actions = [];
  if (topBuckets.includes("arc_integrity")) {
    actions.push("Tighten arc-specific generation constraints before writing the final two messages.");
  }
  if (topBuckets.includes("hook_quality")) {
    actions.push("Regenerate story reply hooks using stronger curiosity-gap formulas and avoid weak templates.");
  }
  if (topBuckets.includes("timing_pacing")) {
    actions.push("Re-time message `type_at` values after generation to keep reveal/win beats inside target windows.");
  }
  if (topBuckets.includes("schema_metadata")) {
    actions.push("Backfill required metadata fields/asset refs before QA to prevent avoidable hard failures.");
  }
  if (topBuckets.includes("novelty")) {
    actions.push("Increase avoidance window for recently used hooks/endings and re-sample alternatives.");
  }
  if (topBuckets.includes("mechanics")) {
    actions.push("Add a repair pass focused on ask/win/reveal mechanics before final script save.");
  }
  if (topBuckets.includes("safety")) {
    actions.push("Strengthen banned phrase filtering before script-level validation.");
  }
  if (actions.length === 0) {
    actions.push("No dominant failure bucket detected; inspect per-file reasons for targeted fixes.");
  }
  return actions;
}

function buildFeedback({ date, results, summary }) {
  const failed = results.filter((row) => !row.pass);
  const reasonCounts = {};
  const bucketCounts = {};

  failed.forEach((row) => {
    (row.reasons || []).forEach((reason) => {
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      const bucket = reasonBucket(reason);
      bucketCounts[bucket] = (bucketCounts[bucket] || 0) + 1;
    });
  });

  const topReasons = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({ reason, count }));

  const topBuckets = Object.entries(bucketCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([bucket]) => bucket);

  return {
    date,
    summary: {
      total: summary.total,
      pass: summary.pass,
      fail: summary.fail,
      pass_rate: summary.total > 0 ? Number((summary.pass / summary.total).toFixed(3)) : 0
    },
    failed_files: failed.map((row) => ({ file: row.file, reasons: row.reasons || [] })),
    reason_counts: reasonCounts,
    bucket_counts: bucketCounts,
    top_reasons: topReasons,
    suggested_actions: suggestedActions(topBuckets)
  };
}

function run() {
  const rootDir = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const date = dateStamp(args.date);
  const config = loadConfig(rootDir);

  const scriptsDir = path.join(rootDir, "scripts", date);
  if (!fs.existsSync(scriptsDir)) {
    console.error(`Missing scripts directory: ${scriptsDir}`);
    process.exit(1);
  }

  const logDir = path.join(rootDir, "logs", date);
  ensureDir(logDir);

  const rows = [];
  const files = fs
    .readdirSync(scriptsDir)
    .filter((file) => file.endsWith(".json"))
    .sort();

  for (const file of files) {
    const filePath = path.join(scriptsDir, file);
    const raw = fs.readFileSync(filePath, "utf8");
    let script;
    try {
      script = JSON.parse(raw);
    } catch (error) {
      rows.push({ file, pass: false, reasons: ["invalid json"], script: null });
      continue;
    }

    const { pass, reasons } = validateScript({ script, config, rootDir });
    rows.push({ file, pass, reasons, script });
  }

  const noveltyWindowDays =
    Number(config && config.novelty && config.novelty.memory_window_days) > 0
      ? Number(config.novelty.memory_window_days)
      : 15;
  const { seen: recentReplyKeys, scannedDirs } = loadRecentReplyHistory({
    rootDir,
    date,
    windowDays: noveltyWindowDays
  });
  console.log(
    `[novelty] QA loaded ${recentReplyKeys.size} recent reply keys from ${scannedDirs} dirs (${noveltyWindowDays}d window)`
  );

  const batchReplyKeys = new Set();
  for (const row of rows) {
    if (!row.script || !row.script.reply || typeof row.script.reply.text !== "string") continue;
    const key = normalizeNoveltyLine(row.script.reply.text);
    if (!key) continue;
    if (recentReplyKeys.has(key)) {
      row.pass = false;
      if (!row.reasons.includes(`novelty window: reply reused within ${noveltyWindowDays} days`)) {
        row.reasons.push(`novelty window: reply reused within ${noveltyWindowDays} days`);
      }
    }
    if (batchReplyKeys.has(key)) {
      row.pass = false;
      if (!row.reasons.includes("novelty window: duplicate reply in current batch")) {
        row.reasons.push("novelty window: duplicate reply in current batch");
      }
    }
    batchReplyKeys.add(key);
  }

  const results = rows.map(({ file, pass, reasons }) => ({ file, pass, reasons }));
  const passCount = results.filter((row) => row.pass).length;

  const summary = {
    date,
    total: results.length,
    pass: passCount,
    fail: results.length - passCount
  };

  fs.writeFileSync(path.join(logDir, "qa.json"), `${JSON.stringify({ summary, results }, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(logDir, "summary.txt"),
    `date: ${summary.date}\npass: ${summary.pass}\nfail: ${summary.fail}\n`,
    "utf8"
  );

  const feedback = buildFeedback({ date, results, summary });
  fs.writeFileSync(
    path.join(logDir, "qa-feedback.json"),
    `${JSON.stringify(feedback, null, 2)}\n`,
    "utf8"
  );
  const feedbackText = [
    `date: ${date}`,
    `pass: ${summary.pass}/${summary.total}`,
    `pass_rate: ${feedback.summary.pass_rate}`,
    "top_reasons:"
  ];
  if (feedback.top_reasons.length === 0) {
    feedbackText.push("- none");
  } else {
    feedback.top_reasons.forEach((item) => feedbackText.push(`- ${item.reason}: ${item.count}`));
  }
  feedbackText.push("suggested_actions:");
  feedback.suggested_actions.forEach((action) => feedbackText.push(`- ${action}`));
  fs.writeFileSync(path.join(logDir, "qa-feedback.txt"), `${feedbackText.join("\n")}\n`, "utf8");

  console.log(`QA complete: ${summary.pass}/${summary.total} passed`);
}

if (require.main === module) {
  run();
}

module.exports = { run };
