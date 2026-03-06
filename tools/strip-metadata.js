const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { dateStamp } = require("./lib/utils");

function parseArgs(argv) {
  const args = { date: null, dir: null, includeRoot: false, light: false };
  argv.forEach((arg) => {
    if (arg.startsWith("--date=")) args.date = arg.split("=")[1];
    if (arg.startsWith("--dir=")) args.dir = arg.split("=")[1];
    if (arg === "--include-root") args.includeRoot = true;
    if (arg === "--light") args.light = true;
  });
  return args;
}

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch (error) {
    return false;
  }
}

let cachedMp4box = null;
function hasMp4box() {
  if (cachedMp4box !== null) return cachedMp4box;
  try {
    execFileSync("mp4box", ["-version"], { stdio: "ignore" });
    cachedMp4box = true;
    return cachedMp4box;
  } catch (error) {
    cachedMp4box = false;
    return cachedMp4box;
  }
}

function remuxWithMp4box(filePath) {
  const ext = path.extname(filePath) || ".mp4";
  const base = filePath.slice(0, -ext.length);
  const tmpPath = `${base}.mp4box${ext}`;
  try {
    execFileSync(
      "mp4box",
      ["-add", filePath, "-new", tmpPath],
      { stdio: "ignore" }
    );
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch (error) {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    console.warn(`MP4Box remux failed: ${path.basename(filePath)}`);
    return false;
  }
}

function listMp4s(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((file) => file.toLowerCase().endsWith(".mp4"))
    .map((file) => path.join(dirPath, file));
}

// Encoding variation to avoid identical fingerprints
function getRandomCrf() {
  const base = 23;
  const variation = Math.floor(Math.random() * 5) - 2; // -2 to +2 (CRF 21-25)
  return base + variation;
}

function getRandomAudioBitrate() {
  const bitrates = ["96k", "112k", "128k", "144k", "160k"];
  return bitrates[Math.floor(Math.random() * bitrates.length)];
}

function getRandomPreset() {
  // Vary encoding speed/quality tradeoff - creates different compression patterns
  const presets = ["fast", "medium", "medium", "slow"]; // weight toward medium
  return presets[Math.floor(Math.random() * presets.length)];
}

// Subtle resolution variation: slight crop then scale back to target
// Creates different encoding patterns without changing final dimensions
function getResolutionFilter(targetWidth, targetHeight) {
  // Random crop of 0-4 pixels from edges, then scale back
  const cropPixels = Math.floor(Math.random() * 5); // 0-4
  if (cropPixels === 0) {
    return null; // No crop this time
  }
  // Crop then scale back to original size
  const cropW = targetWidth - cropPixels * 2;
  const cropH = targetHeight - cropPixels * 2;
  return `crop=${cropW}:${cropH},scale=${targetWidth}:${targetHeight}:flags=lanczos`;
}

// Light strip: fast, stream copy, removes obvious metadata
function stripFileLight(filePath) {
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
    return true;
  } catch (error) {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    console.warn(`Light metadata strip failed: ${path.basename(filePath)}`);
    return false;
  }
}

// Full strip: two-pass approach
// Pass 1: re-encode to remove original fingerprints, add variation
// Pass 2: copy to strip encoder tags FFmpeg adds during re-encoding
function stripFile(filePath) {
  const ext = path.extname(filePath) || ".mp4";
  const base = filePath.slice(0, -ext.length);
  const tmpPath1 = `${base}.pass1${ext}`;
  const tmpPath2 = `${base}.pass2${ext}`;

  // Randomize encoding parameters
  const crf = getRandomCrf();
  const audioBitrate = getRandomAudioBitrate();
  const preset = getRandomPreset();
  const resFilter = getResolutionFilter(1080, 1920);

  // Build video filter chain
  const vfParts = [];
  if (resFilter) {
    vfParts.push(resFilter);
  }
  vfParts.push("setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709");
  const vfArg = vfParts.join(",");

  try {
    // Pass 1: Re-encode with randomized settings
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        filePath,
        // Strip all metadata
        "-map_metadata",
        "-1",
        "-map_metadata:s:v",
        "-1",
        "-map_metadata:s:a",
        "-1",
        "-map_metadata:s:s",
        "-1",
        // Re-encode video with variation
        "-c:v",
        "libx264",
        "-preset",
        preset,
        "-crf",
        String(crf),
        "-profile:v",
        "high",
        "-level",
        "4.0",
        "-pix_fmt",
        "yuv420p",
        // Re-encode audio with variation
        "-c:a",
        "aac",
        "-b:a",
        audioBitrate,
        // Video filter (resolution variation + color)
        "-vf",
        vfArg,
        "-movflags",
        "+faststart",
        "-tag:v",
        "avc1",
        tmpPath1
      ],
      { stdio: "ignore" }
    );

    // Pass 2: Copy to strip encoder tags that FFmpeg added
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-fflags",
        "+bitexact",
        "-i",
        tmpPath1,
        "-map_metadata",
        "-1",
        "-map_metadata:s:v",
        "-1",
        "-map_metadata:s:a",
        "-1",
        "-c",
        "copy",
        "-flags:v",
        "+bitexact",
        "-flags:a",
        "+bitexact",
        "-movflags",
        "+faststart",
        // Clear encoder strings
        "-metadata",
        "encoder=",
        "-metadata:s:v",
        "encoder=",
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
        tmpPath2
      ],
      { stdio: "ignore" }
    );

    fs.unlinkSync(tmpPath1);
    fs.renameSync(tmpPath2, filePath);
    if (hasMp4box()) {
      remuxWithMp4box(filePath);
    }
    return true;
  } catch (error) {
    if (fs.existsSync(tmpPath1)) fs.unlinkSync(tmpPath1);
    if (fs.existsSync(tmpPath2)) fs.unlinkSync(tmpPath2);
    console.warn(`Metadata strip failed: ${path.basename(filePath)}`);
    return false;
  }
}

function run() {
  const rootDir = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  if (!hasFfmpeg()) {
    console.error("ffmpeg not found. Metadata stripping is required.");
    process.exit(1);
  }

  const date = dateStamp(args.date);
  const targetDir = args.dir ? path.resolve(rootDir, args.dir) : path.join(rootDir, "renders", date);

  const files = listMp4s(targetDir);
  if (args.includeRoot) {
    files.push(...listMp4s(rootDir));
  }

  if (files.length === 0) {
    console.log(`No mp4 files found to strip in ${targetDir}.`);
    return;
  }

  const stripFn = args.light ? stripFileLight : stripFile;
  const mode = args.light ? "light" : "full";

  let ok = 0;
  let failed = 0;
  files.forEach((file) => {
    if (stripFn(file)) ok += 1;
    else failed += 1;
  });

  console.log(`Metadata strip (${mode}) complete: ${ok} ok, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  run();
}

module.exports = { run };
