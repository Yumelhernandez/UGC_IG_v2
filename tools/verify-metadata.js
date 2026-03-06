const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { dateStamp } = require("./lib/utils");

function parseArgs(argv) {
  const args = { date: null, dir: null, includeRoot: false };
  argv.forEach((arg) => {
    if (arg.startsWith("--date=")) args.date = arg.split("=")[1];
    if (arg.startsWith("--dir=")) args.dir = arg.split("=")[1];
    if (arg === "--include-root") args.includeRoot = true;
  });
  return args;
}

function hasFfprobe() {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch (error) {
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

// Whitelist approach: only these tags are allowed
const ALLOWED_FORMAT_TAGS = new Set([
  "major_brand",
  "minor_version",
  "compatible_brands"
]);

const ALLOWED_STREAM_TAGS = new Set([
  "language",
  "handler_name",
  "vendor_id"
]);

// Tags that must be empty/blank if present
const MUST_BE_BLANK = new Set([
  "encoder",
  "handler_name",
  "creation_time",
  "comment",
  "title",
  "artist",
  "album",
  "description"
]);

const STRICT_METADATA = ["1", "true", "yes"].includes(
  String(process.env.STRICT_METADATA || "").toLowerCase()
);

const LAVF_PATTERN = /\bLavf\d/i;

const DEFAULT_HANDLER_NAMES = new Set(["VideoHandler", "SoundHandler"]);

// Patterns that indicate encoding tools
const SUSPICIOUS_PATTERNS = [
  /\bai\b/i,
  /\bsynthetic\b/i,
  /\bopenai\b/i,
  /\bremotion\b/i,
  /\bchatgpt\b/i,
  /\bgpt\b/i,
  /\bdall[- ]?e\b/i,
  /\bmidjourney\b/i,
  /\brunway\b/i,
  /\bstable\s*diffusion\b/i,
  /\bsdxl\b/i,
  /\bgenerative\b/i,
  /\bgenerator\b/i,
  /\bcomfyui\b/i,
  /\bautomatic1111\b/i,
  /\bLavc\d/i,
  /\bffmpeg\b/i,
  /\bhandbrake\b/i,
  /\bVideoHandler\b/,
  /\bSoundHandler\b/,
  /\bx264\b/i,
  /\bx265\b/i
];

function isBlankOrEmpty(value) {
  if (!value) return true;
  return String(value).trim() === "";
}

function isSuspicious(value) {
  if (!value) return false;
  const text = String(value);
  return SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(text));
}

function isDefaultHandlerName(key, value) {
  if (key !== "handler_name") return false;
  return DEFAULT_HANDLER_NAMES.has(String(value || ""));
}

function isSuspiciousTagValue(key, value) {
  if (isDefaultHandlerName(key, value)) return false;
  return isSuspicious(value);
}

function readFullMetadata(filePath) {
  const output = execFileSync(
    "ffprobe",
    [
      "-v", "error",
      "-show_format",
      "-show_streams",
      "-print_format", "json",
      filePath
    ],
    { encoding: "utf8" }
  );
  try {
    return JSON.parse(output);
  } catch (error) {
    return null;
  }
}

function verifyFile(filePath) {
  const issues = [];
  const warnings = [];
  const data = readFullMetadata(filePath);

  if (!data) {
    issues.push({ scope: "format", key: "parse", value: "ffprobe JSON parse failed" });
    return { issues, warnings };
  }

  // Check format tags
  if (data.format && data.format.tags) {
    Object.entries(data.format.tags).forEach(([key, value]) => {
      // Check if tag is allowed
      if (!ALLOWED_FORMAT_TAGS.has(key) && !MUST_BE_BLANK.has(key)) {
        issues.push({ scope: "format", key, value: `unexpected tag: ${value}` });
      }
      // Check if tag that must be blank has a value
      if (MUST_BE_BLANK.has(key) && !isBlankOrEmpty(value)) {
        // Lavf encoder is persistent in mp4 muxers; warn instead of fail
        if (key === "encoder" && LAVF_PATTERN.test(String(value || ""))) {
          warnings.push({ scope: "format", key, value: `lavf: ${value}` });
        } else {
          issues.push({ scope: "format", key, value: `must be blank: ${value}` });
        }
      }
      // Check for suspicious patterns
      if (isSuspiciousTagValue(key, value)) {
        issues.push({ scope: "format", key, value: `suspicious: ${value}` });
      }
      if (LAVF_PATTERN.test(String(value || ""))) {
        const entry = { scope: "format", key, value: `lavf: ${value}` };
        if (STRICT_METADATA) issues.push(entry);
        else warnings.push(entry);
      }
    });
  }

  // Check streams
  if (Array.isArray(data.streams)) {
    data.streams.forEach((stream, index) => {
      const streamScope = `stream:${index}`;

      // Check for ICC Profile side_data (desktop editing fingerprint)
      if (Array.isArray(stream.side_data_list)) {
        stream.side_data_list.forEach((sideData) => {
          if (sideData.side_data_type === "ICC Profile") {
            issues.push({ scope: streamScope, key: "side_data", value: "ICC Profile present" });
          }
        });
      }

      // Check stream tags
      if (stream.tags) {
        Object.entries(stream.tags).forEach(([key, value]) => {
          // Check if tag is allowed
          if (!ALLOWED_STREAM_TAGS.has(key) && !MUST_BE_BLANK.has(key)) {
            issues.push({ scope: streamScope, key, value: `unexpected tag: ${value}` });
          }
          // Check if tag that must be blank has a value
          if (MUST_BE_BLANK.has(key) && !isBlankOrEmpty(value)) {
            if (isDefaultHandlerName(key, value)) {
              warnings.push({ scope: streamScope, key, value: `default handler: ${value}` });
            } else {
              issues.push({ scope: streamScope, key, value: `must be blank: ${value}` });
            }
          }
          // Check for suspicious patterns
          if (isSuspiciousTagValue(key, value)) {
            issues.push({ scope: streamScope, key, value: `suspicious: ${value}` });
          }
          if (LAVF_PATTERN.test(String(value || ""))) {
            const entry = { scope: streamScope, key, value: `lavf: ${value}` };
            if (STRICT_METADATA) issues.push(entry);
            else warnings.push(entry);
          }
        });
      }
    });
  }

  return { issues, warnings };
}

function run() {
  const rootDir = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  if (!hasFfprobe()) {
    console.error("ffprobe not found. Metadata verification is required.");
    process.exit(1);
  }

  const date = dateStamp(args.date);
  const targetDir = args.dir ? path.resolve(rootDir, args.dir) : path.join(rootDir, "renders", date);
  const files = listMp4s(targetDir);
  if (args.includeRoot) {
    files.push(...listMp4s(rootDir));
  }

  if (files.length === 0) {
    console.log(`No mp4 files found to verify in ${targetDir}.`);
    return;
  }

  const failures = [];
  const warns = [];
  files.forEach((file) => {
    const result = verifyFile(file);
    if (result.issues.length > 0) {
      failures.push({ file, issues: result.issues });
    }
    if (result.warnings.length > 0) {
      warns.push({ file, warnings: result.warnings });
    }
  });

  if (warns.length > 0) {
    console.warn("Metadata verification warnings:");
    warns.forEach((warning) => {
      console.warn(`- ${path.basename(warning.file)}`);
      warning.warnings.forEach((issue) => {
        console.warn(`  ${issue.scope} ${issue.key}: ${issue.value}`);
      });
    });
  }

  if (failures.length > 0) {
    console.error("Metadata verification failed:");
    failures.forEach((failure) => {
      console.error(`- ${path.basename(failure.file)}`);
      failure.issues.forEach((issue) => {
        console.error(`  ${issue.scope} ${issue.key}: ${issue.value}`);
      });
    });
    process.exit(1);
  }

  console.log(`Metadata verification passed (${files.length} files).`);
}

if (require.main === module) {
  run();
}

module.exports = { run };
