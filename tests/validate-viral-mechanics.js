const fs = require('fs');
const path = require('path');
const SUPPORTED_ARCS = ['number_exchange', 'rejection', 'plot_twist', 'cliffhanger', 'comedy', 'brainrot'];

function parseArgs(argv) {
  const args = { date: null, minTotal: 20 };
  argv.forEach((arg) => {
    if (arg.startsWith('--date=')) args.date = arg.split('=')[1];
    if (arg.startsWith('--min-total=')) args.minTotal = Number(arg.split('=')[1]);
  });
  return args;
}

function dateStamp(input) {
  if (input) return input;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function wordList(value) {
  return normalize(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(' ')
    .filter(Boolean);
}

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function levenshtein(a, b) {
  const s = normalize(a);
  const t = normalize(b);
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const dp = Array.from({ length: s.length + 1 }, () => new Array(t.length + 1).fill(0));
  for (let i = 0; i <= s.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= t.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[s.length][t.length];
}

function jaccard(a, b) {
  const setA = new Set(wordList(a));
  const setB = new Set(wordList(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  setA.forEach((token) => {
    if (setB.has(token)) intersection += 1;
  });
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function cosineSimilarity(a, b) {
  const ta = wordList(a);
  const tb = wordList(b);
  if (!ta.length || !tb.length) return 0;
  const fa = new Map();
  const fb = new Map();
  ta.forEach((t) => fa.set(t, (fa.get(t) || 0) + 1));
  tb.forEach((t) => fb.set(t, (fb.get(t) || 0) + 1));
  const all = new Set([...fa.keys(), ...fb.keys()]);
  let dot = 0;
  let na = 0;
  let nb = 0;
  all.forEach((t) => {
    const va = fa.get(t) || 0;
    const vb = fb.get(t) || 0;
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  });
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function stdev(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function extractFirstResponse(script) {
  const messages = Array.isArray(script.messages) ? script.messages : [];
  const firstGirl = messages.find((m) => m && m.from === 'girl' && Number.isFinite(m.type_at));
  if (!firstGirl) return null;
  return Number(Number(firstGirl.type_at).toFixed(2));
}

function extractFirstGap(script) {
  const messages = Array.isArray(script.messages) ? script.messages : [];
  const firstGirlIdx = messages.findIndex((m) => m && m.from === 'girl' && Number.isFinite(m.type_at));
  if (firstGirlIdx < 0) return null;
  const firstGirlTime = Number(messages[firstGirlIdx].type_at);
  for (let i = firstGirlIdx + 1; i < messages.length; i += 1) {
    const msg = messages[i];
    if (msg && msg.from === 'boy' && Number.isFinite(msg.type_at)) {
      return Number((Number(msg.type_at) - firstGirlTime).toFixed(2));
    }
  }
  return null;
}

function detectBVariant(script) {
  const meta = script.meta || {};
  if (meta.format_variant === 'short' || meta.format_variant === 'long') return meta.format_variant;
  const duration = Number(meta.duration_s || 0);
  if (duration >= 55) return 'long';
  return 'short';
}

function isDismissiveGirlLine(text) {
  const value = normalize(text);
  if (!value) return false;
  return [
    /\bnah\b/,
    /\bnot happening\b/,
    /\bnice try\b/,
    /\bpass\b/,
    /\bno\b/,
    /\bwho even\b/,
    /\bwhy\b/,
    /\bhuh\b/,
    /\bwdym\b/,
    /\bwym\b/,
    /\bcap\b/,
    /\bprove it\b/
  ].some((pattern) => pattern.test(value));
}

const GENERIC_FIRST_REACTIONS = new Set([
  'no',
  'nah',
  'pass',
  'nice try',
  'prove it',
  'who even',
  'ok',
  'k',
  'cap'
]);

function hasOpenerLinkage(hookText, firstGirlText) {
  const hookTokens = new Set(wordList(hookText).filter((t) => t.length >= 4));
  const girlTokens = wordList(firstGirlText).filter((t) => t.length >= 3);
  const overlap = girlTokens.some((t) => hookTokens.has(t));
  if (overlap) return true;
  const normalizedGirl = normalize(firstGirlText);
  if (/\b(what|how|why|huh|wait|excuse|serious)\b/.test(normalizedGirl)) return true;
  if (/\?/.test(normalizedGirl)) return true;
  return false;
}

function classifyOpenerIntensity(hookText) {
  const normalized = normalize(hookText);
  if (!normalized) return 'neutral';
  if (/(you( are|'re)?\s+mid|taste as good|inside out|thighs|earmuffs|criminal|lawsuit|pressing charges|ruined|dangerous|i need yall both)/.test(normalized)) {
    return 'challenge_heavy';
  }
  if (/(bet|dare|complaint|sue|suing|question|how|why|\?)/.test(normalized)) {
    return 'provocative';
  }
  return 'neutral';
}

function requiredResistanceRun(hookText, variant) {
  const base = variant === 'long' ? 3 : 2;
  const intensity = classifyOpenerIntensity(hookText);
  if (intensity === 'challenge_heavy') return base;
  if (intensity === 'provocative') return Math.max(1, base - 1);
  return 1;
}

function arcIntegrityPass(script) {
  const arc = script.meta && script.meta.arc_type;
  const messages = Array.isArray(script.messages) ? script.messages : [];
  if (!arc || messages.length === 0) return false;

  const hasNumber = messages.some((m) => /\b555\s?\d{3}\s?\d{4}\b/.test(String((m && m.text) || '')));
  const last = messages[messages.length - 1] || {};
  const lastText = normalize(last.text);
  const thread = normalize(messages.map((m) => (m ? m.text : '')).join(' '));

  if (arc === 'number_exchange') {
    // Keep this validator aligned with shared QA: phone drop is the hard requirement.
    return hasNumber;
  }
  if (arc === 'rejection') {
    if (hasNumber) return false;
    return /(not|no|nah|pass|nice try|not gonna happen|not happening|no shot|good luck|hard pass|i'm good|not for me|yeah no|keeping it moving|i don't think so|that's a no)/.test(lastText);
  }
  if (arc === 'plot_twist') {
    if (hasNumber) return false;
    return /(testing|dated|set this up|set it up|not an accident|already knew|been watching|been following|on purpose|now you know|here we are|surprise|anyway|now what|twist|actually|btw|by the way)/.test(thread);
  }
  if (arc === 'cliffhanger') {
    if (hasNumber) return false;
    return !/(deal|youre on|you're on|don't be late|impress me|see you|lets go|locked in)/.test(lastText);
  }
  if (arc === 'comedy') {
    // Comedy can optionally include a phone (comedy_number sub-ending), but should end on a playful reaction.
    return /(lol|lmao|😭|😂|funny|wild|crazy|insane|unhinged|weird|stop|chill|dead|done)/.test(thread);
  }
  if (arc === 'brainrot') {
    // Brainrot requires both sides in conversation and the brainrot-specific beat plan.
    const hasBoy = messages.some((m) => m && m.from === 'boy');
    const hasGirl = messages.some((m) => m && m.from === 'girl');
    const beatPlan = (script.meta && script.meta.beat_plan) || script.beat_plan || {};
    return hasBoy && hasGirl && messages.length >= 4 && Boolean(beatPlan.shareable_moment);
  }
  return false;
}

function evaluateBand(actual, passMin, passMax, warnMin, warnMax) {
  if (actual >= passMin && actual <= passMax) return 'PASS';
  if (actual >= warnMin && actual <= warnMax) return 'WARN';
  return 'FAIL';
}

function loadConfig(rootDir) {
  const configPath = path.join(rootDir, 'config.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    return {};
  }
}

function buildArcBands(count, distribution) {
  // Keep historical tolerance for production-scale batches while scaling down safely.
  const tol = count >= 20 ? 2 : Math.max(1, Math.round(count * 0.10));
  const pass = {};
  const warn = {};
  Object.keys(distribution).forEach((arc) => {
    const expected = Math.round(count * distribution[arc]);
    pass[arc] = [Math.max(0, expected - tol), expected + tol];
    warn[arc] = [Math.max(0, expected - (tol + 1)), expected + (tol + 1)];
  });
  return { pass, warn };
}

function evalCountBandGate(counts, passBands, warnBands) {
  let status = 'PASS';
  Object.keys(passBands).forEach((k) => {
    const actual = counts[k] || 0;
    const [pMin, pMax] = passBands[k];
    const [wMin, wMax] = warnBands[k];
    const band = evaluateBand(actual, pMin, pMax, wMin, wMax);
    if (band === 'FAIL') status = 'FAIL';
    else if (band === 'WARN' && status === 'PASS') status = 'WARN';
  });
  return status;
}

function evaluateTimingVariance(responseStdev, gapStdev, sampleSize) {
  // Variance is noisy on tiny batches; keep this as advisory until sample is reasonable.
  if (sampleSize < 6) {
    if (responseStdev < 0.7 || gapStdev < 0.7) return 'WARN';
    return 'PASS';
  }
  if (sampleSize < 12) {
    if (responseStdev < 0.8 || gapStdev < 0.8) return 'FAIL';
    if (responseStdev < 1.2 || gapStdev < 1.2) return 'WARN';
    return 'PASS';
  }
  if (responseStdev < 1.0 || gapStdev < 1.0) return 'FAIL';
  if (responseStdev < 1.5 || gapStdev < 1.5) return 'WARN';
  return 'PASS';
}

function run() {
  const rootDir = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const date = dateStamp(args.date);
  const config = loadConfig(rootDir);
  const scriptsDir = path.join(rootDir, 'scripts', date);
  const logsDir = path.join(rootDir, 'logs', date);

  if (!fs.existsSync(scriptsDir)) {
    console.error(`Missing scripts directory: ${scriptsDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.json')).sort();
  const scripts = files.map((file) => ({
    file,
    script: JSON.parse(fs.readFileSync(path.join(scriptsDir, file), 'utf8'))
  }));

  const gateResults = {};
  const failures = [];
  const warnings = [];

  const hooks = [];
  const firstResponseValues = [];
  const firstGapValues = [];
  const defaultArcDistribution = {
    number_exchange: 0.60,
    rejection: 0.20,
    plot_twist: 0.03,
    cliffhanger: 0.17,
    comedy: 0
  };
  const configuredArcDistribution = {
    ...defaultArcDistribution,
    ...(config.arc_distribution || {})
  };
  const enabledArcs = new Set(
    Object.keys(configuredArcDistribution).filter((arc) => Number(configuredArcDistribution[arc]) > 0)
  );
  const allowedArcs = new Set(SUPPORTED_ARCS);
  const arcCounts = {};
  Array.from(enabledArcs).forEach((arc) => {
    arcCounts[arc] = 0;
  });
  const controversyCounts = { safe: 0, spicy: 0, edge: 0 };
  const spiceCounts = { low: 0, medium: 0, high: 0 };
  const archetypeCounts = {};
  const durationRows = [];
  const densityRows = [];
  const scriptViolations = [];

  scripts.forEach(({ file, script }) => {
    const where = `(${file})`;
    const meta = script.meta || {};
    const messages = Array.isArray(script.messages) ? script.messages : [];
    const duration = Number(meta.duration_s || 0);
    const format = meta.format || 'B';

    const hookText = normalize(script.reply && script.reply.text);
    hooks.push({ file, text: hookText });

    const firstResponse = extractFirstResponse(script);
    const firstGap = extractFirstGap(script);
    if (typeof firstResponse === 'number') firstResponseValues.push(firstResponse);
    if (typeof firstGap === 'number') firstGapValues.push(firstGap);

    const arc = meta.arc_type;
    if (!allowedArcs.has(arc)) scriptViolations.push(`invalid arc_type ${where}: ${arc}`);
    if (arcCounts[arc] !== undefined) arcCounts[arc] += 1;
    if (controversyCounts[meta.controversy_tier] !== undefined) {
      controversyCounts[meta.controversy_tier] += 1;
    } else {
      scriptViolations.push(`invalid controversy_tier ${where}`);
    }
    if (spiceCounts[meta.spice_tier] !== undefined) {
      spiceCounts[meta.spice_tier] += 1;
    } else {
      scriptViolations.push(`invalid spice_tier ${where}`);
    }

    const archetype = normalize(meta.girl_archetype || (script.persona && script.persona.girl && script.persona.girl.tone) || '');
    if (archetype) archetypeCounts[archetype] = (archetypeCounts[archetype] || 0) + 1;

    if (format === 'B') {
      const variant = detectBVariant(script);
      durationRows.push({ where, duration, variant });
      const density = duration > 0 ? messages.length / duration : 0;
      densityRows.push({ where, density, variant });
    }

    if (!arcIntegrityPass(script)) {
      scriptViolations.push(`arc integrity failed ${where}`);
    }

    if (!meta.conversation_mode || !['cumulative', 'pair_isolated'].includes(meta.conversation_mode)) {
      scriptViolations.push(`missing/invalid conversation_mode ${where}`);
    }

    const beatPlan = meta.beat_plan || script.beat_plan || {};
    const arcType = meta.arc_type;
    if (arcType !== 'brainrot') {
      const markerKeys =
        arcType === 'comedy'
          ? ['hook', 'escalation', 'close']
          : ['hook', 'test', 'escalation', 'shift', 'close'];
      const markerMissing = markerKeys.filter((k) => !String(beatPlan[k] || '').trim()).length;
      if (markerMissing > 0) {
        scriptViolations.push(`missing beat markers (${markerKeys.filter((k) => !String(beatPlan[k] || '').trim()).join(',')}) ${where}`);
      }
    }

    const firstGirl = messages.find((m) => m && m.from === 'girl');
    if (firstGirl) {
      const wc = wordCount(firstGirl.text);
      if (wc > 8) scriptViolations.push(`girl-first-response too long (${wc} words) ${where}`);
      else if (wc > 5) warnings.push(`girl-first-response warn (${wc} words) ${where}`);
      const normalizedFirst = normalize(firstGirl.text);
      if (GENERIC_FIRST_REACTIONS.has(normalizedFirst)) {
        scriptViolations.push(`girl-first-response generic template (${normalizedFirst}) ${where}`);
      }
      const hookText = normalize(script.reply && script.reply.text);
      if (!hasOpenerLinkage(hookText, firstGirl.text || '')) {
        warnings.push(`girl-first-response opener-linkage weak ${where}`);
      }
    }

    const hookWords = wordCount(script.reply && script.reply.text);
    if (hookWords > 15) {
      scriptViolations.push(`hook too long (${hookWords} words) ${where}`);
    }
    const hookNorm = normalize(script.reply && script.reply.text);
    const provocative = /(\?|\bwhy\b|\bhow\b|\bwould\b|\bbet\b|\bdare\b|\bcomplaint\b|\bsuing\b|\bpressing charges\b|\bquick question\b)/.test(hookNorm);
    if (!provocative) warnings.push(`hook-quality borderline ${where}`);

    const firstThree = messages.slice(0, 3).map((m) => normalize(m && m.text)).join(' ');
    const captionTokens = wordList((script.story && script.story.caption) || '').filter((t) => t.length >= 4);
    const grounded = captionTokens.some((token) => firstThree.includes(token));
    if (!grounded) warnings.push(`image-grounding missing ${where}`);

    const arcTypeForChecks = meta.arc_type;
    if (arcTypeForChecks === 'rejection') {
      const tail = messages.slice(-3).map((m) => normalize(m && m.text)).join(' ');
      if (/\b555\s?\d{3}\s?\d{4}\b/.test(tail)) {
        scriptViolations.push(`rejection ending contains number ${where}`);
      }
    }
    if (arcTypeForChecks === 'cliffhanger') {
      const tail = normalize(messages.slice(-2).map((m) => (m ? m.text : '')).join(' '));
      if (/(see you|locked in|deal|youre on|you're on|text me)/.test(tail)) {
        scriptViolations.push(`cliffhanger resolved cleanly ${where}`);
      }
    }

    const shiftIndex = Number.isFinite(script.beats && script.beats.reveal_index) ? script.beats.reveal_index : -1;
    const beforeShift = shiftIndex > 0 ? messages.slice(0, shiftIndex) : messages;
    let current = 0;
    let maxRun = 0;
    beforeShift.forEach((m) => {
      if (m && m.from === 'girl' && isDismissiveGirlLine(m.text)) {
        current += 1;
        if (current > maxRun) maxRun = current;
      } else if (m && m.from === 'girl') {
        current = 0;
      }
    });
    const variant = detectBVariant(script);
    const threshold = requiredResistanceRun(script.reply && script.reply.text, variant);
    if (arcTypeForChecks !== 'comedy') {
      if (maxRun < threshold - 1) scriptViolations.push(`resistance-beat fail (max_run=${maxRun}, need>=${threshold - 1}) ${where}`);
      else if (maxRun < threshold) warnings.push(`resistance-beat warn (max_run=${maxRun}, need>=${threshold}) ${where}`);
    }
  });

  if (files.length < args.minTotal) {
    scriptViolations.push(`validation batch too small: ${files.length} < ${args.minTotal}`);
  }

  // Gate 2 Arc-integrity + distribution banding (scales by batch size)
  const normalizedArcDistribution = {};
  Array.from(enabledArcs).forEach((arc) => {
    const value = Number(configuredArcDistribution[arc]);
    normalizedArcDistribution[arc] = Number.isFinite(value) ? value : 0;
  });
  const arcBands = buildArcBands(files.length, normalizedArcDistribution);
  let gate2Status = evalCountBandGate(arcCounts, arcBands.pass, arcBands.warn);
  if (scriptViolations.some((v) => v.includes('arc integrity failed'))) gate2Status = 'FAIL';
  gateResults['2_arc_integrity'] = {
    status: gate2Status,
    arc_counts: arcCounts,
    expected_distribution: normalizedArcDistribution,
    pass_bands: arcBands.pass,
    warn_bands: arcBands.warn
  };

  // Gate 3 Hook lexical uniqueness
  let minHookDistance = 1;
  let hasExactDupHook = false;
  for (let i = 0; i < hooks.length; i += 1) {
    for (let j = i + 1; j < hooks.length; j += 1) {
      const a = hooks[i].text;
      const b = hooks[j].text;
      if (!a && !b) continue;
      if (a === b) hasExactDupHook = true;
      const dist = levenshtein(a, b) / Math.max(1, Math.max(a.length, b.length));
      if (dist < minHookDistance) minHookDistance = dist;
    }
  }
  const gate3Status = hasExactDupHook || minHookDistance < 0.25 ? 'FAIL' : minHookDistance < 0.35 ? 'WARN' : 'PASS';
  gateResults['3_hook_uniqueness_lexical'] = { status: gate3Status, min_normalized_edit_distance: Number(minHookDistance.toFixed(3)) };

  // Gate 4/5 distributions
  function buildTierBands(count, distribution) {
    const tol = count >= 20 ? 2 : Math.ceil(count * 0.10);
    const pass = {};
    const warn = {};
    Object.keys(distribution).forEach((k) => {
      const expected = Math.round(count * distribution[k]);
      pass[k] = [Math.max(0, expected - tol), expected + tol];
      warn[k] = [Math.max(0, expected - (tol + 1)), expected + (tol + 1)];
    });
    return { pass, warn };
  }
  const controversyBands = buildTierBands(
    files.length,
    config.controversy_tier_distribution || { safe: 0.45, spicy: 0.40, edge: 0.15 }
  );
  const spiceBands = buildTierBands(
    files.length,
    config.spice_distribution || { low: 0.35, medium: 0.45, high: 0.20 }
  );
  gateResults['4_controversy_tier'] = {
    status: evalCountBandGate(controversyCounts, controversyBands.pass, controversyBands.warn),
    controversy_counts: controversyCounts
  };
  gateResults['5_spice_tier'] = {
    status: evalCountBandGate(spiceCounts, spiceBands.pass, spiceBands.warn),
    spice_counts: spiceCounts
  };

  // Gate 6 Duration compliance
  let gate6Status = 'PASS';
  durationRows.forEach((row) => {
    const d = row.duration;
    if (d < 15 || d > 90) {
      gate6Status = 'FAIL';
      failures.push(`duration fail ${row.where} (${d}s)`);
      return;
    }
    if (row.variant === 'short') {
      if (d < 17 || d > 28) gate6Status = gate6Status === 'PASS' ? 'WARN' : gate6Status;
    } else if (row.variant === 'long') {
      if (d < 28 || d > 45) gate6Status = gate6Status === 'PASS' ? 'WARN' : gate6Status;
    }
  });
  gateResults['6_duration_compliance'] = { status: gate6Status };

  // Gate 7 declaration (script side only)
  const missingMode = scriptViolations.filter((v) => v.includes('conversation_mode')).length;
  gateResults['7_threading_mode_declaration'] = {
    status: missingMode > 0 ? 'FAIL' : 'PASS',
    missing_or_invalid_count: missingMode
  };

  // Gate 8 message density
  let gate8Status = 'PASS';
  densityRows.forEach((row) => {
    const d = row.density;
    if (row.variant === 'short') {
      const s = evaluateBand(d, 0.20, 0.45, 0.15, 0.55);
      if (s === 'FAIL') gate8Status = 'FAIL';
      else if (s === 'WARN' && gate8Status === 'PASS') gate8Status = 'WARN';
    } else {
      const s = evaluateBand(d, 0.10, 0.25, 0.08, 0.30);
      if (s === 'FAIL') gate8Status = 'FAIL';
      else if (s === 'WARN' && gate8Status === 'PASS') gate8Status = 'WARN';
    }
  });
  gateResults['8_message_density'] = { status: gate8Status };

  // Gate 10 timing variance
  const responseStdev = stdev(firstResponseValues);
  const gapStdev = stdev(firstGapValues);
  const gate10Status = evaluateTimingVariance(responseStdev, gapStdev, files.length);
  gateResults['10_timing_variance'] = {
    status: gate10Status,
    sample_size: files.length,
    first_response_stdev: Number(responseStdev.toFixed(3)),
    first_gap_stdev: Number(gapStdev.toFixed(3))
  };

  // Gate 11 archetype diversity
  const archetypeEntries = Object.entries(archetypeCounts).sort((a, b) => b[1] - a[1]);
  const topShare = files.length > 0 && archetypeEntries.length > 0 ? archetypeEntries[0][1] / files.length : 1;
  let gate11Status = 'PASS';
  if (archetypeEntries.length < 2 || topShare > 0.6) gate11Status = 'FAIL';
  else if (Math.abs(topShare - 0.6) < 0.0001) gate11Status = 'WARN';
  gateResults['11_archetype_diversity'] = {
    status: gate11Status,
    archetype_counts: archetypeCounts,
    top_share_pct: Number((topShare * 100).toFixed(1))
  };

  // Gate 12 dialogue uniqueness
  const girlTail = scripts.map(({ file, script }) => {
    const girls = (script.messages || []).filter((m) => m && m.from === 'girl').slice(-2);
    return { file, text: normalize(girls.map((m) => m.text).join(' ')) };
  });
  const firstGirlOpeners = scripts
    .map(({ script }) => {
      const firstGirl = (script.messages || []).find((m) => m && m.from === "girl");
      return normalize(firstGirl && firstGirl.text);
    })
    .filter(Boolean);
  const openerCounts = {};
  firstGirlOpeners.forEach((opener) => {
    openerCounts[opener] = (openerCounts[opener] || 0) + 1;
  });
  const openerTopCount = Object.values(openerCounts).reduce((max, value) => Math.max(max, value), 0);
  let gate12Status = 'PASS';
  for (let i = 0; i < girlTail.length; i += 1) {
    for (let j = i + 1; j < girlTail.length; j += 1) {
      if (girlTail[i].text && girlTail[i].text === girlTail[j].text) {
        gate12Status = 'FAIL';
      }
      const sim = jaccard(girlTail[i].text, girlTail[j].text);
      if (sim > 0.70) gate12Status = 'FAIL';
      else if (sim >= 0.60 && gate12Status === 'PASS') gate12Status = 'WARN';
    }
  }
  if (openerTopCount > 2) gate12Status = 'FAIL';
  else if (openerTopCount > 1 && gate12Status === 'PASS') gate12Status = 'WARN';
  gateResults['12_dialogue_uniqueness'] = {
    status: gate12Status,
    first_girl_opener_top_count: openerTopCount
  };

  // Gate 13 image-grounding
  const groundedCount = scripts.filter(({ script }) => {
    const messages = Array.isArray(script.messages) ? script.messages : [];
    const firstThree = messages.slice(0, 3).map((m) => normalize(m && m.text)).join(' ');
    const captionTokens = wordList((script.story && script.story.caption) || '').filter((t) => t.length >= 4);
    return captionTokens.some((token) => firstThree.includes(token));
  }).length;
  const groundedPct = files.length > 0 ? groundedCount / files.length : 0;
  const gate13Status = groundedPct < 0.40 ? 'FAIL' : groundedPct < 0.50 ? 'WARN' : 'PASS';
  gateResults['13_image_grounding'] = {
    status: gate13Status,
    grounded_count: groundedCount,
    grounded_pct: Number((groundedPct * 100).toFixed(1))
  };

  // Gate 14 beat structure
  const beatIssues = scriptViolations.filter((v) => v.includes('beat markers')).length;
  gateResults['14_beat_structure'] = { status: beatIssues > 0 ? 'FAIL' : 'PASS', missing_marker_count: beatIssues };

  // Gate 15 hook quality
  const hookTooLong = scriptViolations.filter((v) => v.includes('hook too long')).length;
  const borderlineHook = warnings.filter((v) => v.includes('hook-quality borderline')).length;
  const gate15Status = hookTooLong > 0 ? 'FAIL' : borderlineHook > 0 ? 'WARN' : 'PASS';
  gateResults['15_hook_quality'] = { status: gate15Status, hook_too_long_count: hookTooLong, borderline_count: borderlineHook };

  // Gate 16 semantic uniqueness (embedding proxy via cosine)
  let maxCosine = 0;
  for (let i = 0; i < hooks.length; i += 1) {
    for (let j = i + 1; j < hooks.length; j += 1) {
      const c = cosineSimilarity(hooks[i].text, hooks[j].text);
      if (c > maxCosine) maxCosine = c;
    }
  }
  const gate16Status = maxCosine >= 0.65 ? 'FAIL' : maxCosine >= 0.50 ? 'WARN' : 'PASS';
  gateResults['16_hook_semantic_uniqueness'] = { status: gate16Status, max_cosine: Number(maxCosine.toFixed(3)) };

  // Gate 17 first girl response length
  const firstGirlHard = scriptViolations.filter((v) => v.includes('girl-first-response too long')).length;
  const firstGirlWarn = warnings.filter((v) => v.includes('girl-first-response warn')).length;
  const gate17Status = firstGirlHard > 0 ? 'FAIL' : firstGirlWarn > 0 ? 'WARN' : 'PASS';
  gateResults['17_girl_first_response'] = { status: gate17Status, fail_count: firstGirlHard, warn_count: firstGirlWarn };

  // Gate 19 ending variety
  const endingIssues = scriptViolations.filter((v) => v.includes('ending contains number') || v.includes('cliffhanger resolved')).length;
  gateResults['19_ending_variety'] = { status: endingIssues > 0 ? 'FAIL' : 'PASS', fail_count: endingIssues };

  // Gate 20 authenticity
  const allMessages = scripts.flatMap(({ script }) => Array.isArray(script.messages) ? script.messages : []);
  const startsCapitalized = allMessages.filter((m) => /^[A-Z]/.test(String((m && m.text) || '').trim())).length;
  const endsPeriod = allMessages.filter((m) => /\.$/.test(String((m && m.text) || '').trim())).length;
  const totalMessages = Math.max(1, allMessages.length);
  const capitalizedPct = (startsCapitalized / totalMessages) * 100;
  const periodPct = (endsPeriod / totalMessages) * 100;
  const gate20Status = capitalizedPct >= 30 || periodPct >= 20 ? 'FAIL' : capitalizedPct >= 25 || periodPct >= 15 ? 'WARN' : 'PASS';
  gateResults['20_authenticity'] = {
    status: gate20Status,
    capitalized_start_pct: Number(capitalizedPct.toFixed(1)),
    period_end_pct: Number(periodPct.toFixed(1))
  };

  // Gate 22 resistance beat
  const resistanceFail = scriptViolations.filter((v) => v.includes('resistance-beat fail')).length;
  const resistanceWarn = warnings.filter((v) => v.includes('resistance-beat warn')).length;
  gateResults['22_resistance_beat'] = {
    status: resistanceFail > 0 ? 'FAIL' : resistanceWarn > 0 ? 'WARN' : 'PASS',
    fail_count: resistanceFail,
    warn_count: resistanceWarn
  };

  // Render-tier gates are not evaluated in this script
  gateResults['1_hook_visibility'] = { status: 'WARN', note: 'render-tier gate; evaluate in render/CV stage' };
  gateResults['9_clip_cadence'] = { status: 'WARN', note: 'render-tier gate; evaluate in render/CV stage' };
  gateResults['18_clip_overlay'] = { status: 'WARN', note: 'render-tier gate; evaluate in render/CV stage' };
  gateResults['21_visual_structure'] = { status: 'WARN', note: 'render-tier gate; evaluate in render/CV stage' };

  scriptViolations.forEach((v) => failures.push(v));

  Object.entries(gateResults).forEach(([gate, result]) => {
    if (!result || !result.status) return;
    if (result.status === 'FAIL') failures.push(`gate fail: ${gate}`);
    if (result.status === 'WARN') warnings.push(`gate warn: ${gate}`);
  });

  const report = {
    date,
    total_scripts: files.length,
    arc_counts: arcCounts,
    controversy_counts: controversyCounts,
    spice_counts: spiceCounts,
    first_response: {
      values: firstResponseValues,
      stdev: Number(stdev(firstResponseValues).toFixed(3))
    },
    first_gap: {
      values: firstGapValues,
      stdev: Number(stdev(firstGapValues).toFixed(3)),
      soft_penalty_count_gt_3_5: firstGapValues.filter((v) => v > 3.5).length,
      hard_fail_count_gt_4_8: firstGapValues.filter((v) => v > 4.8).length,
      absolute_fail_count_gt_5_5: firstGapValues.filter((v) => v > 5.5).length
    },
    gate_results: gateResults,
    failure_count: failures.length,
    warn_count: warnings.length,
    failures,
    warnings
  };

  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(
    path.join(logsDir, 'validate-viral-mechanics.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  if (failures.length > 0) {
    console.error('validate-viral-mechanics failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log('validate-viral-mechanics passed');
}

if (require.main === module) {
  run();
}
