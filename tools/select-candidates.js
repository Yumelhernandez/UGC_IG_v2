const fs = require("fs");
const path = require("path");
const { dateStamp } = require("./lib/utils");

function parseArgs(argv) {
  const args = { date: null, top: 3 };
  argv.forEach((arg) => {
    if (arg.startsWith("--date=")) args.date = arg.split("=")[1];
    if (arg.startsWith("--top=")) args.top = Number(arg.split("=")[1]);
  });
  return args;
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function normalizeText(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreScript(script) {
  const messages = Array.isArray(script.messages) ? script.messages : [];
  if (!messages.length) return { score: -999, reasons: ["empty messages"] };

  const reasons = [];
  let score = 0;
  const componentScores = {
    hook_specificity_score: 0,
    reaction_authenticity_score: 0,
    arc_integrity_score: 0,
    shareable_moment_score: 0,
    early_density_score: 0,
    clip_semantic_fit_score: 0
  };

  const firstMessage = messages[0]?.type_at;
  if (typeof firstMessage === "number") {
    if (firstMessage <= 2.5) {
      score += 2;
      componentScores.early_density_score += 0.4;
    } else if (firstMessage <= 3.2) {
      score += 1;
      componentScores.early_density_score += 0.2;
    }
    else {
      score -= 2;
      reasons.push("first message late");
    }
  } else {
    score -= 3;
    reasons.push("missing first message timing");
  }

  const inFirstSix = messages.filter((m) => typeof m.type_at === "number" && m.type_at <= 6).length;
  if (inFirstSix >= 3) {
    score += 2;
    componentScores.early_density_score += 0.6;
  } else if (inFirstSix >= 2) {
    score += 1;
    componentScores.early_density_score += 0.4;
  }
  else {
    score -= 2;
    reasons.push("weak early pacing");
  }

  const gaps = [];
  for (let i = 1; i < messages.length; i += 1) {
    const prev = messages[i - 1]?.type_at;
    const next = messages[i]?.type_at;
    if (typeof prev === "number" && typeof next === "number") gaps.push(next - prev);
  }
  const meanGap = avg(gaps);
  if (meanGap >= 0.8 && meanGap <= 1.9) score += 2;
  else if (meanGap > 2.4) {
    score -= 2;
    reasons.push("gaps too wide");
  }

  const msgCount = messages.length;
  if (msgCount >= 8 && msgCount <= 12) score += 2;
  else if (msgCount < 7) {
    score -= 1;
    reasons.push("message count low");
  }

  const arc = script.meta && script.meta.arc_type ? script.meta.arc_type : "missing";
  const hasPhone = messages.some((m) => /555\s?\d{3}\s?\d{4}/.test(String((m && m.text) || "")));
  const lastText = String((messages[messages.length - 1] && messages[messages.length - 1].text) || "").toLowerCase();
  let arcIntegrity = false;
  if (arc === "number_exchange") arcIntegrity = hasPhone;
  if (arc === "rejection") arcIntegrity = !hasPhone && /(not|pass|nice try|nah)/.test(lastText);
  if (arc === "plot_twist") arcIntegrity = !hasPhone && messages.some((m) => /(plot twist|actually|testing)/i.test(String(m && m.text || "")));
  if (arc === "cliffhanger") arcIntegrity = !hasPhone && !/(deal|youre on|don't be late|see you)/.test(lastText);
  if (arc === "comedy") {
    const thread = messages.map((m) => String((m && m.text) || "")).join(" ").toLowerCase();
    arcIntegrity = /(lol|lmao|funny|wild|crazy|insane|unhinged|weird|stop|chill|dead|done|😂|😭)/.test(thread);
  }
  if (arcIntegrity) {
    score += 2;
    componentScores.arc_integrity_score = 1;
  } else {
    score -= 3;
    reasons.push("arc-label/ending mismatch");
  }

  const hasAudio = script.meta && typeof script.meta.audio_track === "string" && script.meta.audio_track.trim();
  if (hasAudio) score += 1;
  else {
    score -= 1;
    reasons.push("missing audio track");
  }

  const hasInBetween = script.meta && Array.isArray(script.meta.in_between_assets) && script.meta.in_between_assets.length > 0;
  if (hasInBetween) {
    score += 1;
    componentScores.clip_semantic_fit_score = script.meta && script.meta.beat_plan && script.meta.beat_plan.shareable_moment ? 0.8 : 0.4;
  }
  else {
    score -= 2;
    reasons.push("missing in-between assets");
  }

  const hookText = normalizeText(script.reply && script.reply.text);
  if (hookText && hookText.split(" ").length >= 4) {
    componentScores.hook_specificity_score = 0.8;
    score += 1;
  } else {
    reasons.push("generic hook family");
    score -= 1;
  }
  const firstGirl = messages.find((m) => m && m.from === "girl");
  if (firstGirl && String(firstGirl.text || "").split(" ").length <= 5) {
    componentScores.reaction_authenticity_score = 0.8;
  } else {
    reasons.push("reaction weak");
    score -= 1;
  }
  const shareable = script.meta && script.meta.beat_plan && script.meta.beat_plan.shareable_moment;
  if (shareable && String(shareable).trim().length >= 5) {
    componentScores.shareable_moment_score = 0.8;
  } else {
    reasons.push("missing shareable moment");
    score -= 1;
  }
  if (meanGap > 3.5) {
    score -= 1;
    reasons.push("long first-gap");
  }

  return {
    score,
    reasons,
    metrics: { firstMessage, inFirstSix, meanGap, msgCount },
    component_scores: componentScores
  };
}

function applyBatchNoveltyAdjustments(rows) {
  const hookCounts = new Map();
  const askCounts = new Map();
  rows.forEach((row) => {
    const hookKey = normalizeText(row.script.hook && row.script.hook.headline);
    if (hookKey) hookCounts.set(hookKey, (hookCounts.get(hookKey) || 0) + 1);

    const askLine = Array.isArray(row.script.messages)
      ? [...row.script.messages].reverse().find((m) => m && m.from === "boy")
      : null;
    const askKey = normalizeText(askLine && askLine.text);
    if (askKey) askCounts.set(askKey, (askCounts.get(askKey) || 0) + 1);
  });

  rows.forEach((row) => {
    const hookKey = normalizeText(row.script.hook && row.script.hook.headline);
    if (hookKey && (hookCounts.get(hookKey) || 0) > 1) {
      row.score -= 1;
      row.reasons.push("duplicate hook family in batch");
    }
    const askLine = Array.isArray(row.script.messages)
      ? [...row.script.messages].reverse().find((m) => m && m.from === "boy")
      : null;
    const askKey = normalizeText(askLine && askLine.text);
    if (askKey && (askCounts.get(askKey) || 0) > 1) {
      row.score -= 1;
      row.reasons.push("duplicate close pattern in batch");
    }
  });
}

function selectWithArcDiversity(rows, topN) {
  const selected = [];
  const usedArcs = new Set();

  for (const row of rows) {
    if (selected.length >= topN) break;
    if (!usedArcs.has(row.arc_type)) {
      selected.push(row);
      if (row.arc_type) usedArcs.add(row.arc_type);
    }
  }
  for (const row of rows) {
    if (selected.length >= topN) break;
    if (!selected.includes(row)) selected.push(row);
  }
  return selected;
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

  const qa = JSON.parse(fs.readFileSync(qaPath, "utf8"));
  const passing = new Set((qa.results || []).filter((r) => r.pass).map((r) => r.file));

  const rows = fs
    .readdirSync(scriptsDir)
    .filter((file) => file.endsWith(".json") && passing.has(file))
    .sort()
    .map((file) => {
      const fullPath = path.join(scriptsDir, file);
      const script = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      const scored = scoreScript(script);
      return {
        file,
        video_id: script.video_id,
        arc_type: script.meta && script.meta.arc_type,
        hook_headline: script.hook && script.hook.headline,
        score: scored.score,
        reasons: scored.reasons,
        metrics: scored.metrics,
        component_scores: scored.component_scores,
        script
      };
    })
    ;

  applyBatchNoveltyAdjustments(rows);
  rows.sort((a, b) => b.score - a.score);

  const top = selectWithArcDiversity(rows, Math.max(1, args.top));
  const topForLog = top.map(({ script, ...rest }) => rest);
  const rankedForLog = rows.map(({ script, ...rest }) => rest);
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(
    path.join(logsDir, "selected-candidates.json"),
    `${JSON.stringify({ date, top_count: args.top, selected: topForLog, ranked: rankedForLog }, null, 2)}\n`,
    "utf8"
  );

  console.log(`Selected ${top.length} candidates for ${date}:`);
  top.forEach((row, idx) => {
    console.log(`${idx + 1}. ${row.file} score=${row.score} arc=${row.arc_type}`);
  });
}

if (require.main === module) {
  run();
}
