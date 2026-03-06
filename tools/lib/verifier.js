const {
  getScriptFatigueMeta,
  keyForMechanicCombo,
  keyForFormatWrapper,
  computeBatchFatigueCounters
} = require("./fatigue");

const ARC_TYPES = new Set(["number_exchange", "rejection", "plot_twist", "cliffhanger", "comedy", "brainrot"]);
const FORMATS = new Set(["B", "D"]);
const SAFE_EMPTY_RESULT = {
  pass: false,
  fatal_count: 1,
  warn_count: 0,
  violations: [{ code: "SCHEMA_SCRIPT_INVALID", severity: "fatal", field: "$" }]
};

function toViolation(code, severity, field) {
  const out = { code, severity };
  if (field) out.field = field;
  return out;
}

function countWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function hasAnyPattern(text, patterns) {
  const value = String(text || "");
  for (const pattern of patterns || []) {
    if (pattern instanceof RegExp) {
      if (pattern.test(value)) return true;
      continue;
    }
    if (typeof pattern === "string" && pattern.trim()) {
      if (value.toLowerCase().includes(pattern.toLowerCase())) return true;
    }
  }
  return false;
}

function parseDateFromVideoId(videoId) {
  const match = String(videoId || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function isPostM1Script(script, config, options) {
  const cutoverDate =
    (options && options.postM1CutoverDate) ||
    (config && config.verifier && config.verifier.post_m1_cutover_date) ||
    "2026-03-02";
  const datePrefix = parseDateFromVideoId(script && script.video_id);
  if (!datePrefix) return true;
  return datePrefix >= cutoverDate;
}

function detectSchemaViolations(script, config, stage, options) {
  const violations = [];
  const required = ["video_id", "meta", "story", "reply", "persona", "messages"];

  required.forEach((field) => {
    if (!(field in script)) {
      violations.push(toViolation("SCHEMA_MISSING_FIELD", "fatal", field));
    }
  });

  const arcType = script && script.meta && script.meta.arc_type;
  if (arcType != null && !ARC_TYPES.has(String(arcType))) {
    violations.push(toViolation("SCHEMA_INVALID_ARC_TYPE", "fatal", "meta.arc_type"));
  }

  const format = script && script.meta && script.meta.format;
  if (format != null && !FORMATS.has(String(format))) {
    violations.push(toViolation("SCHEMA_INVALID_FORMAT", "fatal", "meta.format"));
  }

  if (Array.isArray(script.messages)) {
    if (script.messages.length === 0) {
      violations.push(toViolation("SCHEMA_MESSAGES_EMPTY", "fatal", "messages"));
    }
    let lastTypeAt = null;
    script.messages.forEach((msg, index) => {
      const path = `messages[${index}]`;
      if (!msg || typeof msg !== "object" || !String(msg.text || "").trim()) {
        violations.push(toViolation("SCHEMA_MESSAGE_MISSING_TEXT", "fatal", `${path}.text`));
      }
      if (!Number.isFinite(Number(msg && msg.type_at))) {
        violations.push(toViolation("SCHEMA_MESSAGE_MISSING_TYPE_AT", "fatal", `${path}.type_at`));
      }
      if (Number.isFinite(lastTypeAt) && Number.isFinite(Number(msg && msg.type_at))) {
        if (Number(msg.type_at) < lastTypeAt) {
          violations.push(toViolation("SCHEMA_TYPE_AT_DECREASING", "fatal", `${path}.type_at`));
        }
      }
      if (Number.isFinite(Number(msg && msg.type_at))) lastTypeAt = Number(msg.type_at);
    });
  }

  const postM1 = isPostM1Script(script, config, options);
  const newFieldPaths = [
    "meta.hook_type",
    "meta.payoff_type",
    "meta.template_id",
    "meta.mechanic_ids"
  ];
  newFieldPaths.forEach((fieldPath) => {
    const [root, key] = fieldPath.split(".");
    const container = script && script[root];
    const missing =
      !container ||
      !(key in container) ||
      container[key] == null ||
      (typeof container[key] === "string" && !container[key].trim()) ||
      (Array.isArray(container[key]) && container[key].length === 0);
    if (missing) {
      violations.push(
        toViolation("SCHEMA_NEW_FIELD_MISSING", postM1 ? "fatal" : "warn", fieldPath)
      );
    }
  });

  return violations;
}

function detectSafetyViolations(script, config) {
  const violations = [];
  const messages = Array.isArray(script && script.messages) ? script.messages : [];
  const safetyConfig = (config && config.safety) || {};
  const bannedPhrases = Array.isArray(safetyConfig.banned_phrases)
    ? safetyConfig.banned_phrases
    : Array.isArray(config && config.banned_phrases)
      ? config.banned_phrases
      : [];
  const riskPatterns = Array.isArray(safetyConfig.risk_patterns)
    ? safetyConfig.risk_patterns
    : [
        /\bkill yourself\b/i,
        /\bkys\b/i,
        /\brape\b/i,
        /\bsexual assault\b/i,
        /\bminor\b/i,
        /\bunderage\b/i,
        /\bnazi\b/i,
        /\bhitler\b/i,
        /\bforce you\b/i
      ];

  messages.forEach((message, index) => {
    const text = String((message && message.text) || "");
    if (hasAnyPattern(text, bannedPhrases)) {
      violations.push(toViolation("SAFETY_BANNED_PHRASE", "fatal", `messages[${index}].text`));
    }
    if (hasAnyPattern(text, riskPatterns)) {
      violations.push(toViolation("SAFETY_RISK_PATTERN", "fatal", `messages[${index}].text`));
    }
  });

  return violations;
}

function hasPhoneOrHandle(text) {
  const value = String(text || "").toLowerCase();
  return /\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b/.test(value) || /\b(@[a-z0-9_]{2,}|ig|insta|snap|handle)\b/.test(value);
}

function hasRejectionCue(text) {
  return /\b(nah|pass|nope|no shot|im good|not for me|hard pass|yeah no|not gonna happen|not interested|no thanks|uh no|lol no|i'll pass)\b/i.test(String(text || ""));
}

function hasLockInCue(text) {
  return /\b(youre on|you're on|see you|locked in|deal|its a date|it's a date)\b/i.test(String(text || ""));
}

function detectArcContradiction(script) {
  const arc = String(script && script.meta && script.meta.arc_type || "");
  const messages = Array.isArray(script && script.messages) ? script.messages : [];
  if (!messages.length) return false;
  const finalText = String(messages[messages.length - 1].text || "");
  const allText = messages.map((msg) => String((msg && msg.text) || "")).join(" ");

  if (arc === "number_exchange") {
    return !hasPhoneOrHandle(allText) && !/\b(meet|see you|lets meet|let's meet)\b/i.test(allText);
  }
  if (arc === "rejection") {
    if (hasPhoneOrHandle(allText)) return true;
    return !hasRejectionCue(finalText);
  }
  if (arc === "plot_twist") {
    const half = Math.floor(messages.length / 2);
    const latter = messages.slice(half).map((msg) => String((msg && msg.text) || "")).join(" ");
    return !/\b(plot twist|turns out|actually|surprise|was me|ex)\b/i.test(latter);
  }
  if (arc === "cliffhanger") {
    return hasLockInCue(finalText);
  }
  if (arc === "comedy") return false;
  if (arc === "brainrot") return false; // brainrot has no contradictions by construction
  return false;
}

function hasTerminalBeat(script) {
  const arc = String(script && script.meta && script.meta.arc_type || "");
  const messages = Array.isArray(script && script.messages) ? script.messages : [];
  if (!messages.length) return false;
  const tail = messages.slice(-3).map((msg) => String((msg && msg.text) || "")).join(" ");
  if (arc === "number_exchange") return hasPhoneOrHandle(tail) || /\b(meet|see you|friday|saturday|tonight)\b/i.test(tail);
  if (arc === "rejection") return hasRejectionCue(tail);
  if (arc === "plot_twist") return /\b(plot twist|turns out|actually|surprise|ex)\b/i.test(tail);
  if (arc === "cliffhanger") return /\b(we'?ll see|not yet|maybe maybe not|find out)\b/i.test(tail) || !hasLockInCue(tail);
  if (arc === "comedy") return true;
  if (arc === "brainrot") return true; // brainrot's msg5 recontextualization is always the terminal beat
  return false;
}

function hasPushbackSignal(messages) {
  return (messages || []).some((msg) => {
    if (!msg || msg.from !== "girl") return false;
    return /\b(what|why|nah|tf|prove it|sure\?|serious\?|really\?|cap|not impressed|pass|excuse me|hmm|hm|relax|nope|lmao no|omg no|wait)\b/i.test(String(msg.text || ""));
  });
}

function detectFatigueViolations(script, caps, batchScripts) {
  if (!caps || !batchScripts) return [];
  const allScripts = Array.isArray(batchScripts) ? batchScripts : [];
  const counters = computeBatchFatigueCounters(allScripts);
  const meta = getScriptFatigueMeta(script);
  const comboKey = keyForMechanicCombo(meta.mechanic_ids);
  const wrapperKey = keyForFormatWrapper(meta.format, meta.format_variant);
  const violations = [];

  if ((counters.hook_type[meta.hook_type] || 0) > caps.hook_type) {
    violations.push(toViolation("FATIGUE_HOOK_TYPE_CAP", "fatal", "meta.hook_type"));
  }
  if ((counters.payoff_type[meta.payoff_type] || 0) > caps.payoff_type) {
    violations.push(toViolation("FATIGUE_PAYOFF_TYPE_CAP", "fatal", "meta.payoff_type"));
  }
  if ((counters.template_id[meta.template_id] || 0) > caps.template_id) {
    violations.push(toViolation("FATIGUE_TEMPLATE_ID_CAP", "fatal", "meta.template_id"));
  }
  if ((counters.mechanic_combo[comboKey] || 0) > caps.mechanic_combo) {
    violations.push(toViolation("FATIGUE_MECHANIC_COMBO_CAP", "fatal", "meta.mechanic_ids"));
  }
  if ((counters.format_wrapper[wrapperKey] || 0) > caps.format_wrapper) {
    violations.push(toViolation("FATIGUE_FORMAT_WRAPPER_CAP", "fatal", "meta.format_variant"));
  }
  return violations;
}

function detectQualityViolations(script, config, stage, options) {
  const violations = [];
  const messages = Array.isArray(script && script.messages) ? script.messages : [];
  const firstGapMax = Number(config && config.script_quality && config.script_quality.first_gap_max) || 4.8;

  messages.forEach((message, index) => {
    if (countWords(message && message.text) > 18) {
      violations.push(toViolation("QUALITY_MESSAGE_TOO_LONG", "fatal", `messages[${index}].text`));
    }
  });

  if (messages.length < 2 || messages.length > 22) {
    violations.push(toViolation("QUALITY_TOTAL_MESSAGES_OUT_OF_RANGE", "fatal", "messages"));
  }

  if (detectArcContradiction(script)) {
    violations.push(toViolation("QUALITY_ARC_CONTRADICTION", "fatal", "meta.arc_type"));
  }

  if (!hasTerminalBeat(script)) {
    violations.push(toViolation("QUALITY_NO_TERMINAL_BEAT", "fatal", "messages"));
  }

  if (!hasPushbackSignal(messages)) {
    violations.push(toViolation("QUALITY_PUSHBACK_ABSENT", "warn", "messages"));
  }

  const finalMessage = messages[messages.length - 1];
  if (finalMessage && countWords(finalMessage.text) > 12) {
    violations.push(toViolation("QUALITY_REVEAL_NOT_PUNCHY", "warn", `messages[${messages.length - 1}].text`));
  }

  if (messages.length >= 2) {
    const firstGap = Number(messages[1].type_at) - Number(messages[0].type_at);
    if (Number.isFinite(firstGap) && firstGap > firstGapMax) {
      violations.push(toViolation("QUALITY_FIRST_GAP_EXCEEDED", "warn", "messages[1].type_at"));
    }
  }

  // Brainrot scripts have no payoff line — repair pass is skipped, so payoff_punch_score is never set.
  const isBrainrot = script && script.meta && script.meta.arc_type === "brainrot";
  if (!isBrainrot) {
    const payoffScore = script && script.meta ? script.meta.payoff_punch_score : null;
    const postGenerate = stage === "post_generate";
    const payoffMissingSeverity = postGenerate ? "warn" : "fatal";
    const payoffLowSeverity = postGenerate ? "warn" : "fatal";

    if (payoffScore == null || !Number.isFinite(Number(payoffScore))) {
      violations.push(toViolation("PAYOFF_SCORE_MISSING", payoffMissingSeverity, "meta.payoff_punch_score"));
    } else if (Number(payoffScore) < 6) {
      violations.push(toViolation("PAYOFF_SCORE_BELOW_THRESHOLD", payoffLowSeverity, "meta.payoff_punch_score"));
    }
  }

  const fatigueViolations = detectFatigueViolations(
    script,
    options && options.caps,
    options && options.batchScripts
  );
  violations.push(...fatigueViolations);

  return violations;
}

function finalizeResult(violations) {
  const fatalCount = violations.filter((item) => item.severity === "fatal").length;
  const warnCount = violations.filter((item) => item.severity === "warn").length;
  return {
    pass: fatalCount === 0,
    fatal_count: fatalCount,
    warn_count: warnCount,
    violations
  };
}

function verifyScript(scriptInput, config, options = {}) {
  try {
    const script = scriptInput && typeof scriptInput === "object" ? scriptInput : null;
    if (!script) {
      return SAFE_EMPTY_RESULT;
    }

    const stage = options && options.stage ? options.stage : "post_generate";

    const schemaViolations = detectSchemaViolations(script, config || {}, stage, options || {});
    const schemaWarnings = schemaViolations.filter((item) => item.severity === "warn");
    if (schemaViolations.some((item) => item.severity === "fatal")) {
      return finalizeResult(schemaViolations);
    }

    const safetyViolations = detectSafetyViolations(script, config || {});
    if (safetyViolations.length > 0) {
      return finalizeResult([...schemaWarnings, ...safetyViolations]);
    }

    const qualityViolations = detectQualityViolations(script, config || {}, stage, options || {});
    return finalizeResult([...schemaWarnings, ...qualityViolations]);
  } catch (error) {
    return {
      pass: false,
      fatal_count: 1,
      warn_count: 0,
      violations: [toViolation("VERIFIER_INTERNAL_ERROR", "fatal", "$")]
    };
  }
}

module.exports = {
  verifyScript
};
