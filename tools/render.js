const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { dateStamp, ensureDir, createRng, loadConfig } = require("./lib/utils");

const MEDIA_EXTENSIONS = /\.(gif|mp4|mov|m4v|webm)$/i;
const MEDIA_VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|webm)$/i;
const MEDIA_GIF_EXTENSIONS = /\.gif$/i;
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|svg)$/i;
const AUDIO_EXTENSIONS = /\.(mp3|wav|m4a|aac)$/i;
const IN_BETWEEN_FOLDERS = ["In between messages", "In between"];
const AFTER_FIRST_FOLDERS = ["After 1 message"];
const BANNED_STINGER_NAMES = new Set(["Basketball Shooting GIF.gif"]);
const STORY_ASSETS_DIR = "baddies";
const PLAN_B_HINTS = ["dm", "slide", "shoot", "ready", "lets go", "flirt"];
const WIN_HINTS = ["yes", "excited", "smile", "dancing", "ready", "go"];
let ffmpegAvailable;

function matchesHint(name, hints) {
  const lower = name.toLowerCase();
  return hints.some((hint) => lower.includes(hint));
}

function partitionStingers(assets) {
  const planB = [];
  const win = [];
  const fallback = [];
  assets.forEach((asset) => {
    const base = path.basename(asset);
    if (matchesHint(base, PLAN_B_HINTS)) {
      planB.push(asset);
      return;
    }
    if (matchesHint(base, WIN_HINTS)) {
      win.push(asset);
      return;
    }
    fallback.push(asset);
  });
  return { planB, win, fallback };
}

function parseArgs(argv) {
  const args = {
    date: null,
    placeholder: false,
    count: null,
    onlyPass: false,
    concurrency: null,
    qaPath: null,
    fileList: null
  };
  argv.forEach((arg) => {
    if (arg.startsWith("--date=")) args.date = arg.split("=")[1];
    if (arg.startsWith("--count=")) args.count = Number(arg.split("=")[1]);
    if (arg.startsWith("--concurrency=")) args.concurrency = Number(arg.split("=")[1]);
    if (arg.startsWith("--qa-path=")) args.qaPath = arg.split("=")[1];
    if (arg.startsWith("--file-list=")) args.fileList = arg.split("=")[1];
    if (arg === "--only-pass") args.onlyPass = true;
    if (arg === "--placeholder") args.placeholder = true;
  });
  return args;
}

function listScriptFiles(scriptsDir, count, onlyPass, qaPath, fileListPath) {
  if (fileListPath) {
    if (!fs.existsSync(fileListPath)) {
      throw new Error(`Missing file list: ${fileListPath}`);
    }
    const payload = JSON.parse(fs.readFileSync(fileListPath, "utf8"));
    const files = Array.isArray(payload && payload.files)
      ? payload.files.filter((file) => typeof file === "string" && file.endsWith(".json"))
      : [];
    return Number.isFinite(count) ? files.slice(0, Math.max(0, count)) : files;
  }

  let files = fs
    .readdirSync(scriptsDir)
    .filter((file) => file.endsWith(".json"))
    .sort();
  if (onlyPass) {
    if (!qaPath || !fs.existsSync(qaPath)) {
      throw new Error(`Missing QA log for --only-pass: ${qaPath}`);
    }
    const qa = JSON.parse(fs.readFileSync(qaPath, "utf8"));
    const passing = new Set(
      (qa.results || []).filter((row) => row.pass).map((row) => row.file)
    );
    files = files.filter((file) => passing.has(file));
  }
  if (Number.isFinite(count)) {
    return files.slice(0, Math.max(0, count));
  }
  return files;
}

function listMediaFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const files = fs
    .readdirSync(dirPath)
    .filter((file) => MEDIA_EXTENSIONS.test(file))
    .sort((a, b) => a.localeCompare(b));
  const videos = files.filter((file) => MEDIA_VIDEO_EXTENSIONS.test(file));
  if (videos.length) return videos;
  return files.filter((file) => MEDIA_GIF_EXTENSIONS.test(file));
}

function listAllMediaFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((file) => MEDIA_EXTENSIONS.test(file))
    .sort((a, b) => a.localeCompare(b));
}

function listImageFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((file) => IMAGE_EXTENSIONS.test(file))
    .sort((a, b) => a.localeCompare(b));
}

function listAudioFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((file) => AUDIO_EXTENSIONS.test(file))
    .sort((a, b) => a.localeCompare(b));
}

function shuffleWithRng(items, rng) {
  const output = [...items];
  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

function getCycleChunk(items, startIndex, count) {
  if (!items.length || count <= 0) return [];
  const chunk = [];
  for (let i = 0; i < count; i += 1) {
    chunk.push(items[(startIndex + i) % items.length]);
  }
  return chunk;
}

function syncStoryAssets(rootDir) {
  const sourceDir = path.join(rootDir, STORY_ASSETS_DIR);
  if (!fs.existsSync(sourceDir)) return;
  const destDir = path.join(rootDir, "remotion", "public", STORY_ASSETS_DIR);
  ensureDir(destDir);
  const files = listImageFiles(sourceDir);
  files.forEach((file) => {
    const src = path.join(sourceDir, file);
    const dest = path.join(destDir, file);
    let shouldCopy = true;
    if (fs.existsSync(dest)) {
      try {
        const srcStat = fs.statSync(src);
        const destStat = fs.statSync(dest);
        shouldCopy = srcStat.size !== destStat.size;
      } catch (error) {
        shouldCopy = true;
      }
    }
    if (shouldCopy) {
      fs.copyFileSync(src, dest);
    }
  });
}

function resolveMediaAssets(rootDir, folderName) {
  const publicDir = path.join(rootDir, "remotion", "public", folderName);
  const candidates = [
    path.join(os.homedir(), "Downloads", folderName),
    path.join(rootDir, folderName),
    publicDir
  ];
  let sourceDir = null;
  let sourceFiles = [];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      if (!fs.statSync(candidate).isDirectory()) continue;
    } catch (error) {
      continue;
    }
    const files = listAllMediaFiles(candidate);
    if (files.length) {
      sourceDir = candidate;
      sourceFiles = files;
      break;
    }
  }
  if (!sourceDir) return [];

  if (sourceDir !== publicDir) {
    ensureDir(publicDir);
    sourceFiles.forEach((file) => {
      const src = path.join(sourceDir, file);
      const dest = path.join(publicDir, file);
      let shouldCopy = true;
      if (fs.existsSync(dest)) {
        try {
          const srcStat = fs.statSync(src);
          const destStat = fs.statSync(dest);
          shouldCopy = srcStat.size !== destStat.size;
        } catch (error) {
          shouldCopy = true;
        }
      }
      if (shouldCopy) {
        fs.copyFileSync(src, dest);
      }
    });
    const sourceBases = new Set(
      sourceFiles.map((file) => path.basename(file, path.extname(file)))
    );
    const publicFiles = listAllMediaFiles(publicDir);
    publicFiles.forEach((file) => {
      const base = path.basename(file, path.extname(file));
      if (!sourceBases.has(base)) {
        fs.unlinkSync(path.join(publicDir, file));
      }
    });
  }

  return listMediaFiles(publicDir).map((file) => path.join(folderName, file));
}

function resolveAudioAssets(rootDir, folderName = "Songs") {
  const publicDir = path.join(rootDir, "remotion", "public", folderName);
  const candidates = [
    path.join(os.homedir(), "Downloads", folderName),
    path.join(rootDir, folderName),
    publicDir
  ];
  let sourceDir = null;
  let sourceFiles = [];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      if (!fs.statSync(candidate).isDirectory()) continue;
    } catch (error) {
      continue;
    }
    const files = listAudioFiles(candidate);
    if (files.length) {
      sourceDir = candidate;
      sourceFiles = files;
      break;
    }
  }
  if (!sourceDir) return [];

  if (sourceDir !== publicDir) {
    ensureDir(publicDir);
    sourceFiles.forEach((file) => {
      const src = path.join(sourceDir, file);
      const dest = path.join(publicDir, file);
      let shouldCopy = true;
      if (fs.existsSync(dest)) {
        try {
          const srcStat = fs.statSync(src);
          const destStat = fs.statSync(dest);
          shouldCopy = srcStat.size !== destStat.size;
        } catch (error) {
          shouldCopy = true;
        }
      }
      if (shouldCopy) {
        fs.copyFileSync(src, dest);
      }
    });
  }

  return listAudioFiles(publicDir).map((file) => path.join(folderName, file));
}

function renderPlaceholder({ scriptsDir, rendersDir, count, onlyPass, qaPath, fileList }) {
  const files = listScriptFiles(scriptsDir, count, onlyPass, qaPath, fileList);
  for (const file of files) {
    const base = file.replace(/\.json$/, "");
    const outPath = path.join(rendersDir, `${base}.mp4`);
    const content = `placeholder render for ${base}\n`;
    fs.writeFileSync(outPath, content, "utf8");
  }
}

function findRemotionBin(rootDir) {
  const candidates = [
    path.join(rootDir, "node_modules", ".bin", "remotion"),
    path.join(rootDir, "remotion", "node_modules", ".bin", "remotion")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function hasFfmpeg() {
  if (typeof ffmpegAvailable === "boolean") return ffmpegAvailable;
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    ffmpegAvailable = true;
  } catch (error) {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

function clearRemotionMacQuarantine(rootDir) {
  if (process.platform !== "darwin") return;
  const compositorDir = path.join(
    rootDir,
    "remotion",
    "node_modules",
    "@remotion",
    "compositor-darwin-arm64"
  );
  if (!fs.existsSync(compositorDir)) return;
  try {
    execFileSync("xattr", ["-dr", "com.apple.quarantine", compositorDir], { stdio: "ignore" });
  } catch (error) {
    // Best-effort only: render can still succeed if files were already trusted.
  }
}

function stripVideoMetadata(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  if (!hasFfmpeg()) {
    throw new Error("ffmpeg not found. Metadata stripping is required.");
  }
  const ext = path.extname(filePath) || ".mp4";
  const base = filePath.slice(0, -ext.length);
  const tmpPath = `${base}.nometa${ext}`;
  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-fflags",
        "+bitexact",
        "-i",
        filePath,
        "-map_metadata",
        "-1",
        "-map_metadata:s:v",
        "-1",
        "-map_metadata:s:a",
        "-1",
        "-map_metadata:s:s",
        "-1",
        "-metadata",
        "encoder=",
        "-metadata",
        "creation_time=",
        "-metadata:s:v",
        "handler_name=",
        "-metadata:s:v:0",
        "handler_name=",
        "-metadata:s:a",
        "handler_name=",
        "-metadata:s:a:0",
        "handler_name=",
        "-metadata:g",
        "encoder=",
        "-c",
        "copy",
        "-flags:v",
        "+bitexact",
        "-flags:a",
        "+bitexact",
        "-movflags",
        "+faststart",
        tmpPath
      ],
      { stdio: "ignore" }
    );
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    console.warn(`Metadata strip failed for ${path.basename(filePath)}.`);
  }
}

function renderWithRemotion({
  rootDir,
  scriptsDir,
  rendersDir,
  remotionBin,
  count,
  onlyPass,
  qaPath,
  fileList
}) {
  const config = loadConfig(rootDir);
  const remotionDir = path.join(rootDir, "remotion");
  const entry = path.join(remotionDir, "src", "index.tsx");
  if (!fs.existsSync(entry)) {
    console.error(`Missing Remotion entry: ${entry}`);
    process.exit(1);
  }
  if (!hasFfmpeg()) {
    console.error("ffmpeg not found. Metadata stripping is required.");
    process.exit(1);
  }
  clearRemotionMacQuarantine(rootDir);

  const files = listScriptFiles(scriptsDir, count, onlyPass, qaPath, fileList);
  const results = [];
  const inBetweenAssets = IN_BETWEEN_FOLDERS.reduce((acc, folder) => {
    if (acc.length > 0) return acc;
    return resolveMediaAssets(rootDir, folder);
  }, []);
  const stingerAssets = AFTER_FIRST_FOLDERS.flatMap((folder) =>
    resolveMediaAssets(rootDir, folder)
  ).filter((asset) => !BANNED_STINGER_NAMES.has(path.basename(asset)));
  const stingerPool = stingerAssets.length
    ? shuffleWithRng(stingerAssets, createRng(`${Date.now()}-stinger`))
    : stingerAssets;
  const { planB, win, fallback } = partitionStingers(stingerPool);
  const planBCycle = planB.length ? planB : fallback;
  const winCycle = win.length ? win : fallback;
  const inBetweenCycle = inBetweenAssets.length
    ? shuffleWithRng(inBetweenAssets, createRng(`${Date.now()}-between`))
    : inBetweenAssets;
  const inBetweenChunkSize = Math.min(3, inBetweenCycle.length || 0);
  const discoveredAudioTracks = resolveAudioAssets(rootDir, "Songs");
  const configuredAudioTracks = Array.isArray(config.audio_tracks)
    ? config.audio_tracks
        .filter((name) => typeof name === "string" && name.trim())
        .map((name) => (name.startsWith("Songs/") ? name : path.join("Songs", name)))
    : [];
  const availableAudioTrackSet = new Set(discoveredAudioTracks);
  const selectedAudioTracks =
    configuredAudioTracks.length > 0
      ? configuredAudioTracks.filter((track) => availableAudioTrackSet.has(track))
      : discoveredAudioTracks;
  const audioCycle = selectedAudioTracks.length
    ? shuffleWithRng(selectedAudioTracks, createRng(`${Date.now()}-audio`))
    : [];

  syncStoryAssets(rootDir);

  // Conservative default to avoid ffprobe/chrome SIGKILL crashes on memory-constrained machines.
  const configuredConcurrency =
    Number(config && config.render && config.render.remotion_concurrency);
  const autoConcurrency = os.totalmem() <= 12 * 1024 * 1024 * 1024 ? 1 : 2;
  const remotionConcurrency = Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
    ? Math.max(1, Math.floor(configuredConcurrency))
    : autoConcurrency;

  files.forEach((file, index) => {
    const base = file.replace(/\.json$/, "");
    const outPath = path.join(rendersDir, `${base}.mp4`);
    const scriptPath = path.join(scriptsDir, file);
    const script = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
    const timingSeed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const planBAsset =
      planBCycle.length > 0 ? planBCycle[index % planBCycle.length] : null;
    const winAsset =
      winCycle.length > 0 ? winCycle[index % winCycle.length] : planBAsset;
    const stingerForScript =
      planBAsset ? [planBAsset, winAsset].filter(Boolean) : [];
    const inBetweenForScript =
      inBetweenChunkSize > 0
        ? getCycleChunk(inBetweenCycle, index * inBetweenChunkSize, inBetweenChunkSize)
        : inBetweenCycle;
    const scriptWithSeed = {
      ...script,
      meta: {
        ...(script.meta || {}),
        timing_seed: timingSeed,
        ...(audioCycle.length > 0
          ? { audio_track: script.meta && script.meta.audio_track ? script.meta.audio_track : audioCycle[index % audioCycle.length] }
          : {}),
        in_between_assets: inBetweenForScript,
        stinger_assets: stingerForScript
      }
    };
    const props = JSON.stringify({ script: scriptWithSeed });

    try {
      execFileSync(
        remotionBin,
        [
          "render",
          entry,
          "StoryReply",
          outPath,
          "--props",
          props,
          "--overwrite",
          "--timeout=120000",
          `--concurrency=${remotionConcurrency}`
        ],
        { stdio: "inherit", cwd: remotionDir }
      );
      stripVideoMetadata(outPath);
      results.push({ file, pass: true });
    } catch (error) {
      console.error(`Render failed for ${file}`);
      results.push({ file, pass: false });
    }
  });

  const failed = results.filter((result) => !result.pass).length;
  if (failed > 0) {
    console.error(`Render complete with failures: ${failed} failed`);
    process.exit(1);
  }
}

function run() {
  const rootDir = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const date = dateStamp(args.date);
  const scriptsDir = path.join(rootDir, "scripts", date);
  const rendersDir = path.join(rootDir, "renders", date);
  const qaPath = args.qaPath || path.join(rootDir, "logs", date, "qa.json");

  if (!fs.existsSync(scriptsDir)) {
    console.error(`Missing scripts directory: ${scriptsDir}`);
    process.exit(1);
  }

  ensureDir(rendersDir);

  const remotionBin = findRemotionBin(rootDir);

  if (!remotionBin) {
    if (args.placeholder) {
      renderPlaceholder({
        scriptsDir,
        rendersDir,
        count: args.count,
        onlyPass: args.onlyPass,
        qaPath,
        fileList: args.fileList
      });
      console.log("Remotion not found. Created placeholder mp4s.");
      return;
    }
    console.error("Remotion not found. Run `npm run setup` to install it.");
    process.exit(1);
  }

  renderWithRemotion({
    rootDir,
    scriptsDir,
    rendersDir,
    remotionBin,
    count: args.count,
    onlyPass: args.onlyPass,
    qaPath,
    fileList: args.fileList
  });
}

if (require.main === module) {
  run();
}

module.exports = { run };
