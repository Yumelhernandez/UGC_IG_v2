const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function parseArgs(argv) {
  const args = {
    date: null,
    count: 6,
    seed: "benchmark-seed",
    gptModel: "gpt-5.1",
    haikuModel: "claude-haiku-4-5-20251001",
    clean: true
  };
  argv.forEach((arg) => {
    if (arg.startsWith("--date=")) args.date = arg.split("=")[1];
    if (arg.startsWith("--count=")) args.count = Number(arg.split("=")[1]);
    if (arg.startsWith("--seed=")) args.seed = arg.split("=")[1];
    if (arg.startsWith("--gpt-model=")) args.gptModel = arg.split("=")[1];
    if (arg.startsWith("--haiku-model=")) args.haikuModel = arg.split("=")[1];
    if (arg === "--no-clean") args.clean = false;
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

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return null;
  }
}

function clearArtifacts(rootDir, date) {
  const targets = [
    path.join(rootDir, "scripts", date),
    path.join(rootDir, "logs", date),
    path.join(rootDir, "renders", date)
  ];
  targets.forEach((target) => {
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  });
}

function runNode(rootDir, args) {
  const result = spawnSync("node", ["-r", "dotenv/config", ...args], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env
  });
  return { ok: result.status === 0, status: result.status };
}

function countScripts(rootDir, date) {
  const scriptsDir = path.join(rootDir, "scripts", date);
  if (!fs.existsSync(scriptsDir)) return 0;
  return fs.readdirSync(scriptsDir).filter((f) => f.endsWith(".json")).length;
}

function summarizeArm(rootDir, arm) {
  const logsDir = path.join(rootDir, "logs", arm.date);
  const qa = loadJson(path.join(logsDir, "qa.json"));
  const viral = loadJson(path.join(logsDir, "validate-viral-mechanics.json"));
  const arc = loadJson(path.join(logsDir, "arc-distribution.json"));
  const usage = loadJson(path.join(logsDir, "llm-usage.json"));
  const benchStatus = loadJson(path.join(logsDir, "benchmark-step-status.json"));
  const generated = countScripts(rootDir, arm.date);

  const qaPass = qa && qa.summary ? Number(qa.summary.pass || 0) : 0;
  const qaTotal = qa && qa.summary ? Number(qa.summary.total || generated || 0) : generated;
  const qaPassRate = qaTotal > 0 ? Number((qaPass / qaTotal).toFixed(3)) : 0;

  const failCount = viral ? Number(viral.failure_count || 0) : null;
  const warnCount = viral ? Number(viral.warn_count || 0) : null;
  const gateFailCount = viral && viral.gate_results
    ? Object.values(viral.gate_results).filter((g) => g && g.status === "FAIL").length
    : null;

  const cost = usage && usage.totals ? Number(usage.totals.estimated_cost_usd || 0) : 0;
  const costPerScript = generated > 0 ? Number((cost / generated).toFixed(6)) : 0;

  return {
    arm: arm.name,
    provider: arm.provider,
    model: arm.model,
    date: arm.date,
    generated,
    qa: {
      pass: qaPass,
      total: qaTotal,
      pass_rate: qaPassRate
    },
    viral: {
      failure_count: failCount,
      warn_count: warnCount,
      gate_fail_count: gateFailCount
    },
    arc_distribution_failures: arc ? arc.failures || [] : ["missing arc-distribution.json"],
    llm_usage: usage && usage.totals ? usage.totals : null,
    step_status: benchStatus || null,
    estimated_cost_usd: cost,
    estimated_cost_per_script_usd: costPerScript
  };
}

function compareResults(gpt, haiku) {
  const winner = {
    quality: null,
    cost: null,
    overall: null
  };

  const gptQualityScore =
    (gpt.qa.pass_rate || 0) * 100 -
    (gpt.viral.failure_count || 0) * 10 -
    (gpt.viral.gate_fail_count || 0) * 5;
  const haikuQualityScore =
    (haiku.qa.pass_rate || 0) * 100 -
    (haiku.viral.failure_count || 0) * 10 -
    (haiku.viral.gate_fail_count || 0) * 5;

  winner.quality = gptQualityScore >= haikuQualityScore ? gpt.arm : haiku.arm;
  winner.cost = gpt.estimated_cost_per_script_usd <= haiku.estimated_cost_per_script_usd ? gpt.arm : haiku.arm;

  const qualityGap = Math.abs(gptQualityScore - haikuQualityScore);
  if (qualityGap <= 5) {
    winner.overall = winner.cost;
  } else {
    winner.overall = winner.quality;
  }

  return {
    scores: {
      [gpt.arm]: Number(gptQualityScore.toFixed(2)),
      [haiku.arm]: Number(haikuQualityScore.toFixed(2))
    },
    winner,
    deltas: {
      qa_pass_rate: Number((gpt.qa.pass_rate - haiku.qa.pass_rate).toFixed(3)),
      estimated_cost_per_script_usd: Number(
        (gpt.estimated_cost_per_script_usd - haiku.estimated_cost_per_script_usd).toFixed(6)
      )
    }
  };
}

function run() {
  const rootDir = process.cwd();
  const configPath = path.join(rootDir, "config.json");
  const args = parseArgs(process.argv.slice(2));
  const date = dateStamp(args.date);
  const count = Number.isFinite(args.count) && args.count > 0 ? Math.floor(args.count) : 6;

  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY");
    process.exit(1);
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || process.env.CLAUDE;
  if (!anthropicKey) {
    console.error("Missing Anthropic key (ANTHROPIC_API_KEY or CLAUDE_API_KEY or CLAUDE)");
    process.exit(1);
  }

  const arms = [
    { name: "gpt51", provider: "openai", model: args.gptModel, date: `${date}-bench-gpt51` },
    { name: "haiku", provider: "anthropic", model: args.haikuModel, date: `${date}-bench-haiku` }
  ];

  const originalConfigRaw = fs.readFileSync(configPath, "utf8");
  let benchmarkConfigWritten = false;
  try {
    const config = JSON.parse(originalConfigRaw);
    config.story_assets = config.story_assets || {};
    config.story_assets.enforce_unique_within_reuse_window = false;
    config.story_assets.source_asset_reuse_days = 0;
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    benchmarkConfigWritten = true;

    arms.forEach((arm, idx) => {
      if (args.clean) clearArtifacts(rootDir, arm.date);

      const stepStatus = {};
      stepStatus.generate = runNode(rootDir, [
        "tools/generate.js",
        `--date=${arm.date}`,
        `--count=${count}`,
        `--seed=${args.seed}-${idx + 1}`,
        `--llm-provider=${arm.provider}`,
        `--llm-model=${arm.model}`
      ]);

      stepStatus.qa = runNode(rootDir, ["tools/qa.js", `--date=${arm.date}`]);
      stepStatus.validate_viral = runNode(rootDir, [
        "tests/validate-viral-mechanics.js",
        `--date=${arm.date}`,
        `--min-total=${count}`
      ]);
      stepStatus.validate_arcs = runNode(rootDir, [
        "tests/validate-arc-distribution.js",
        `--date=${arm.date}`,
        `--min-sample=${count}`
      ]);
      const armLogDir = path.join(rootDir, "logs", arm.date);
      fs.mkdirSync(armLogDir, { recursive: true });
      fs.writeFileSync(
        path.join(armLogDir, "benchmark-step-status.json"),
        `${JSON.stringify(stepStatus, null, 2)}\n`,
        "utf8"
      );
    });
  } finally {
    if (benchmarkConfigWritten) {
      fs.writeFileSync(configPath, originalConfigRaw, "utf8");
    }
  }

  const gpt = summarizeArm(rootDir, arms[0]);
  const haiku = summarizeArm(rootDir, arms[1]);
  const comparison = compareResults(gpt, haiku);

  const outDir = path.join(rootDir, "logs", `${date}-benchmark`);
  fs.mkdirSync(outDir, { recursive: true });
  const report = {
    date,
    count,
    seed: args.seed,
    arms: [gpt, haiku],
    comparison
  };
  const reportPath = path.join(outDir, "haiku-vs-gpt51.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Benchmark report written: ${reportPath}`);
  console.log(`Overall winner: ${comparison.winner.overall}`);
}

if (require.main === module) {
  run();
}
