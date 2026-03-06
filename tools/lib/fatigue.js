const fs = require("fs");
const path = require("path");
const { createRng, pickWeighted } = require("./utils");

const DEFAULT_HOOK_DISTRIBUTION = {
  cold_open_bold: 0.2,
  situation_reveal: 0.2,
  compliment_opener: 0.15,
  challenge_opener: 0.15,
  callback_opener: 0.1,
  legal_complaint: 0.1,
  other: 0.1
};

const DEFAULT_PAYOFF_DISTRIBUTION = {
  number_drop: 0.2,
  soft_rejection_pivot: 0.15,
  hard_rejection: 0.1,
  vulnerability_close: 0.15,
  twist_reveal: 0.15,
  cliffhanger_exit: 0.15,
  comedic_exit: 0.1
};

const DEFAULT_TEMPLATE_DISTRIBUTION = {
  "T-01": 0.1,
  "T-02": 0.1,
  "T-03": 0.1,
  "T-04": 0.1,
  "T-05": 0.1,
  "T-06": 0.1,
  "T-07": 0.1,
  "T-08": 0.1,
  "T-09": 0.1,
  "T-10": 0.1
};

function toCapKey(violatedCap) {
  switch (violatedCap) {
    case "hook_type":
      return "hook_type";
    case "payoff_type":
      return "payoff_type";
    case "template_id":
      return "template_id";
    case "mechanic_combo":
      return "mechanic_combo";
    case "format_wrapper":
      return "format_wrapper";
    default:
      return violatedCap;
  }
}

function computeCaps(dailyCount) {
  const n = Math.max(1, Number(dailyCount) || 1);
  return {
    daily_count: n,
    hook_type: Math.max(1, Math.ceil(n * 0.2)),
    payoff_type: Math.max(1, Math.ceil(n * 0.3)),
    template_id: Math.max(1, Math.ceil(n * 0.2)),
    mechanic_combo: Math.max(1, Math.ceil(n * 0.2)),
    format_wrapper: Math.max(1, Math.ceil(n * 0.4))
  };
}

function expandByWeight(distribution, totalSlots, rng) {
  const entries = Object.entries(distribution || {}).filter(([, weight]) => Number(weight) > 0);
  if (entries.length === 0 || totalSlots <= 0) return [];
  const weighted = entries.map(([key, weight]) => ({
    key,
    raw: Number(weight) * totalSlots
  }));
  const base = weighted.map((row) => ({
    key: row.key,
    count: Math.floor(row.raw),
    frac: row.raw - Math.floor(row.raw)
  }));
  let assigned = base.reduce((sum, row) => sum + row.count, 0);
  const sortedForRemainder = [...base].sort((a, b) => {
    if (b.frac !== a.frac) return b.frac - a.frac;
    return a.key.localeCompare(b.key);
  });
  for (let i = 0; assigned < totalSlots && i < sortedForRemainder.length; i += 1) {
    sortedForRemainder[i].count += 1;
    assigned += 1;
  }

  const counts = {};
  sortedForRemainder.forEach((row) => {
    counts[row.key] = row.count;
  });

  const expanded = [];
  Object.keys(counts)
    .sort((a, b) => a.localeCompare(b))
    .forEach((key) => {
      for (let i = 0; i < counts[key]; i += 1) expanded.push(key);
    });

  // Deterministic shuffle by provided RNG.
  for (let i = expanded.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [expanded[i], expanded[j]] = [expanded[j], expanded[i]];
  }
  return expanded;
}

function keyForMechanicCombo(mechanicIds) {
  return (Array.isArray(mechanicIds) ? [...mechanicIds] : [])
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join("+");
}

function keyForFormatWrapper(format, formatVariant) {
  return `${String(format || "")}-${String(formatVariant || "")}`;
}

function emptyCounters() {
  return {
    hook_type: {},
    payoff_type: {},
    template_id: {},
    mechanic_combo: {},
    format_wrapper: {}
  };
}

function checkFatigueCaps(slateItem, counters, caps) {
  const safeCounters = counters || emptyCounters();
  const hookType = slateItem && slateItem.hook_type;
  const payoffType = slateItem && slateItem.payoff_type;
  const templateId = slateItem && slateItem.template_id;
  const mechanicCombo = keyForMechanicCombo(slateItem && slateItem.mechanic_ids);
  const formatWrapper = keyForFormatWrapper(slateItem && slateItem.format, slateItem && slateItem.format_variant);

  if ((safeCounters.hook_type[hookType] || 0) + 1 > caps.hook_type) {
    return { allowed: false, violated_cap: "hook_type" };
  }
  if ((safeCounters.payoff_type[payoffType] || 0) + 1 > caps.payoff_type) {
    return { allowed: false, violated_cap: "payoff_type" };
  }
  if ((safeCounters.template_id[templateId] || 0) + 1 > caps.template_id) {
    return { allowed: false, violated_cap: "template_id" };
  }
  if ((safeCounters.mechanic_combo[mechanicCombo] || 0) + 1 > caps.mechanic_combo) {
    return { allowed: false, violated_cap: "mechanic_combo" };
  }
  if ((safeCounters.format_wrapper[formatWrapper] || 0) + 1 > caps.format_wrapper) {
    return { allowed: false, violated_cap: "format_wrapper" };
  }
  return { allowed: true, violated_cap: null };
}

function hashTextToTemplateId(text) {
  const value = String(text || "");
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const idx = (hash >>> 0) % 10;
  return `T-${String(idx + 1).padStart(2, "0")}`;
}

function classifyHookType(script) {
  const source =
    (script && script.meta && script.meta.hook_type) ||
    (script && script.reply && script.reply.text) ||
    "";
  const text = String(source).toLowerCase();
  if (!text) return "other";
  if (/\b(mommy|i need yall both|bet you|watch me|im suing|lawsuit|complaint|pressing charges)\b/.test(text)) {
    if (/\b(suing|lawsuit|complaint|charges|report)\b/.test(text)) return "legal_complaint";
    return "cold_open_bold";
  }
  if (/\b(ex|btw|plot twist|confession|actually|turns out)\b/.test(text)) return "situation_reveal";
  if (/\b(pretty|cute|beautiful|look good|you look|fine as)\b/.test(text)) return "compliment_opener";
  if (/\b(dare|bet you wont|prove it|challenge|cant handle)\b/.test(text)) return "challenge_opener";
  if (/\b(again|last time|still|already told|callback|remember)\b/.test(text)) return "callback_opener";
  return "other";
}

function classifyPayoffType(script) {
  const messages = Array.isArray(script && script.messages) ? script.messages : [];
  const tail = messages.slice(-4).map((msg) => String((msg && msg.text) || "").toLowerCase()).join(" ");
  const finalLine = String((messages[messages.length - 1] && messages[messages.length - 1].text) || "").toLowerCase();
  if (!tail) return "other";
  if (/\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b/.test(tail) || /\b(insta|ig|snap|@)\b/.test(tail)) {
    return "number_drop";
  }
  if (/\b(we'?ll see|not yet|maybe maybe not|find out)\b/.test(finalLine)) return "cliffhanger_exit";
  if (/\b(nah|pass|no shot|im good|not for me|hard pass|yeah no)\b/.test(finalLine)) {
    if (/\b(maybe|for now|yet)\b/.test(finalLine)) return "soft_rejection_pivot";
    return "hard_rejection";
  }
  if (/\b(i'?m nervous|ngl|low key|honest|real with you)\b/.test(finalLine)) return "vulnerability_close";
  if (/\b(plot twist|turns out|actually|surprise|ex)\b/.test(tail)) return "twist_reveal";
  if (/\b(lmao|lol|funny|unhinged|i hate that i laughed|joke)\b/.test(finalLine)) return "comedic_exit";
  return "other";
}

function classifyMechanicIds(script, hookType, payoffType) {
  const arcType = String(script && script.meta && script.meta.arc_type || "other");
  const format = String(script && script.meta && script.meta.format || "B");
  return [
    `M-ARC-${arcType}`,
    `M-HOOK-${hookType}`,
    `M-PAYOFF-${payoffType}`,
    `M-FMT-${format}`
  ];
}

function deriveFatigueMeta(script) {
  const hookType = classifyHookType(script);
  const payoffType = classifyPayoffType(script);
  const templateId = hashTextToTemplateId(
    `${script && script.meta && script.meta.arc_type}:${script && script.reply && script.reply.text}`
  );
  const mechanicIds = classifyMechanicIds(script, hookType, payoffType);
  return { hookType, payoffType, templateId, mechanicIds };
}

function weightedPick(distribution, rng) {
  const safe = distribution && Object.keys(distribution).length ? distribution : { other: 1 };
  return pickWeighted(rng, safe);
}

function sampleFormatVariant({ format, config, rng }) {
  if (format === "D") return "standard";
  if (format !== "B") return "standard";
  const mix = (config && config.format_b_duration_mix) || {};
  const weights = {};
  Object.entries(mix).forEach(([key, value]) => {
    const weight = Number(value && value.weight);
    if (weight > 0) weights[key] = weight;
  });
  if (!Object.keys(weights).length) return "short";
  return weightedPick(weights, rng);
}

function sampleSlateItem(config, slotSeed, slotIndex) {
  const rng = createRng(slotSeed);
  const arcType = weightedPick((config && config.arc_distribution) || { number_exchange: 1 }, rng);
  const format = weightedPick((config && config.format_distribution) || { B: 1 }, rng);
  const formatVariant = sampleFormatVariant({ format, config, rng });
  const hookType = weightedPick(
    (config && config.fatigue && config.fatigue.hook_type_distribution) || DEFAULT_HOOK_DISTRIBUTION,
    rng
  );
  const payoffType = weightedPick(
    (config && config.fatigue && config.fatigue.payoff_type_distribution) || DEFAULT_PAYOFF_DISTRIBUTION,
    rng
  );
  const templateId = weightedPick(
    (config && config.fatigue && config.fatigue.template_distribution) || DEFAULT_TEMPLATE_DISTRIBUTION,
    rng
  );
  const mechanicIds = [
    `M-ARC-${arcType}`,
    `M-HOOK-${hookType}`,
    `M-PAYOFF-${payoffType}`
  ];

  return {
    slot_index: slotIndex,
    arc_type: arcType,
    format,
    format_variant: formatVariant,
    hook_type: hookType,
    payoff_type: payoffType,
    template_id: templateId,
    mechanic_ids: mechanicIds,
    run_seed: slotSeed
  };
}

function sampleSlateItemExcluding(config, slotSeed, slotIndex, violatedCap) {
  const rng = createRng(`${slotSeed}-${violatedCap || "none"}`);
  const candidate = sampleSlateItem(config, slotSeed, slotIndex);

  if (violatedCap === "hook_type") {
    const keys = Object.keys((config && config.fatigue && config.fatigue.hook_type_distribution) || DEFAULT_HOOK_DISTRIBUTION);
    if (keys.length) candidate.hook_type = keys[Math.floor(rng() * keys.length)];
  }
  if (violatedCap === "payoff_type") {
    const keys = Object.keys((config && config.fatigue && config.fatigue.payoff_type_distribution) || DEFAULT_PAYOFF_DISTRIBUTION);
    if (keys.length) candidate.payoff_type = keys[Math.floor(rng() * keys.length)];
  }
  if (violatedCap === "template_id") {
    const keys = Object.keys((config && config.fatigue && config.fatigue.template_distribution) || DEFAULT_TEMPLATE_DISTRIBUTION);
    if (keys.length) candidate.template_id = keys[Math.floor(rng() * keys.length)];
  }
  if (violatedCap === "mechanic_combo") {
    const tail = Math.floor(rng() * 99) + 1;
    candidate.mechanic_ids = [candidate.mechanic_ids[0], `M-RAND-${String(tail).padStart(2, "0")}`];
  }
  if (violatedCap === "format_wrapper") {
    candidate.format = candidate.format === "B" ? "D" : "B";
    candidate.format_variant = sampleFormatVariant({ format: candidate.format, config, rng });
  }

  return candidate;
}

function incrementCounters(candidate, counters) {
  counters.hook_type[candidate.hook_type] = (counters.hook_type[candidate.hook_type] || 0) + 1;
  counters.payoff_type[candidate.payoff_type] = (counters.payoff_type[candidate.payoff_type] || 0) + 1;
  counters.template_id[candidate.template_id] = (counters.template_id[candidate.template_id] || 0) + 1;
  const comboKey = keyForMechanicCombo(candidate.mechanic_ids);
  counters.mechanic_combo[comboKey] = (counters.mechanic_combo[comboKey] || 0) + 1;
  const wrapperKey = keyForFormatWrapper(candidate.format, candidate.format_variant);
  counters.format_wrapper[wrapperKey] = (counters.format_wrapper[wrapperKey] || 0) + 1;
}

function toSeedInt(seedInput) {
  if (Number.isFinite(Number(seedInput))) {
    const asNum = Number(seedInput);
    return Math.abs(Math.floor(asNum)) >>> 0;
  }
  const rng = createRng(String(seedInput || "0"));
  return Math.floor(rng() * 4294967295) >>> 0;
}

function buildSlate(config, date, runSeed, dailyCount, logger, logsDir) {
  const n = Math.max(1, Number(dailyCount) || 1);
  const numericSeed = toSeedInt(runSeed);
  const rng = createRng(numericSeed);
  const caps = computeCaps(n);
  const counters = emptyCounters();
  const slots = [];

  for (let i = 1; i <= n; i += 1) {
    const slotSeed = Math.floor(rng() * 4294967295) >>> 0;
    let candidate = sampleSlateItem(config, slotSeed, i);
    let check = checkFatigueCaps(candidate, counters, caps);

    if (!check.allowed) {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const fallbackSeed = Math.floor(rng() * 4294967295) >>> 0;
        candidate = sampleSlateItemExcluding(config, fallbackSeed, i, check.violated_cap);
        check = checkFatigueCaps(candidate, counters, caps);
        if (check.allowed) break;
      }
    }

    if (!check.allowed) {
      const capKey = toCapKey(check.violated_cap);
      caps[capKey] = (caps[capKey] || 1) + 1; // actually apply the relaxation so manifest + verifier agree
      if (logger) {
        logger.log("fatigue_cap_relaxed", {
          slot_index: i,
          cap_relaxed: check.violated_cap,
          new_cap_value: caps[capKey]
        });
      }
    }

    incrementCounters(candidate, counters);
    slots.push({ ...candidate, slot_index: i, run_seed: slotSeed });
  }

  const manifest = {
    date,
    run_seed: numericSeed,
    daily_count: n,
    slots,
    fatigue_caps: caps,
    fatigue_counters: counters
  };

  if (logsDir) {
    fs.writeFileSync(
      path.join(logsDir, "slate-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );
  }

  return manifest;
}

function getScriptFatigueMeta(script) {
  const derived = deriveFatigueMeta(script);
  const meta = (script && script.meta) || {};
  return {
    hook_type: meta.hook_type || derived.hookType,
    payoff_type: meta.payoff_type || derived.payoffType,
    template_id: meta.template_id || derived.templateId,
    mechanic_ids: Array.isArray(meta.mechanic_ids) && meta.mechanic_ids.length
      ? meta.mechanic_ids
      : derived.mechanicIds,
    format: meta.format || "B",
    format_variant: meta.format_variant || "standard"
  };
}

function validateSlate(scriptsDir, caps) {
  if (!fs.existsSync(scriptsDir)) {
    return { valid: true, violations: [] };
  }
  const files = fs.readdirSync(scriptsDir).filter((name) => name.endsWith(".json")).sort();
  const scripts = files.map((file) => {
    try {
      const script = JSON.parse(fs.readFileSync(path.join(scriptsDir, file), "utf8"));
      return { file, script };
    } catch (error) {
      return { file, script: null };
    }
  });

  const counters = emptyCounters();
  const rows = [];
  scripts.forEach(({ file, script }) => {
    if (!script) return;
    const fatigueMeta = getScriptFatigueMeta(script);
    const row = {
      video_id: script.video_id || file,
      ...fatigueMeta
    };
    incrementCounters(row, counters);
    rows.push(row);
  });

  const violations = [];
  rows.forEach((row) => {
    const comboKey = keyForMechanicCombo(row.mechanic_ids);
    const wrapperKey = keyForFormatWrapper(row.format, row.format_variant);

    if ((counters.hook_type[row.hook_type] || 0) > caps.hook_type) {
      violations.push(`FATIGUE_HOOK_TYPE_CAP:${row.video_id}`);
    }
    if ((counters.payoff_type[row.payoff_type] || 0) > caps.payoff_type) {
      violations.push(`FATIGUE_PAYOFF_TYPE_CAP:${row.video_id}`);
    }
    if ((counters.template_id[row.template_id] || 0) > caps.template_id) {
      violations.push(`FATIGUE_TEMPLATE_ID_CAP:${row.video_id}`);
    }
    if ((counters.mechanic_combo[comboKey] || 0) > caps.mechanic_combo) {
      violations.push(`FATIGUE_MECHANIC_COMBO_CAP:${row.video_id}`);
    }
    if ((counters.format_wrapper[wrapperKey] || 0) > caps.format_wrapper) {
      violations.push(`FATIGUE_FORMAT_WRAPPER_CAP:${row.video_id}`);
    }
  });

  return {
    valid: violations.length === 0,
    violations
  };
}

function computeBatchFatigueCounters(scripts) {
  const counters = emptyCounters();
  (Array.isArray(scripts) ? scripts : []).forEach((script) => {
    const meta = getScriptFatigueMeta(script);
    incrementCounters(meta, counters);
  });
  return counters;
}

module.exports = {
  buildSlate,
  checkFatigueCaps,
  validateSlate,
  computeCaps,
  expandByWeight,
  classifyHookType,
  classifyPayoffType,
  deriveFatigueMeta,
  getScriptFatigueMeta,
  computeBatchFatigueCounters,
  keyForMechanicCombo,
  keyForFormatWrapper,
  toSeedInt
};
