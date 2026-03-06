const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = { date: null, minTotal: 5 };
  argv.forEach((arg) => {
    if (arg.startsWith("--date=")) args.date = arg.split("=")[1];
    if (arg.startsWith("--min-total=")) args.minTotal = Number(arg.split("=")[1]);
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

function existsAny(paths) {
  return paths.some((candidate) => fs.existsSync(candidate));
}

function run() {
  const rootDir = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const date = dateStamp(args.date);
  const scriptsDir = path.join(rootDir, "scripts", date);
  const logsDir = path.join(rootDir, "logs", date);
  const qaPath = path.join(logsDir, "qa.json");

  if (!fs.existsSync(scriptsDir)) {
    console.error(`Missing scripts directory: ${scriptsDir}`);
    process.exit(1);
  }
  if (!fs.existsSync(qaPath)) {
    console.error(`Missing QA log: ${qaPath}`);
    process.exit(1);
  }

  const scriptFiles = fs
    .readdirSync(scriptsDir)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const qa = JSON.parse(fs.readFileSync(qaPath, "utf8"));
  const failures = [];

  if (scriptFiles.length < args.minTotal) {
    failures.push(`script count below minimum: ${scriptFiles.length} < ${args.minTotal}`);
  }
  if (!qa.summary || qa.summary.total !== scriptFiles.length) {
    failures.push("qa total does not match script file count");
  }
  if (!qa.summary || qa.summary.fail > 0) {
    failures.push("qa summary has failures");
  }

  scriptFiles.forEach((file) => {
    const fullPath = path.join(scriptsDir, file);
    const script = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    const where = `(${file})`;

    if (!script.meta || !script.meta.format) failures.push(`missing meta.format ${where}`);
    if (!script.meta || !["safe", "spicy", "edge"].includes(script.meta.controversy_tier)) {
      failures.push(`missing/invalid meta.controversy_tier ${where}`);
    }
    if (!script.meta || !["low", "medium", "high"].includes(script.meta.spice_tier)) {
      failures.push(`missing/invalid meta.spice_tier ${where}`);
    }
    if (!script.meta || !script.meta.audio_track) failures.push(`missing meta.audio_track ${where}`);
    if (!script.meta || !Array.isArray(script.meta.in_between_assets) || script.meta.in_between_assets.length === 0) {
      failures.push(`missing meta.in_between_assets ${where}`);
    }
    if (!script.meta || !script.meta.arc_type) failures.push(`missing meta.arc_type ${where}`);
    const beatPlan = script.meta && script.meta.beat_plan ? script.meta.beat_plan : script.beat_plan;
    if (!beatPlan || !beatPlan.shareable_moment) {
      failures.push(`missing beat_plan.shareable_moment ${where}`);
    }
    if (!Array.isArray(script.messages) || script.messages.length < 7) {
      failures.push(`insufficient message count ${where}`);
    }

    const audioTrack = script.meta && script.meta.audio_track;
    if (audioTrack) {
      const audioCandidates = [
        path.join(rootDir, audioTrack),
        path.join(rootDir, "remotion", "public", audioTrack)
      ];
      if (!existsAny(audioCandidates)) failures.push(`audio track file missing ${where}`);
    }

    const storyAsset = script.story && script.story.asset;
    if (storyAsset) {
      const storyCandidates = [
        path.join(rootDir, storyAsset),
        path.join(rootDir, "remotion", "public", storyAsset)
      ];
      if (!existsAny(storyCandidates)) failures.push(`story asset missing ${where}`);
    } else {
      failures.push(`missing story asset ${where}`);
    }

    if (script.hook && script.hook.asset) {
      const hookCandidates = [
        path.join(rootDir, script.hook.asset),
        path.join(rootDir, "remotion", "public", script.hook.asset)
      ];
      if (!existsAny(hookCandidates)) failures.push(`hook asset missing ${where}`);
    }

    if (script.stinger && script.stinger.after_first) {
      const stingerCandidates = [
        path.join(rootDir, script.stinger.after_first),
        path.join(rootDir, "remotion", "public", script.stinger.after_first)
      ];
      if (!existsAny(stingerCandidates)) failures.push(`stinger asset missing ${where}`);
    }

    let prevTypeAt = -Infinity;
    script.messages.forEach((message, index) => {
      if (typeof message.type_at !== "number") failures.push(`missing type_at at message ${index + 1} ${where}`);
      if (typeof message.type_at === "number" && message.type_at <= prevTypeAt) {
        failures.push(`non-monotonic type_at at message ${index + 1} ${where}`);
      }
      if (typeof message.type_at === "number") prevTypeAt = message.type_at;
      if (typeof message.text !== "string" || !message.text.trim()) {
        failures.push(`empty message text at message ${index + 1} ${where}`);
      }
    });
  });

  const report = {
    date,
    script_count: scriptFiles.length,
    qa_summary: qa.summary,
    failure_count: failures.length,
    failures
  };

  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(path.join(logsDir, "reliability-check.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (failures.length > 0) {
    console.error("reliability-check failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log("reliability-check passed");
}

if (require.main === module) {
  run();
}
