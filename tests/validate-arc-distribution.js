const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = { date: null, minSample: 10 };
  argv.forEach((arg) => {
    if (arg.startsWith("--date=")) args.date = arg.split("=")[1];
    if (arg.startsWith("--min-sample=")) args.minSample = Number(arg.split("=")[1]);
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

function run() {
  const rootDir = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const date = dateStamp(args.date);
  const scriptsDir = path.join(rootDir, "scripts", date);
  const logsDir = path.join(rootDir, "logs", date);
  const configPath = path.join(rootDir, "config.json");
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (_) {}

  if (!fs.existsSync(scriptsDir)) {
    console.error(`Missing scripts directory: ${scriptsDir}`);
    process.exit(1);
  }

  const scriptFiles = fs
    .readdirSync(scriptsDir)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const scripts = scriptFiles.map((file) =>
    JSON.parse(fs.readFileSync(path.join(scriptsDir, file), "utf8"))
  );

  const defaultDistribution = {
    number_exchange: 0.60,
    rejection: 0.20,
    plot_twist: 0.03,
    cliffhanger: 0.17,
    comedy: 0
  };
  const configuredDistribution = {
    ...defaultDistribution,
    ...((config && config.arc_distribution) || {})
  };
  const requiredArcs = Object.keys(configuredDistribution).filter(
    (arc) => Number(configuredDistribution[arc]) > 0
  );
  const arcCounts = {};
  scripts.forEach((script) => {
    const arc = script.meta && script.meta.arc_type ? script.meta.arc_type : "missing";
    arcCounts[arc] = (arcCounts[arc] || 0) + 1;
  });

  const missingArcs = requiredArcs.filter((arc) => !arcCounts[arc]);
  const failures = [];
  if (scripts.length < args.minSample) {
    failures.push(`insufficient sample size: ${scripts.length} < ${args.minSample}`);
  }
  if (missingArcs.length > 0) {
    failures.push(`missing arc types: ${missingArcs.join(", ")}`);
  }

  const report = {
    date,
    sample_size: scripts.length,
    min_sample_required: args.minSample,
    arc_counts: arcCounts,
    required_arcs: requiredArcs,
    missing_arcs: missingArcs,
    failures
  };

  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(path.join(logsDir, "arc-distribution.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (failures.length > 0) {
    console.error("validate-arc-distribution failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log("validate-arc-distribution passed");
}

if (require.main === module) {
  run();
}
