const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { dateStamp } = require("./lib/utils");

function parseArgs(argv) {
  const args = {
    date: null,
    minTotal: 20,
    batchSize: null,
    sampleStep: 1,
    maxRenderWarn: 0,
    skipCompare: false,
    skipGoLive: false
  };
  argv.forEach((arg) => {
    if (arg.startsWith("--date=")) args.date = arg.split("=")[1];
    if (arg.startsWith("--min-total=")) args.minTotal = Number(arg.split("=")[1]);
    if (arg.startsWith("--batch-size=")) args.batchSize = Number(arg.split("=")[1]);
    if (arg.startsWith("--sample-step=")) args.sampleStep = Number(arg.split("=")[1]);
    if (arg.startsWith("--max-render-warn=")) args.maxRenderWarn = Number(arg.split("=")[1]);
    if (arg === "--skip-compare") args.skipCompare = true;
    if (arg === "--skip-go-live") args.skipGoLive = true;
  });
  return args;
}

function listBatchFiles(dirPath, ext) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((file) => /^video-\d+/i.test(file) && file.endsWith(ext))
    .sort();
}

function checkScriptRenderSync(scriptsDir, rendersDir) {
  const scriptFiles = listBatchFiles(scriptsDir, ".json");
  const renderFiles = listBatchFiles(rendersDir, ".mp4");
  const renderSet = new Set(renderFiles);
  const scriptSet = new Set(scriptFiles.map((file) => file.replace(/\.json$/i, ".mp4")));

  const missingRenders = [];
  const stalePairs = [];
  const extraRenders = [];

  scriptFiles.forEach((scriptFile) => {
    const renderFile = scriptFile.replace(/\.json$/i, ".mp4");
    const scriptPath = path.join(scriptsDir, scriptFile);
    const renderPath = path.join(rendersDir, renderFile);
    if (!fs.existsSync(renderPath)) {
      missingRenders.push(renderFile);
      return;
    }
    const scriptMtime = fs.statSync(scriptPath).mtimeMs;
    const renderMtime = fs.statSync(renderPath).mtimeMs;
    if (scriptMtime > renderMtime) {
      stalePairs.push({ script: scriptFile, render: renderFile });
    }
  });

  renderFiles.forEach((renderFile) => {
    if (!scriptSet.has(renderFile)) extraRenders.push(renderFile);
  });

  return {
    scriptCount: scriptFiles.length,
    renderCount: renderFiles.length,
    missingRenders,
    stalePairs,
    extraRenders
  };
}

function runNode(scriptPath, args = []) {
  execFileSync(process.execPath, [scriptPath, ...args], { stdio: "inherit" });
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function run() {
  const rootDir = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const date = dateStamp(args.date);
  const minTotal = Math.max(1, Number(args.minTotal) || 20);
  const batchSize = Number.isFinite(args.batchSize) ? args.batchSize : minTotal;

  const scriptsDir = path.join(rootDir, "scripts", date);
  const rendersDir = path.join(rootDir, "renders", date);
  const logsDir = path.join(rootDir, "logs", date);

  if (!fs.existsSync(scriptsDir)) {
    console.error(`Missing scripts directory: ${scriptsDir}`);
    process.exit(1);
  }
  if (!fs.existsSync(rendersDir)) {
    console.error(`Missing renders directory: ${rendersDir}`);
    process.exit(1);
  }

  const syncPre = checkScriptRenderSync(scriptsDir, rendersDir);
  if (syncPre.scriptCount < minTotal) {
    console.error(`Script batch too small: ${syncPre.scriptCount} < ${minTotal}`);
    process.exit(1);
  }
  if (syncPre.renderCount < minTotal) {
    console.error(`Render batch too small: ${syncPre.renderCount} < ${minTotal}`);
    process.exit(1);
  }

  runNode(path.join(rootDir, "tests", "validate-viral-mechanics.js"), [
    `--date=${date}`,
    `--min-total=${minTotal}`
  ]);
  runNode(path.join(rootDir, "tests", "validate-render-tier-cv.js"), [
    `--date=${date}`,
    `--min-total=${minTotal}`,
    `--sample-step=${args.sampleStep}`
  ]);
  if (!args.skipCompare) {
    runNode(path.join(rootDir, "tests", "compare-viral.js"), [
      `--date=${date}`,
      `--min-total=${minTotal}`
    ]);
  }

  const vmPath = path.join(logsDir, "validate-viral-mechanics.json");
  const cvPath = path.join(logsDir, "validate-render-tier-cv.json");
  if (!fs.existsSync(vmPath) || !fs.existsSync(cvPath)) {
    console.error("Missing validator artifacts after run.");
    process.exit(1);
  }

  const vm = loadJson(vmPath);
  const cv = loadJson(cvPath);
  const scriptFail = Number(vm.failure_count) || 0;
  const renderFail = Number(cv.failure_count) || 0;
  const renderWarn = Number(cv.warn_count) || 0;

  if (scriptFail > 0) {
    console.error(`release-check failed: script fail_count=${scriptFail}`);
    process.exit(1);
  }
  if (renderFail > 0) {
    console.error(`release-check failed: render fail_count=${renderFail}`);
    process.exit(1);
  }
  if (renderWarn > args.maxRenderWarn) {
    console.error(`release-check failed: render warn_count=${renderWarn} > ${args.maxRenderWarn}`);
    process.exit(1);
  }

  const syncPost = checkScriptRenderSync(scriptsDir, rendersDir);
  if (syncPost.missingRenders.length > 0 || syncPost.stalePairs.length > 0 || syncPost.extraRenders.length > 0) {
    console.error("release-check failed: script/render sync mismatch detected.");
    if (syncPost.missingRenders.length > 0) {
      console.error(`- missing renders: ${syncPost.missingRenders.join(", ")}`);
    }
    if (syncPost.stalePairs.length > 0) {
      console.error(
        `- stale pairs: ${syncPost.stalePairs.map((row) => `${row.script}->${row.render}`).join(", ")}`
      );
    }
    if (syncPost.extraRenders.length > 0) {
      console.error(`- extra renders: ${syncPost.extraRenders.join(", ")}`);
    }
    process.exit(1);
  }

  if (!args.skipGoLive) {
    runNode(path.join(rootDir, "tools", "generate-go-live-report.js"), [
      `--date=${date}`,
      `--batch-size=${batchSize}`
    ]);
  }

  console.log(
    `release-check passed (${date}): scripts=${syncPost.scriptCount}, renders=${syncPost.renderCount}, script_fail=0, render_fail=0, render_warn=${renderWarn}`
  );
}

if (require.main === module) {
  run();
}
