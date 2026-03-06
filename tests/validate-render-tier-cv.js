const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function parseArgs(argv) {
  const args = {
    date: null,
    minTotal: 20,
    sampleStep: 1.0
  };
  argv.forEach((arg) => {
    if (arg.startsWith("--date=")) args.date = arg.split("=")[1];
    if (arg.startsWith("--min-total=")) args.minTotal = Number(arg.split("=")[1]);
    if (arg.startsWith("--sample-step=")) args.sampleStep = Number(arg.split("=")[1]);
    if (arg.startsWith("--sample-every=")) args.sampleStep = Number(arg.split("=")[1]);
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

function runTool(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.encoding || "utf8",
    maxBuffer: options.maxBuffer || 32 * 1024 * 1024
  });
  if (result.status !== 0) {
    const stderr = (result.stderr || "").toString().trim();
    throw new Error(`${command} failed: ${stderr || `exit ${result.status}`}`);
  }
  return result.stdout;
}

function probeDuration(videoPath) {
  const raw = runTool("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    videoPath
  ]);
  const value = Number(String(raw).trim());
  return Number.isFinite(value) ? value : 0;
}

function extractFrameRgb(videoPath, second, size = 96) {
  const args = [
    "-v",
    "error",
    "-ss",
    String(second),
    "-i",
    videoPath,
    "-vframes",
    "1",
    "-vf",
    `scale=${size}:${size}:flags=bilinear,format=rgb24`,
    "-f",
    "rawvideo",
    "-"
  ];
  const result = spawnSync("ffmpeg", args, {
    encoding: null,
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8")
      : String(result.stderr || "");
    throw new Error(`ffmpeg frame extraction failed: ${stderr.trim()}`);
  }
  return result.stdout;
}

function frameFeatures(buffer) {
  const pixels = Math.floor(buffer.length / 3);
  if (pixels <= 0) {
    return {
      blue_ratio: 0,
      dark_ratio: 0,
      white_ratio: 0,
      light_ratio: 0
    };
  }
  let blue = 0;
  let dark = 0;
  let white = 0;
  let light = 0;

  for (let i = 0; i < pixels; i += 1) {
    const r = buffer[i * 3];
    const g = buffer[i * 3 + 1];
    const b = buffer[i * 3 + 2];
    if (b > 120 && g > 60 && r < 100 && b > g + 15) blue += 1;
    if (r < 25 && g < 25 && b < 25) dark += 1;
    if (r > 190 && g > 190 && b > 190) white += 1;
    if (r > 150 && g > 150 && b > 150) light += 1;
  }

  return {
    blue_ratio: blue / pixels,
    dark_ratio: dark / pixels,
    white_ratio: white / pixels,
    light_ratio: light / pixels
  };
}

function isChatLike(features) {
  return features.blue_ratio >= 0.008 && features.dark_ratio >= 0.7;
}

function isClipLike(features) {
  if (isChatLike(features)) return false;
  return (
    features.dark_ratio < 0.88 ||
    features.blue_ratio < 0.012 ||
    features.light_ratio > 0.008 ||
    features.white_ratio > 0.0015
  );
}

function isOverlayLike(features) {
  // Overlays are often thin text; treat low white/light coverage as valid signal.
  return (
    features.white_ratio >= 0.0012 ||
    (features.white_ratio >= 0.0008 && features.light_ratio >= 0.006) ||
    features.light_ratio >= 0.012
  );
}

function buildSampleTimes(duration, step, minStart = 0, maxSamples = 240) {
  const output = [];
  const safeStep = Math.max(0.25, step);
  for (let t = minStart; t <= duration; t += safeStep) {
    output.push(Number(t.toFixed(2)));
    if (output.length >= maxSamples) break;
  }
  return output;
}

function classifySegments(samples, sampleStep) {
  const segments = [];
  let current = null;
  samples.forEach((row) => {
    if (!row.clip_like) {
      if (current) {
        segments.push(current);
        current = null;
      }
      return;
    }
    if (!current) {
      current = {
        start_s: row.t,
        end_s: row.t,
        sample_count: 1,
        overlay_hits: row.overlay_like ? 1 : 0
      };
      return;
    }
    current.end_s = row.t;
    current.sample_count += 1;
    if (row.overlay_like) current.overlay_hits += 1;
  });
  if (current) segments.push(current);
  return segments.map((segment) => ({
    ...segment,
    // Use sample window duration so single-sample clips survive coarse sampling.
    duration_s: Number((segment.sample_count * sampleStep).toFixed(2)),
    overlay_ratio: segment.sample_count > 0 ? segment.overlay_hits / segment.sample_count : 0
  }));
}

function evaluateVideo(videoPath, duration, sampleStep) {
  const hookTimesRaw = [0.2, 1.0, 2.0, 3.0];
  const hookTimes = hookTimesRaw.filter((t) => t <= duration);
  const hookFrames = hookTimes.map((t) => {
    const features = frameFeatures(extractFrameRgb(videoPath, t));
    return { t, ...features, chat_like: isChatLike(features) };
  });
  const firstHook = hookFrames[0] || null;
  const hookVisible = hookFrames.some((row) => row.chat_like);
  const possibleTitleCard =
    firstHook &&
    !firstHook.chat_like &&
    firstHook.light_ratio > 0.06 &&
    firstHook.blue_ratio < 0.004;
  let gate1 = "PASS";
  if (!hookVisible || possibleTitleCard) gate1 = "FAIL";
  else if (!firstHook || firstHook.blue_ratio < 0.006) gate1 = "WARN";

  const timelineTimes = buildSampleTimes(duration, sampleStep, 3.0, 220);
  const timelineRows = timelineTimes.map((t) => {
    const features = frameFeatures(extractFrameRgb(videoPath, t));
    return {
      t,
      ...features,
      chat_like: isChatLike(features),
      clip_like: isClipLike(features),
      overlay_like: isOverlayLike(features)
    };
  });
  const clipSegments = classifySegments(timelineRows, Math.max(0.25, sampleStep)).filter(
    (segment) => segment.duration_s >= 0.8
  );

  let gate9 = "PASS";
  if (clipSegments.length === 0) gate9 = "FAIL";
  else if (clipSegments.length > 6) gate9 = "WARN";

  const overlayCoverage =
    clipSegments.length > 0
      ? clipSegments.filter((segment) => segment.overlay_ratio >= 0.25).length / clipSegments.length
      : 0;
  let gate18 = "PASS";
  if (clipSegments.length === 0) gate18 = "WARN";
  else if (overlayCoverage < 0.25) gate18 = "FAIL";
  else if (overlayCoverage < 0.5) gate18 = "WARN";

  const chatRows = timelineRows.filter((row) => row.chat_like);
  const leakRatio =
    chatRows.length > 0
      ? chatRows.filter((row) => row.white_ratio > 0.015 && row.light_ratio > 0.03).length / chatRows.length
      : 0;
  let gate21 = "PASS";
  if (chatRows.length === 0) gate21 = "WARN";
  else if (leakRatio > 0.15) gate21 = "FAIL";
  else if (leakRatio > 0.05) gate21 = "WARN";

  return {
    duration_s: Number(duration.toFixed(2)),
    gate1_hook_visibility: gate1,
    gate9_clip_cadence: gate9,
    gate18_clip_overlay: gate18,
    gate21_visual_structure: gate21,
    diagnostics: {
      hook_samples: hookFrames,
      clip_segment_count: clipSegments.length,
      clip_segments: clipSegments,
      overlay_coverage: Number(overlayCoverage.toFixed(3)),
      chat_frame_count: chatRows.length,
      chat_leak_ratio: Number(leakRatio.toFixed(3))
    }
  };
}

function aggregateGate(rows, key) {
  let fail = 0;
  let warn = 0;
  let pass = 0;
  rows.forEach((row) => {
    const status = row[key];
    if (status === "FAIL") fail += 1;
    else if (status === "WARN") warn += 1;
    else pass += 1;
  });
  let status = "PASS";
  if (fail > 0) status = "FAIL";
  else if (warn > 0) status = "WARN";
  return { status, fail_count: fail, warn_count: warn, pass_count: pass };
}

function run() {
  const rootDir = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const date = dateStamp(args.date);
  const rendersDir = path.join(rootDir, "renders", date);
  const logsDir = path.join(rootDir, "logs", date);

  if (!fs.existsSync(rendersDir)) {
    console.error(`Missing renders directory: ${rendersDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(rendersDir)
    .filter((file) => /^video-\d+\.mp4$/i.test(file))
    .sort();
  if (files.length < args.minTotal) {
    console.error(`Render batch too small: ${files.length} < ${args.minTotal}`);
    process.exit(1);
  }

  const results = [];
  files.forEach((file) => {
    const videoPath = path.join(rendersDir, file);
    const duration = probeDuration(videoPath);
    const evaluation = evaluateVideo(videoPath, duration, args.sampleStep);
    results.push({ file, ...evaluation });
  });

  const gate1 = aggregateGate(results, "gate1_hook_visibility");
  const gate9 = aggregateGate(results, "gate9_clip_cadence");
  const gate18 = aggregateGate(results, "gate18_clip_overlay");
  const gate21 = aggregateGate(results, "gate21_visual_structure");
  const failureCount = [gate1, gate9, gate18, gate21].filter((gate) => gate.status === "FAIL").length;
  const warnCount = [gate1, gate9, gate18, gate21].filter((gate) => gate.status === "WARN").length;

  const report = {
    date,
    total_renders: files.length,
    sample_step_s: args.sampleStep,
    gate_results: {
      "1_hook_visibility": gate1,
      "9_clip_cadence": gate9,
      "18_clip_overlay": gate18,
      "21_visual_structure": gate21
    },
    failure_count: failureCount,
    warn_count: warnCount,
    per_video: results
  };

  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(
    path.join(logsDir, "validate-render-tier-cv.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(logsDir, "validate-render-tier-cv.txt"),
    [
      `date: ${date}`,
      `renders: ${files.length}`,
      `gate 1_hook_visibility: ${gate1.status} (fail=${gate1.fail_count}, warn=${gate1.warn_count})`,
      `gate 9_clip_cadence: ${gate9.status} (fail=${gate9.fail_count}, warn=${gate9.warn_count})`,
      `gate 18_clip_overlay: ${gate18.status} (fail=${gate18.fail_count}, warn=${gate18.warn_count})`,
      `gate 21_visual_structure: ${gate21.status} (fail=${gate21.fail_count}, warn=${gate21.warn_count})`,
      `failure_count: ${failureCount}`,
      `warn_count: ${warnCount}`
    ].join("\n") + "\n",
    "utf8"
  );

  if (failureCount > 0) {
    console.error("validate-render-tier-cv failed");
    process.exit(1);
  }
  console.log("validate-render-tier-cv passed");
}

if (require.main === module) {
  run();
}
