const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { dateStamp, ensureDir, loadConfig } = require("./lib/utils");
const { createLogger } = require("./lib/logger");
const {
  buildSlate,
  computeCaps,
  validateSlate,
  toSeedInt
} = require("./lib/fatigue");
const { verifyScript } = require("./lib/verifier");
const { repairPayoff } = require("./repair");

function parseArgs(argv) {
  const args = {
    date: null,
    count: null,
    seed: null,
    clean: false,
    allowShortfall: false,
    allowRepairFailed: false,
    dryRun: false,
    skipReleaseCheck: false,
    maxRenderWarn: 0,
    placeholder: false
  };
  argv.forEach((arg) => {
    if (arg.startsWith("--date=")) args.date = arg.split("=")[1];
    if (arg.startsWith("--count=")) args.count = Number(arg.split("=")[1]);
    if (arg.startsWith("--seed=")) args.seed = arg.split("=")[1];
    if (arg === "--keep-existing" || arg === "--no-clean") args.clean = false;
    if (arg === "--allow-shortfall" || arg === "--allow-partial") args.allowShortfall = true;
    if (arg === "--allow-repair-failed") args.allowRepairFailed = true;
    if (arg === "--dry-run") args.dryRun = true;
    if (arg === "--skip-release-check") args.skipReleaseCheck = true;
    if (arg === "--placeholder") args.placeholder = true;
    if (arg.startsWith("--max-render-warn=")) args.maxRenderWarn = Number(arg.split("=")[1]);
  });
  return args;
}

function clearDateArtifacts(rootDir, date) {
  const targets = [
    path.join(rootDir, "scripts", date),
    path.join(rootDir, "renders", date),
    path.join(rootDir, "logs", date)
  ];
  targets.forEach((target) => {
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  });
}

function md5File(filePath) {
  const raw = fs.readFileSync(filePath);
  return crypto.createHash("md5").update(raw).digest("hex");
}

function readJsonSafe(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function buildVideoId(date, slotIndex) {
  return `${date}-${String(slotIndex).padStart(3, "0")}`;
}

function buildScriptFilename(script, slotIndex) {
  const arcSlug = String(script && script.meta && script.meta.arc_type || "unknown").replace(/_/g, "-");
  const formatSlug = String(script && script.meta && script.meta.format || "b").toLowerCase();
  const variant = script && script.meta && script.meta.format_variant;
  const variantSlug = variant ? `-${variant}` : "";
  // For brainrot scripts, append the sub-variant (random / contextual) so it's visible in the filename.
  const brainrotVariant = arcSlug === "brainrot" && script.meta && script.meta.brainrot_variant
    ? `-${script.meta.brainrot_variant}`
    : "";
  return `video-${String(slotIndex).padStart(3, "0")}-${formatSlug}${variantSlug}-${arcSlug}${brainrotVariant}.json`;
}

function loadGeneratedScriptFromDir(scriptsDir) {
  if (!fs.existsSync(scriptsDir)) return null;
  const files = fs.readdirSync(scriptsDir).filter((file) => file.endsWith(".json")).sort();
  if (!files.length) return null;
  const filePath = path.join(scriptsDir, files[0]);
  const script = readJsonSafe(filePath, null);
  if (!script) return null;
  return { script, filePath, fileName: files[0] };
}

function toViolationCodes(result) {
  return Array.isArray(result && result.violations)
    ? result.violations.map((item) => String(item && item.code || "")).filter(Boolean)
    : [];
}

function logVerifierEvent(logger, stage, videoId, result) {
  const payload = {
    video_id: videoId,
    fatal_count: Number(result && result.fatal_count) || 0,
    warn_count: Number(result && result.warn_count) || 0,
    stage
  };
  if (result && result.pass) {
    logger.log("verifier_pass", payload);
  } else {
    logger.log("verifier_fail", {
      ...payload,
      violations: toViolationCodes(result)
    });
  }
}

function applySlotMetadata(script, { slot, date }) {
  const slotIndex = slot.slot_index;
  const safeMeta = script && script.meta && typeof script.meta === "object" ? script.meta : {};
  return {
    ...(script || {}),
    video_id: buildVideoId(date, slotIndex),
    meta: {
      ...safeMeta,
      arc_type: slot.arc_type,
      format: slot.format,
      format_variant: slot.format_variant,
      hook_type: slot.hook_type,
      payoff_type: slot.payoff_type,
      template_id: slot.template_id,
      mechanic_ids: Array.isArray(slot.mechanic_ids) ? [...slot.mechanic_ids] : [],
      slot_index: slotIndex,
      run_seed: slot.run_seed,
      payoff_punch_score: safeMeta.payoff_punch_score == null ? null : safeMeta.payoff_punch_score,
      repair_applied: Boolean(safeMeta.repair_applied),
      repair_rounds: Number(safeMeta.repair_rounds) || 0,
      repair_failed: Boolean(safeMeta.repair_failed),
      verifier_passed: Boolean(safeMeta.verifier_passed)
    }
  };
}

function persistFinalScript(scriptsDir, script, slotIndex) {
  const fileName = buildScriptFilename(script, slotIndex);
  const filePath = path.join(scriptsDir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(script, null, 2)}\n`, "utf8");
  return { fileName, filePath };
}

// Distribute brainrot punchline styles across all slots for the day so that
// batch-mode (count=1 per slot) gets variety instead of always picking the
// highest-fraction style from a 1-item buildTierPlan.
function buildBatchPunchlinePlan(config, count, seed) {
  const brainrotEnabled = !!(config && config.experiments && config.experiments.brainrotStyle && config.experiments.brainrotStyle.enabled);
  if (!brainrotEnabled) return [];
  const distribution = {
    numeric_reveal: 0.20,
    list_reveal: 0.20,
    setup_reframe: 0.15,
    persistence_flip: 0.15,
    presumptive_close: 0.15,
    roast_flip: 0.15
  };
  const entries = Object.entries(distribution);
  const floors = entries.map(([key, weight]) => ({ key, floor: Math.floor(weight * count), frac: (weight * count) % 1 }));
  let assigned = floors.reduce((acc, row) => acc + row.floor, 0);
  floors.sort((a, b) => b.frac - a.frac);
  for (let i = 0; assigned < count && i < floors.length; i++) { floors[i].floor++; assigned++; }
  const plan = [];
  floors.forEach(row => { for (let i = 0; i < row.floor; i++) plan.push(row.key); });
  // Seeded Fisher-Yates shuffle
  let s = (typeof seed === "number" ? seed : 12345) >>> 0;
  for (let i = plan.length - 1; i > 0; i--) {
    s = Math.imul(s ^ (s >>> 17), 0x45d9f3b); s = Math.imul(s ^ (s >>> 31), 0x119de1f3); s ^= s >>> 15;
    const j = (s >>> 0) % (i + 1);
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  return plan;
}

function runGenerateForSlot({ rootDir, slot, attempt, date, runSeed }) {
  const tmpDate = `${date}-tmp-slot-${String(slot.slot_index).padStart(3, "0")}-a${attempt}-${runSeed}`;
  const tmpScriptsDir = path.join(rootDir, "scripts", tmpDate);
  const tmpLogsDir = path.join(rootDir, "logs", tmpDate);
  const tmpRendersDir = path.join(rootDir, "renders", tmpDate);
  [tmpScriptsDir, tmpLogsDir, tmpRendersDir].forEach((dirPath) => {
    if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
  });

  const seed = `${slot.run_seed}-${attempt}`;
  const args = [
    "tools/generate.js",
    `--date=${tmpDate}`,
    "--count=1",
    `--seed=${seed}`,
    `--force-arc-type=${slot.arc_type}`,
    `--force-format=${slot.format}`
  ];
  if (slot.format === "B" && (slot.format_variant === "short" || slot.format_variant === "long")) {
    args.push(`--force-b-variant=${slot.format_variant}`);
  }
  if (slot.punchlineStyle) {
    args.push(`--force-punchline-style=${slot.punchlineStyle}`);
  }

  execFileSync("node", args, { stdio: "inherit", cwd: rootDir });
  const loaded = loadGeneratedScriptFromDir(tmpScriptsDir);

  // Keep temp scripts out of long-term history once consumed.
  [tmpScriptsDir, tmpLogsDir, tmpRendersDir].forEach((dirPath) => {
    if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
  });

  return loaded ? loaded.script : null;
}

function loadQaResult(logsDir) {
  const qaPath = path.join(logsDir, "qa.json");
  const qa = readJsonSafe(qaPath, { summary: { pass: 0 }, results: [] });
  const passSet = new Set(
    (qa.results || []).filter((row) => row && row.pass).map((row) => row.file)
  );
  const passCount = Number(qa && qa.summary && qa.summary.pass) || 0;
  return { qaPath, qa, passSet, passCount };
}

function maybeRunPrereqs(rootDir, config) {
  execFileSync("node", ["tools/convert-hooks.js"], { stdio: "inherit", cwd: rootDir });

  const bankPath = path.join(rootDir, "line_banks.json");
  if (!fs.existsSync(bankPath)) {
    execFileSync("node", ["tools/generate-line-banks.js"], { stdio: "inherit", cwd: rootDir });
  }

  const manifestPath = path.join(rootDir, config.story_assets && config.story_assets.curated_dir, "manifest.json");
  const needsManifestUpgrade = (() => {
    const curatedDir = path.join(rootDir, config.story_assets && config.story_assets.curated_dir);
    if (!fs.existsSync(manifestPath)) return true;
    try {
      const entries = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const manifestFilenames = new Set(entries.map((entry) => entry.filename));
      const imageFiles = fs.existsSync(curatedDir)
        ? fs.readdirSync(curatedDir).filter((file) => /\.(jpg|jpeg|png|webp)$/i.test(file))
        : [];
      const hasNewImages = imageFiles.some((file) => !manifestFilenames.has(file));
      const hasMissingFields = entries.some(
        (entry) => !entry.hook || !Array.isArray(entry.captions) || entry.captions.length === 0
      );
      return hasNewImages || hasMissingFields;
    } catch (error) {
      return true;
    }
  })();

  if (needsManifestUpgrade) {
    execFileSync("node", ["tools/categorize-baddies.js", "--upgrade"], { stdio: "inherit", cwd: rootDir });
  }
}

function countRenderedFiles(rendersDir, renderFileNames) {
  if (!fs.existsSync(rendersDir)) return 0;
  return renderFileNames.filter((jsonName) => {
    const mp4Name = jsonName.replace(/\.json$/, ".mp4");
    return fs.existsSync(path.join(rendersDir, mp4Name));
  }).length;
}

function getShortfallReasons({
  date,
  dailyCount,
  records,
  qaPassSet,
  renderSet,
  generationFailures,
  allowRepairFailed
}) {
  const reasons = [];
  const renderFiles = new Set(renderSet.map((row) => row.fileName));

  generationFailures.forEach((failure) => {
    reasons.push(`${buildVideoId(date, failure.slot_index)}:${failure.reason}`);
  });

  records.forEach((record) => {
    if (renderFiles.has(record.fileName)) return;
    let reason = "not_rendered";
    if (!qaPassSet.has(record.fileName)) {
      reason = "qa_fail";
    } else if (!record.pre_render_pass) {
      reason = "verifier_fail_pre_render";
    } else if (record.script && record.script.meta && record.script.meta.repair_failed && !allowRepairFailed) {
      reason = "repair_failed";
    }
    reasons.push(`${record.script.video_id}:${reason}`);
  });

  // Guard: if generation produced fewer slots than requested, include explicit generation shortfall markers.
  const coveredSlots = new Set([
    ...records.map((record) => record.slot_index),
    ...generationFailures.map((failure) => failure.slot_index)
  ]);
  for (let i = 1; i <= dailyCount; i += 1) {
    if (!coveredSlots.has(i)) {
      reasons.push(`${buildVideoId(date, i)}:generation_missing`);
    }
  }

  return reasons;
}

async function run() {
  const rawArgs = process.argv.slice(2);
  const rootDir = process.cwd();
  const parsed = parseArgs(rawArgs);
  const config = loadConfig(rootDir);

  const date = dateStamp(parsed.date);
  const configPath = path.join(rootDir, "config.json");
  const dailyCount = Number.isFinite(parsed.count) ? parsed.count : Number(config.daily_count);
  const constrainedDailyCount = Math.max(1, Math.min(50, Number(dailyCount) || 1));
  const runSeed = toSeedInt(parsed.seed || `${date}:${constrainedDailyCount}`);

  const scriptsDir = path.join(rootDir, "scripts", date);
  const rendersDir = path.join(rootDir, "renders", date);
  const logsDir = path.join(rootDir, "logs", date);

  if (parsed.clean) {
    clearDateArtifacts(rootDir, date);
    console.log(`Cleaned existing artifacts for ${date}`);
  }

  ensureDir(scriptsDir);
  ensureDir(rendersDir);
  ensureDir(logsDir);

  const logger = createLogger(logsDir, date);
  const startMs = Date.now();

  let exitCode = 0;
  let renderedCount = 0;
  let qaPassCount = 0;
  let repairAppliedCount = 0;
  let repairFailedCount = 0;
  let generatedCount = 0;
  let fatigueCapsUsed = computeCaps(constrainedDailyCount);
  const shortfallReasons = [];

  try {
    logger.log("run_started", {
      run_seed: runSeed,
      date,
      daily_count: constrainedDailyCount,
      config_hash: md5File(configPath)
    });

    maybeRunPrereqs(rootDir, config);

    const manifest = buildSlate(config, date, runSeed, constrainedDailyCount, logger, logsDir);
    fatigueCapsUsed = manifest.fatigue_caps;

    // Assign brainrot punchline styles across slots before generation starts
    const punchlinePlan = buildBatchPunchlinePlan(config, constrainedDailyCount, runSeed);
    if (punchlinePlan.length > 0) {
      manifest.slots.forEach((slot, i) => { slot.punchlineStyle = punchlinePlan[i % punchlinePlan.length] || null; });
    }

    logger.log("slate_created", {
      slot_count: constrainedDailyCount,
      run_seed: runSeed,
      manifest_path: path.join(logsDir, "slate-manifest.json")
    });

    const records = [];
    const generationFailures = [];
    const slotRetryLimit =
      Number(config && config.script_quality && config.script_quality.max_attempts) > 0
        ? Number(config.script_quality.max_attempts)
        : 3;

    for (const slot of manifest.slots) {
      let accepted = null;
      let attemptsUsed = 0;

      for (let attempt = 1; attempt <= slotRetryLimit; attempt += 1) {
        attemptsUsed = attempt;
        let generatedScript;
        try {
          generatedScript = runGenerateForSlot({
            rootDir,
            slot,
            attempt,
            date,
            runSeed
          });
        } catch (error) {
          if (attempt === slotRetryLimit) {
            generationFailures.push({ slot_index: slot.slot_index, reason: "generation_exec_fail" });
          }
          continue;
        }

        if (!generatedScript) {
          if (attempt === slotRetryLimit) {
            generationFailures.push({ slot_index: slot.slot_index, reason: "generation_output_missing" });
          }
          continue;
        }

        const candidate = applySlotMetadata(generatedScript, { slot, date });

        const postGenerateResult = verifyScript(candidate, config, {
          stage: "post_generate",
          caps: manifest.fatigue_caps,
          batchScripts: [...records.map((row) => row.script), candidate]
        });
        logVerifierEvent(logger, "post_generate", candidate.video_id, postGenerateResult);

        if (!postGenerateResult.pass) {
          if (attempt === slotRetryLimit) {
            generationFailures.push({ slot_index: slot.slot_index, reason: "verifier_fail_post_generate" });
          }
          continue;
        }

        logger.log("script_generated", {
          video_id: candidate.video_id,
          slot_index: slot.slot_index,
          arc_type: candidate.meta.arc_type,
          format: candidate.meta.format,
          hook_type: candidate.meta.hook_type,
          attempts: attemptsUsed
        });

        accepted = candidate;
        break;
      }

      if (!accepted) continue;

      // Brainrot scripts have no payoff line to repair — skip repair pass entirely.
      const isBrainrotScript = accepted.meta && accepted.meta.arc_type === "brainrot";
      let repairedScript;
      if (isBrainrotScript) {
        repairedScript = accepted;
      } else {
        const repaired = await repairPayoff(accepted, config, logger, {
          date,
          logsDir
        });
        repairedScript = repaired.script;
      }

      const postRepairResult = verifyScript(repairedScript, config, {
        stage: "post_repair",
        caps: manifest.fatigue_caps,
        batchScripts: [...records.map((row) => row.script), repairedScript]
      });
      logVerifierEvent(logger, "post_repair", repairedScript.video_id, postRepairResult);

      repairedScript.meta = {
        ...(repairedScript.meta || {}),
        repair_failed: isBrainrotScript
          ? false
          : Boolean(repairedScript.meta && repairedScript.meta.repair_failed) || !postRepairResult.pass,
        verifier_passed: postRepairResult.pass
      };

      const persisted = persistFinalScript(scriptsDir, repairedScript, slot.slot_index);
      records.push({
        slot_index: slot.slot_index,
        attempts: attemptsUsed,
        script: repairedScript,
        fileName: persisted.fileName,
        filePath: persisted.filePath,
        pre_render_pass: false
      });

      logger.log("script_finalized", {
        video_id: repairedScript.video_id,
        payoff_punch_score: repairedScript.meta.payoff_punch_score,
        repair_applied: Boolean(repairedScript.meta.repair_applied),
        repair_rounds: Number(repairedScript.meta.repair_rounds) || 0,
        verifier_passed: Boolean(repairedScript.meta.verifier_passed)
      });
    }

    generatedCount = records.length;

    execFileSync("node", ["tools/qa.js", `--date=${date}`], { stdio: "inherit", cwd: rootDir });
    const qaResult = loadQaResult(logsDir);
    qaPassCount = qaResult.passCount;

    const slateValidation = validateSlate(scriptsDir, manifest.fatigue_caps);
    if (!slateValidation.valid) {
      slateValidation.violations.forEach((entry) => {
        const parts = String(entry).split(":");
        logger.log("verifier_fail", {
          video_id: parts[1] || "unknown",
          fatal_count: 1,
          warn_count: 0,
          stage: "pre_render",
          violations: [parts[0] || "FATIGUE_CAP_VIOLATION"]
        });
      });
    }

    const preRenderScripts = records.map((record) => readJsonSafe(record.filePath, record.script)).filter(Boolean);
    records.forEach((record) => {
      const latest = readJsonSafe(record.filePath, record.script);
      const preRenderResult = verifyScript(latest, config, {
        stage: "pre_render",
        caps: manifest.fatigue_caps,
        batchScripts: preRenderScripts
      });
      logVerifierEvent(logger, "pre_render", latest.video_id, preRenderResult);
      latest.meta = {
        ...(latest.meta || {}),
        verifier_passed: preRenderResult.pass
      };
      fs.writeFileSync(record.filePath, `${JSON.stringify(latest, null, 2)}\n`, "utf8");
      record.script = latest;
      record.pre_render_pass = preRenderResult.pass;
    });

    repairAppliedCount = records.filter((record) => Boolean(record.script.meta && record.script.meta.repair_applied)).length;
    repairFailedCount = records.filter((record) => Boolean(record.script.meta && record.script.meta.repair_failed)).length;

    const renderSet = records.filter((record) => {
      const qaPass = qaResult.passSet.has(record.fileName);
      const verifierPass = Boolean(record.pre_render_pass);
      const repairFlag = Boolean(record.script.meta && record.script.meta.repair_failed);
      if (!qaPass) return false;
      if (!verifierPass) return false;
      if (repairFlag && !parsed.allowRepairFailed) return false;
      return true;
    });

    shortfallReasons.push(
      ...getShortfallReasons({
        date,
        dailyCount: constrainedDailyCount,
        records,
        qaPassSet: qaResult.passSet,
        renderSet,
        generationFailures,
        allowRepairFailed: parsed.allowRepairFailed
      })
    );

    if (renderSet.length === 0) {
      logger.log("render_gate_block", {
        reason: "no_passing_scripts",
        qa_pass_count: qaPassCount
      });
      exitCode = 1;
    } else {
      logger.log("render_gate_pass", {
        qa_pass_count: qaPassCount,
        repair_failed_count: repairFailedCount,
        render_count: renderSet.length
      });

      if (!parsed.dryRun) {
        const renderSetPath = path.join(logsDir, "render-set.json");
        fs.writeFileSync(
          renderSetPath,
          `${JSON.stringify({ files: renderSet.map((item) => item.fileName) }, null, 2)}\n`,
          "utf8"
        );

        const renderArgs = [
          "tools/render.js",
          `--date=${date}`,
          `--file-list=${renderSetPath}`,
          `--qa-path=${qaResult.qaPath}`
        ];
        if (parsed.placeholder) renderArgs.push("--placeholder");
        execFileSync("node", renderArgs, { stdio: "inherit", cwd: rootDir });

        execFileSync("node", ["tools/strip-metadata.js", `--date=${date}`], { stdio: "inherit", cwd: rootDir });
        execFileSync("node", ["tools/verify-metadata.js", `--date=${date}`], { stdio: "inherit", cwd: rootDir });

        renderedCount = countRenderedFiles(rendersDir, renderSet.map((item) => item.fileName));
      }
    }

    if (!parsed.skipReleaseCheck && !parsed.dryRun) {
      const isShortfall = renderedCount < constrainedDailyCount;
      if (!isShortfall || parsed.allowShortfall) {
        try {
          execFileSync(
            "node",
            [
              "tools/release-check.js",
              `--date=${date}`,
              `--min-total=${renderedCount}`,
              `--batch-size=${constrainedDailyCount}`,
              `--max-render-warn=${parsed.maxRenderWarn}`
            ],
            { stdio: "inherit", cwd: rootDir }
          );
        } catch (error) {
          // Release check is informational for this PRD scope; do not override pipeline result.
        }
      }
    }
  } catch (error) {
    exitCode = 1;
    shortfallReasons.push(`run:${String(error && error.message || "unexpected_error")}`);
    console.error(error && error.stack ? error.stack : error);
  } finally {
    const durationMs = Date.now() - startMs;
    const shortfall = renderedCount < constrainedDailyCount;
    logger.log("run_summary", {
      requested_count: constrainedDailyCount,
      generated_count: generatedCount,
      qa_pass_count: qaPassCount,
      repair_applied_count: repairAppliedCount,
      repair_failed_count: repairFailedCount,
      rendered_count: renderedCount,
      shortfall,
      shortfall_reasons: shortfallReasons,
      fatigue_caps_used: fatigueCapsUsed,
      seed_used: runSeed,
      duration_ms: durationMs,
      allow_shortfall: parsed.allowShortfall
    });
    logger.close();
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
