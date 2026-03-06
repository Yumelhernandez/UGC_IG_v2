const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const HOOK_EXTENSIONS = /\.(gif|mp4|mov|m4v|webm)$/i;
const MEDIA_FOLDERS = ["Hooks", "After 1 message", "In between messages", "In between"];

function getFolderPaths(folderName) {
  const publicDir = path.join(process.cwd(), "remotion", "public", folderName);
  const candidates = [
    path.join(os.homedir(), "Downloads", folderName),
    path.join(process.cwd(), folderName),
    publicDir
  ];
  return { publicDir, candidates };
}

function syncMediaDir(folderName) {
  const { publicDir, candidates } = getFolderPaths(folderName);
  let sourceDir = null;
  let files = [];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      if (!fs.statSync(candidate).isDirectory()) continue;
    } catch (error) {
      continue;
    }
    const candidateFiles = fs
      .readdirSync(candidate)
      .filter((file) => HOOK_EXTENSIONS.test(file))
      .sort((a, b) => a.localeCompare(b));
    if (candidateFiles.length) {
      sourceDir = candidate;
      files = candidateFiles;
      break;
    }
  }
  if (!sourceDir) {
    console.warn(`Media directory "${folderName}" not found in ${candidates.join(", ")}`);
    return false;
  }
  if (sourceDir === publicDir) return true;

  fs.mkdirSync(publicDir, { recursive: true });
  files.forEach((file) => {
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
    files.map((file) => path.basename(file, path.extname(file)))
  );
  const publicFiles = fs
    .readdirSync(publicDir)
    .filter((file) => HOOK_EXTENSIONS.test(file));
  publicFiles.forEach((file) => {
    const base = path.basename(file, path.extname(file));
    if (!sourceBases.has(base)) {
      fs.unlinkSync(path.join(publicDir, file));
    }
  });
  return true;
}

function checkFfmpeg() {
  const result = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (result.status !== 0) {
    console.warn("ffmpeg not found. Skipping hook conversion.");
    return false;
  }
  return true;
}

function listGifs(dirPath) {
  return fs
    .readdirSync(dirPath)
    .filter((file) => /\.gif$/i.test(file))
    .sort((a, b) => a.localeCompare(b));
}

function convertGifToMp4(dirPath, filename) {
  const src = path.join(dirPath, filename);
  const base = path.basename(filename, path.extname(filename));
  const dest = path.join(dirPath, `${base}.mp4`);
  if (fs.existsSync(dest)) {
    try {
      const srcStat = fs.statSync(src);
      const destStat = fs.statSync(dest);
      if (destStat.mtimeMs >= srcStat.mtimeMs && destStat.size > 0) {
        return true;
      }
    } catch (error) {
      // Re-convert if stats fail.
    }
  }
  const args = [
    "-y",
    "-i",
    src,
    "-vf",
    "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-movflags",
    "+faststart",
    "-pix_fmt",
    "yuv420p",
    "-map_metadata",
    "-1",
    dest
  ];
  const result = spawnSync("ffmpeg", args, { stdio: "inherit" });
  return result.status === 0;
}

function run() {
  if (!checkFfmpeg()) return;
  MEDIA_FOLDERS.forEach((folderName) => {
    if (!syncMediaDir(folderName)) return;
    const { publicDir } = getFolderPaths(folderName);
    const gifs = listGifs(publicDir);
    if (!gifs.length) {
      console.log(`No .gif files found in ${publicDir}`);
      return;
    }
    let converted = 0;
    gifs.forEach((gif) => {
      if (convertGifToMp4(publicDir, gif)) {
        converted += 1;
      }
    });
    console.log(`Converted ${converted}/${gifs.length} GIFs to MP4 in ${publicDir}`);
  });
}

if (require.main === module) {
  run();
}
