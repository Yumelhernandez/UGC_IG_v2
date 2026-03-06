const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {
    date: null,
    minTotal: 5,
    minQaPassRate: 0.8,
    targetFormatBShortMin: 5,
    targetFormatBShortMax: 8,
    targetFormatBLongMin: 8,
    targetFormatBLongMax: 14
  };
  argv.forEach((arg) => {
    if (arg.startsWith("--date=")) args.date = arg.split("=")[1];
    if (arg.startsWith("--min-total=")) args.minTotal = Number(arg.split("=")[1]);
    if (arg.startsWith("--min-qa-pass-rate=")) args.minQaPassRate = Number(arg.split("=")[1]);
    if (arg.startsWith("--target-b-short-min=")) args.targetFormatBShortMin = Number(arg.split("=")[1]);
    if (arg.startsWith("--target-b-short-max=")) args.targetFormatBShortMax = Number(arg.split("=")[1]);
    if (arg.startsWith("--target-b-long-min=")) args.targetFormatBLongMin = Number(arg.split("=")[1]);
    if (arg.startsWith("--target-b-long-max=")) args.targetFormatBLongMax = Number(arg.split("=")[1]);
  });
  return args;
}

function dateStamp(input) {
  if (input) return input;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function run() {
  const rootDir = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const date = dateStamp(args.date);
  const scriptsDir = path.join(rootDir, "scripts", date);
  const logsDir = path.join(rootDir, "logs", date);
  const qaPath = path.join(logsDir, "qa.json");
  const viralPath = path.join(rootDir, "viral_patterns.json");

  if (!fs.existsSync(scriptsDir)) {
    console.error(`Missing scripts directory: ${scriptsDir}`);
    process.exit(1);
  }
  if (!fs.existsSync(qaPath)) {
    console.error(`Missing QA log: ${qaPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(viralPath)) {
    console.error(`Missing viral patterns file: ${viralPath}`);
    process.exit(1);
  }

  const scriptFiles = fs
    .readdirSync(scriptsDir)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const scripts = scriptFiles.map((file) => {
    const data = JSON.parse(fs.readFileSync(path.join(scriptsDir, file), "utf8"));
    return { file, data };
  });

  const qa = JSON.parse(fs.readFileSync(qaPath, "utf8"));
  const viral = JSON.parse(fs.readFileSync(viralPath, "utf8"));
  const total = scripts.length;
  const qaPass = qa && qa.summary ? qa.summary.pass : 0;
  const qaTotal = qa && qa.summary ? qa.summary.total : 0;
  const qaPassRate = qaTotal > 0 ? qaPass / qaTotal : 0;

  const messageCounts = scripts.map((item) =>
    Array.isArray(item.data.messages) ? item.data.messages.length : 0
  );
  const formatBCounts = scripts
    .filter((item) => item.data.meta && item.data.meta.format === "B")
    .map((item) => ({
      file: item.file,
      count: Array.isArray(item.data.messages) ? item.data.messages.length : 0,
      variant:
        item.data.meta && item.data.meta.format_variant === "long"
          ? "long"
          : Number(item.data.meta && item.data.meta.duration_s) >= 55
          ? "long"
          : "short"
    }));
  const outOfRangeFormatB = formatBCounts.filter(
    (row) =>
      row.variant === "long"
        ? row.count < args.targetFormatBLongMin || row.count > args.targetFormatBLongMax
        : row.count < args.targetFormatBShortMin || row.count > args.targetFormatBShortMax
  );

  const missingAudioTrack = scripts
    .filter((item) => !item.data.meta || typeof item.data.meta.audio_track !== "string" || !item.data.meta.audio_track.trim())
    .map((item) => item.file);
  const missingInBetweenAssets = scripts
    .filter(
      (item) =>
        !item.data.meta ||
        !Array.isArray(item.data.meta.in_between_assets) ||
        item.data.meta.in_between_assets.length === 0
    )
    .map((item) => item.file);

  const arcCounts = {};
  scripts.forEach((item) => {
    const arc = (item.data.meta && item.data.meta.arc_type) || "missing";
    arcCounts[arc] = (arcCounts[arc] || 0) + 1;
  });

  const viralAvgMessages =
    viral && viral.timing_rhythms && Number.isFinite(viral.timing_rhythms.average_messages_per_video)
      ? viral.timing_rhythms.average_messages_per_video
      : 9.7;
  const generatedAvgMessages = avg(messageCounts);

  const failures = [];
  if (total < args.minTotal) failures.push(`total scripts below minimum: ${total} < ${args.minTotal}`);
  if (qaPassRate < args.minQaPassRate)
    failures.push(`qa pass rate below minimum: ${qaPassRate.toFixed(2)} < ${args.minQaPassRate}`);
  // Advisory only: the canonical pass/fail for cadence/density lives in validate-viral-mechanics Gate 8.
  const warnings = [];
  if (outOfRangeFormatB.length > 0) {
    warnings.push(
      `format B message count outside advisory target range (short ${args.targetFormatBShortMin}-${args.targetFormatBShortMax}, long ${args.targetFormatBLongMin}-${args.targetFormatBLongMax})`
    );
  }
  if (missingAudioTrack.length > 0) failures.push("missing meta.audio_track in one or more scripts");
  if (missingInBetweenAssets.length > 0) failures.push("missing meta.in_between_assets in one or more scripts");

  const report = {
    date,
    summary: {
      total_scripts: total,
      qa_total: qaTotal,
      qa_pass: qaPass,
      qa_pass_rate: Number(qaPassRate.toFixed(3)),
      generated_avg_messages: Number(generatedAvgMessages.toFixed(2)),
      viral_avg_messages: Number(viralAvgMessages.toFixed(2))
    },
    arc_counts: arcCounts,
    out_of_range_format_b: outOfRangeFormatB,
    missing_audio_track_files: missingAudioTrack,
    missing_in_between_assets_files: missingInBetweenAssets,
    warnings,
    failures
  };

  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(path.join(logsDir, "compare-viral.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(logsDir, "compare-viral.txt"),
    `date: ${date}\n` +
      `scripts: ${total}\n` +
      `qa_pass_rate: ${qaPassRate.toFixed(3)}\n` +
      `avg_messages_generated: ${generatedAvgMessages.toFixed(2)}\n` +
      `avg_messages_viral: ${viralAvgMessages.toFixed(2)}\n` +
      `warnings: ${warnings.length}\n` +
      `failures: ${failures.length}\n`,
    "utf8"
  );

  if (failures.length > 0) {
    console.error("compare-viral failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log("compare-viral passed");
}

if (require.main === module) {
  run();
}
