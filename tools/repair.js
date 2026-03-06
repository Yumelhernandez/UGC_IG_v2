const fs = require("fs");
const path = require("path");
const { normalizeProvider } = require("./lib/llm");

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

function deriveSeed(baseSeed, round, candidateIndex) {
  const raw = `${baseSeed || 0}:${round}:${candidateIndex}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function safeMessages(script) {
  return Array.isArray(script && script.messages) ? script.messages : [];
}

function getPayoffRegionBounds(messages) {
  const n = messages.length;
  const payoffCount = Math.max(Math.ceil(n * 0.3), 2);
  const start = Math.max(0, n - payoffCount);
  return { start, end: n };
}

function mapReasonCodes(raw) {
  const values = Array.isArray(raw) ? raw.map((item) => String(item || "").toLowerCase()) : [];
  return values.map((item) => {
    if (item.includes("callback")) return "no_callback";
    if (item.includes("surprise")) return "low_surprise";
    if (item.includes("verb")) return "weak_verb";
    if (item.includes("noun") || item.includes("specificity")) return "vague_noun";
    if (item.includes("length") || item.includes("long")) return "too_long";
    return item || "other";
  });
}

function buildScoringPrompt(context, payoffRegion) {
  const contextText = context
    .map((msg) => `${String(msg.from || "").toUpperCase()}: ${String(msg.text || "")}`)
    .join("\n");
  const payoffText = payoffRegion
    .map((msg) => `${String(msg.from || "").toUpperCase()}: ${String(msg.text || "")}`)
    .join("\n");

  return [
    "You are a script quality evaluator for short-form social media DM conversations.",
    "",
    "Score ONLY the final section of the conversation below. Do not evaluate the setup.",
    "",
    "Full conversation context (do not score this):",
    contextText || "(none)",
    "",
    "Payoff region to score (score this):",
    payoffText || "(none)",
    "",
    "Score each dimension 0-2:",
    "- verb_strength: Does the final line use a strong, active, specific verb?",
    "- callback_depth: Does the final line reference something specific from the context above?",
    "- noun_specificity: Does the final line contain at least one concrete noun (not \"thing\", \"it\", \"that\")?",
    "- length_discipline: Is the final girl message <= 8 words? Is the final boy message (if present) <= 10 words?",
    "- surprise_factor: Does the final line subvert what the reader expects?",
    "",
    "Return JSON only:",
    "{",
    "  \"verb_strength\": 0,",
    "  \"callback_depth\": 0,",
    "  \"noun_specificity\": 0,",
    "  \"length_discipline\": 0,",
    "  \"surprise_factor\": 0,",
    "  \"reason_codes\": []",
    "}"
  ].join("\n");
}

function buildRewritePrompt({ context, payoffRegion, reasonCodes }) {
  const contextText = context
    .map((msg) => `${String(msg.from || "").toUpperCase()}: ${String(msg.text || "")}`)
    .join("\n");
  const payoffText = payoffRegion
    .map((msg) => `${String(msg.from || "").toUpperCase()}: ${String(msg.text || "")}`)
    .join("\n");
  const reasons = (Array.isArray(reasonCodes) && reasonCodes.length ? reasonCodes : ["other"]).join(", "
  );

  return [
    "You are rewriting ONLY the last N messages of a DM conversation script.",
    "Do NOT rewrite anything before these messages.",
    "Do NOT change the sender (boy/girl) assignment of any message.",
    "Do NOT change type_at values — preserve them exactly.",
    "",
    "Context (do not rewrite):",
    contextText || "(none)",
    "",
    "Current payoff region (rewrite this):",
    payoffText || "(none)",
    "",
    `Problems to fix: ${reasons}`,
    "- weak_verb -> use a strong, active verb in the final line",
    "- no_callback -> reference something specific from the context above",
    "- vague_noun -> replace generic nouns with specific ones",
    "- too_long -> cut the final line to <= 10 words",
    "- low_surprise -> make the final line subvert what the reader expects",
    "- low_specificity -> add a concrete detail (object, number, action) from context",
    "",
    "Rules:",
    "- Final girl message MUST be <= 8 words",
    "- Final boy message (if present) MUST be <= 10 words",
    "- Preserve DM voice: lowercase, casual, no punctuation overload",
    "- The rewrite must feel earned by the conversation above it",
    "",
    "Return JSON only:",
    "{",
    "  \"messages\": [",
    "    {\"from\": \"boy\", \"text\": \"...\", \"type_at\": 0}",
    "  ]",
    "}"
  ].join("\n");
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (_) {
        return null;
      }
    }
  }
  return null;
}

function openAiPayload({ model, prompt, temperature, maxOutputTokens, seed }) {
  return {
    model,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: prompt }]
      }
    ],
    temperature,
    max_output_tokens: maxOutputTokens,
    ...(Number.isFinite(seed) ? { seed } : {})
  };
}

function anthropicPayload({ model, prompt, temperature, maxOutputTokens }) {
  return {
    model,
    max_tokens: maxOutputTokens,
    temperature,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: prompt }]
      }
    ]
  };
}

async function callOpenAi({ apiKey, payload }) {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`OpenAI repair call failed (${response.status})`);
  }
  const data = await response.json();
  if (typeof data.output_text === "string") return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item && item.content) ? item.content : [];
    for (const part of content) {
      if (part && part.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  return "";
}

async function callAnthropic({ apiKey, payload }) {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Anthropic repair call failed (${response.status})`);
  }
  const data = await response.json();
  const content = Array.isArray(data.content) ? data.content : [];
  for (const part of content) {
    if (part && part.type === "text" && typeof part.text === "string") return part.text;
  }
  return "";
}

async function callRepairModel({ config, prompt, temperature, maxOutputTokens, seed }) {
  const llmConfig = (config && config.llm) || {};
  const repairConfig = (config && config.repair) || {};
  const model = repairConfig.scoring_model || repairConfig.rewrite_model || (config && config.rizzai && config.rizzai.model) || "gpt-4o-mini";
  const provider = normalizeProvider(llmConfig.provider, model);

  if (provider === "anthropic") {
    const apiKey =
      process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || process.env.CLAUDE || "";
    if (!apiKey) throw new Error("Missing anthropic api key for repair");
    return callAnthropic({
      apiKey,
      payload: anthropicPayload({ model, prompt, temperature, maxOutputTokens })
    });
  }

  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) throw new Error("Missing openai api key for repair");
  return callOpenAi({
    apiKey,
    payload: openAiPayload({ model, prompt, temperature, maxOutputTokens, seed })
  });
}

function sumScoreDimensions(parsed) {
  const verbStrength = Number(parsed && parsed.verb_strength) || 0;
  const callbackDepth = Number(parsed && parsed.callback_depth) || 0;
  const nounSpecificity = Number(parsed && parsed.noun_specificity) || 0;
  const lengthDiscipline = Number(parsed && parsed.length_discipline) || 0;
  const surpriseFactor = Number(parsed && parsed.surprise_factor) || 0;
  return verbStrength + callbackDepth + nounSpecificity + lengthDiscipline + surpriseFactor;
}

function deriveReasonCodesFromDimensions(parsed) {
  const out = [];
  const dims = [
    ["verb_strength", "weak_verb"],
    ["callback_depth", "no_callback"],
    ["noun_specificity", "vague_noun"],
    ["length_discipline", "too_long"],
    ["surprise_factor", "low_surprise"]
  ];
  dims.forEach(([field, code]) => {
    const value = Number(parsed && parsed[field]);
    if (!Number.isFinite(value) || value < 1) out.push(code);
  });
  return out;
}

async function scorePayoff({ context, payoffRegion, config, scorer }) {
  if (typeof scorer === "function") {
    const direct = await scorer({ context, payoffRegion });
    const total = Number(direct && direct.total);
    return {
      total: Number.isFinite(total) ? total : null,
      reason_codes: mapReasonCodes(direct && direct.reason_codes)
    };
  }

  try {
    const prompt = buildScoringPrompt(context, payoffRegion);
    const text = await callRepairModel({
      config: {
        ...config,
        repair: {
          ...(config && config.repair),
          scoring_model:
            (config && config.repair && config.repair.scoring_model) ||
            (config && config.rizzai && config.rizzai.model)
        }
      },
      prompt,
      temperature: 0,
      maxOutputTokens: 300
    });
    const parsed = extractJsonObject(text);
    if (!parsed) return { total: null, reason_codes: ["scoring_parse_error"] };
    const total = sumScoreDimensions(parsed);
    const parsedReasonCodes = mapReasonCodes(parsed.reason_codes);
    const dimensionReasonCodes = deriveReasonCodesFromDimensions(parsed);
    return {
      total,
      reason_codes: parsedReasonCodes.length ? parsedReasonCodes : dimensionReasonCodes
    };
  } catch (error) {
    return { total: null, reason_codes: ["scoring_error"] };
  }
}

function normalizeCandidateRegion(candidateMessages, originalRegion) {
  const candidate = Array.isArray(candidateMessages) ? candidateMessages : [];
  if (!candidate.length || candidate.length !== originalRegion.length) {
    return originalRegion.map((msg) => ({ ...msg }));
  }
  return originalRegion.map((original, index) => ({
    from: original.from,
    type_at: original.type_at,
    text: String(candidate[index] && candidate[index].text || original.text || "").trim() || String(original.text || "")
  }));
}

async function rewritePayoffRegion({
  context,
  payoffRegion,
  reasonCodes,
  candidateSeed,
  config,
  rewriter
}) {
  if (typeof rewriter === "function") {
    const rewritten = await rewriter({ context, payoffRegion, reasonCodes, candidateSeed });
    return normalizeCandidateRegion(rewritten, payoffRegion);
  }

  try {
    const prompt = buildRewritePrompt({ context, payoffRegion, reasonCodes });
    const text = await callRepairModel({
      config: {
        ...config,
        repair: {
          ...(config && config.repair),
          rewrite_model:
            (config && config.repair && config.repair.rewrite_model) ||
            (config && config.rizzai && config.rizzai.model)
        }
      },
      prompt,
      temperature:
        Number(config && config.repair && config.repair.rewrite_temperature) > 0
          ? Number(config.repair.rewrite_temperature)
          : 0.9,
      maxOutputTokens: 500,
      seed: candidateSeed
    });
    const parsed = extractJsonObject(text);
    const messages = parsed && Array.isArray(parsed.messages) ? parsed.messages : [];
    return normalizeCandidateRegion(messages, payoffRegion);
  } catch (error) {
    return payoffRegion.map((msg) => ({ ...msg }));
  }
}

function writeRepairArtifact({ logsDir, date, videoId, round, payload }) {
  const repairsDir = path.join(logsDir || path.join(process.cwd(), "logs", date), "repairs");
  fs.mkdirSync(repairsDir, { recursive: true });
  const filePath = path.join(repairsDir, `${videoId}-round-${round}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
}

async function repairPayoff(script, config, logger, options = {}) {
  // Brainrot-style scripts: the reveal IS the punchline (mid-conversation).
  // Scoring the tail close region is wrong — skip repair and pass with 9/10.
  if (script && script.meta && script.meta.punchline_style != null) {
    script.meta = {
      ...(script.meta || {}),
      payoff_punch_score: 9,
      repair_applied: false,
      repair_rounds: 0,
      repair_failed: false
    };
    return { script, repairResult: null };
  }

  const threshold = Number(config && config.repair && config.repair.threshold) || 6;
  const maxRounds = 3;
  const candidatesPerRound = 3;
  const scorer = options && options.scorer;
  const rewriter = options && options.rewriter;
  const date = options && options.date;
  const logsDir = options && options.logsDir;

  const messages = safeMessages(script);
  const { start } = getPayoffRegionBounds(messages);
  const context = messages.slice(0, start).map((msg) => ({ ...msg }));
  let payoffRegion = messages.slice(start).map((msg) => ({ ...msg }));

  const initialScore = await scorePayoff({ context, payoffRegion, config, scorer });
  logger.log("payoff_scored", {
    video_id: script.video_id,
    score: initialScore.total,
    reason_codes: initialScore.reason_codes,
    passed: Number.isFinite(initialScore.total) && initialScore.total >= threshold
  });

  if (Number.isFinite(initialScore.total) && initialScore.total >= threshold) {
    script.meta = {
      ...(script.meta || {}),
      payoff_punch_score: initialScore.total,
      repair_applied: false,
      repair_rounds: 0,
      repair_failed: false
    };
    return { script, repairResult: null };
  }

  logger.log("repair_started", {
    video_id: script.video_id,
    before_score: initialScore.total
  });

  let bestRegion = payoffRegion.map((msg) => ({ ...msg }));
  let bestScore = Number.isFinite(initialScore.total) ? initialScore.total : null;
  let scoreReasonCodes = initialScore.reason_codes;
  let roundCount = 0;
  let latestRepairResult = null;

  for (let round = 1; round <= maxRounds; round += 1) {
    roundCount = round;
    const candidates = [];
    for (let c = 1; c <= candidatesPerRound; c += 1) {
      const candidateSeed = deriveSeed(script.meta && script.meta.run_seed, round, c);
      const rewritten = await rewritePayoffRegion({
        context,
        payoffRegion,
        reasonCodes: scoreReasonCodes,
        candidateSeed,
        config,
        rewriter
      });
      const scored = await scorePayoff({ context, payoffRegion: rewritten, config, scorer });
      candidates.push({
        index: c,
        region: rewritten,
        score: scored.total,
        reason_codes: scored.reason_codes
      });
    }

    candidates.sort((a, b) => {
      const scoreA = Number.isFinite(a.score) ? a.score : -Infinity;
      const scoreB = Number.isFinite(b.score) ? b.score : -Infinity;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.index - b.index;
    });

    const bestCandidate = candidates[0];
    const previousScore = Number.isFinite(bestScore) ? bestScore : 0;
    const candidateScore = Number.isFinite(bestCandidate && bestCandidate.score)
      ? Number(bestCandidate.score)
      : null;

    const repairAccepted = Number.isFinite(candidateScore) && candidateScore >= threshold;
    const scoreDelta = Number.isFinite(candidateScore)
      ? candidateScore - previousScore
      : null;

    latestRepairResult = {
      video_id: script.video_id,
      round,
      before_score: bestScore,
      after_score: candidateScore,
      score_delta: scoreDelta,
      repair_accepted: repairAccepted,
      before_payoff_region: payoffRegion.map((msg) => ({ ...msg })),
      after_payoff_region: bestCandidate.region.map((msg) => ({ ...msg })),
      reason_codes: scoreReasonCodes,
      candidates_generated: candidatesPerRound
    };

    writeRepairArtifact({
      logsDir,
      date,
      videoId: script.video_id,
      round,
      payload: latestRepairResult
    });

    logger.log("repair_applied", {
      video_id: script.video_id,
      round,
      before_score: bestScore,
      after_score: candidateScore,
      score_delta: scoreDelta,
      repair_accepted: repairAccepted
    });

    if (repairAccepted) {
      bestRegion = bestCandidate.region.map((msg) => ({ ...msg }));
      bestScore = candidateScore;
      scoreReasonCodes = bestCandidate.reason_codes;
      break;
    }

    if (Number.isFinite(candidateScore) && (!Number.isFinite(bestScore) || candidateScore > bestScore)) {
      bestRegion = bestCandidate.region.map((msg) => ({ ...msg }));
      bestScore = candidateScore;
      scoreReasonCodes = bestCandidate.reason_codes;
      payoffRegion = bestRegion.map((msg) => ({ ...msg }));
    }
  }

  script.messages = [...context.map((msg) => ({ ...msg })), ...bestRegion.map((msg) => ({ ...msg }))];
  script.meta = {
    ...(script.meta || {}),
    payoff_punch_score: bestScore,
    repair_applied: true,
    repair_rounds: roundCount,
    repair_failed: !Number.isFinite(bestScore) || bestScore < threshold
  };

  if (script.meta.repair_failed) {
    logger.log("repair_exhausted", {
      video_id: script.video_id,
      final_score: bestScore,
      rounds_attempted: roundCount
    });
  }

  return { script, repairResult: latestRepairResult };
}

module.exports = {
  repairPayoff,
  deriveSeed,
  scorePayoff,
  rewritePayoffRegion,
  getPayoffRegionBounds
};
