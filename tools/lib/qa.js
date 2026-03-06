const fs = require("fs");
const path = require("path");

const AI_TERM_PATTERNS = [
  /\bai\b/i,
  /\bA\.I\b/i,
  /\bchat\s?gpt\b/i,
  /\bgpt\b/i,
  /\bopenai\b/i,
  /\bartificial\s+intelligence\b/i,
  /\bllm\b/i
];

const SAFETY_RISK_PATTERNS = [
  /\bkill yourself\b/i,
  /\bkys\b/i,
  /\brape\b/i,
  /\bsexual assault\b/i,
  /\bminor\b/i,
  /\bunderage\b/i,
  /\bnazi\b/i,
  /\bhitler\b/i,
  /\bchoke you\b/i,
  /\bforce you\b/i
];

const DEFAULT_TIMING_WINDOWS = {
  A: { reveal: { min: 4, max: 7 }, win: { min: 12, max: 18 } },
  B: { reveal: { min: 4, max: 7 }, win: { min: 12, max: 18 } },
  C: { reveal: { min: 2, max: 4.5 }, win: { min: 5, max: 11 } },
  D: { reveal: { min: 4, max: 12 }, win: { min: 10, max: 18 } }
};

function normalizeTimingWindow(value, fallback) {
  if (Array.isArray(value) && value.length >= 2) {
    return { min: Number(value[0]), max: Number(value[1]) };
  }
  if (value && typeof value === "object") {
    const min = Number(value.min);
    const max = Number(value.max);
    if (Number.isFinite(min) || Number.isFinite(max)) {
      return { min, max };
    }
  }
  return fallback;
}

function getTimingWindows(config, format) {
  const windows = (config && config.timing_windows) || {};
  const key = format === "A" ? "B" : format || "B";
  const fallback = DEFAULT_TIMING_WINDOWS[key] || DEFAULT_TIMING_WINDOWS.B;
  const entry = windows[key] || windows[format] || windows.B || fallback;
  return {
    reveal: normalizeTimingWindow(entry && entry.reveal, fallback.reveal),
    win: normalizeTimingWindow(entry && entry.win, fallback.win)
  };
}

function parseHookLines(raw) {
  return raw
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    )
    .filter((lines) => lines.length > 0)
    .map((lines) => {
      const headlineLines = [];
      const subtitleLines = [];
      lines.forEach((line, index) => {
        if (index === 0) {
          headlineLines.push(line);
          return;
        }
        if (/^[*(]/.test(line) || subtitleLines.length > 0) {
          subtitleLines.push(line);
          return;
        }
        headlineLines.push(line);
      });
      return {
        headline: headlineLines.join(" ").trim(),
        subtitle: subtitleLines.join(" ").trim()
      };
    })
    .filter((entry) => entry.headline);
}

function loadHookLines(rootDir) {
  const linesPath = path.join(rootDir, "hook_lines.md");
  if (!fs.existsSync(linesPath)) return [];
  const raw = fs.readFileSync(linesPath, "utf8");
  const entries = parseHookLines(raw);
  const banned = [/not patched/i, ...AI_TERM_PATTERNS];
  return entries
    .map((entry) => {
      if (!entry) return null;
      const headline = entry.headline || "";
      let subtitle = entry.subtitle || "";
      if (banned.some((pattern) => pattern.test(headline))) return null;
      if (banned.some((pattern) => pattern.test(subtitle))) subtitle = "";
      return { ...entry, subtitle };
    })
    .filter(Boolean);
}

function isHookFromLines(hook, hookLines) {
  if (!hook || !hookLines || !hookLines.length) return false;
  const headline = (hook.headline || "").trim();
  const subtitle = (hook.subtitle || "").trim();
  return hookLines.some(
    (line) => line.headline.trim() === headline && (line.subtitle || "").trim() === subtitle
  );
}

function usesProvenHookFormat(hook) {
  if (!hook || !hook.headline) return false;
  const text = `${hook.headline} ${hook.subtitle || ""}`.toLowerCase();
  // Expanded proven patterns from viral video analysis
  const patterns = [
    "how to", "watch this", "pt", "part", "let", "cook", "plan b", "take notes",
    "shooting", "sliding", "rizz", "dm", "dms", "shoot my shot", "baddie",
    "huzz", "wifey", "mommy", "ig dms", "story reply", "watch me",
    "step 1", "step 2", "tutorial", "pov", "she said", "he said",
    "when she", "when he", "don't try this", "this is how", "works every time"
  ];
  return patterns.some((pattern) => text.includes(pattern));
}

function loadViralHooks(rootDir) {
  const viralPath = path.join(rootDir, "viral_patterns.json");
  if (!fs.existsSync(viralPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(viralPath, "utf8"));
    return (data.hook_patterns && data.hook_patterns.unique_hooks) || [];
  } catch (e) {
    return [];
  }
}

function loadViralMessageCorpus(rootDir) {
  const viralPath = path.join(rootDir, "viral_patterns.json");
  if (!fs.existsSync(viralPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(viralPath, "utf8"));
    const videos = Array.isArray(data.videos) ? data.videos : [];
    const lines = new Set();
    videos.forEach((video) => {
      const conversation = (video && video.conversation) || {};
      const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
      if (conversation.hook_line) lines.add(conversation.hook_line);
      if (conversation.first_response) lines.add(conversation.first_response);
      messages.forEach((message) => {
        if (message && typeof message.text === "string" && message.text.trim()) {
          lines.add(message.text);
        }
      });
    });
    return Array.from(lines);
  } catch (e) {
    return [];
  }
}

function isHookMatchingViralPattern(hook, viralHooks) {
  if (!hook || !hook.headline || !viralHooks || !viralHooks.length) return false;
  const headline = hook.headline.toLowerCase().trim();
  // Check if the generated hook shares significant words with any viral hook
  const hookWords = headline.split(/\s+/).filter(w => w.length > 2);
  return viralHooks.some((viralHook) => {
    const viralLower = (viralHook.text || viralHook).toString().toLowerCase();
    const viralWords = viralLower.split(/\s+/).filter(w => w.length > 2);
    // At least 2 shared meaningful words = structurally similar
    const shared = hookWords.filter(w => viralWords.includes(w));
    return shared.length >= 2;
  });
}

function normalizeText(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordSet(value) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter(Boolean)
  );
}

function wordList(value) {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean);
}

function jaccardSimilarity(a, b) {
  const setA = wordSet(a);
  const setB = wordSet(b);
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  setA.forEach((token) => {
    if (setB.has(token)) intersection += 1;
  });
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function isNearCopyOfViralHook(text, viralHooks) {
  if (!text || !viralHooks || !viralHooks.length) return false;
  const normalized = normalizeText(text);
  const wordCount = normalized.split(" ").filter(Boolean).length;
  if (wordCount < 5) return false;
  for (const viralHook of viralHooks) {
    const baseline = (viralHook && (viralHook.text || viralHook).toString()) || "";
    const baselineNormalized = normalizeText(baseline);
    if (!baselineNormalized) continue;
    if (normalized === baselineNormalized) return true;
    if (jaccardSimilarity(normalized, baselineNormalized) >= 0.92) return true;
  }
  return false;
}

function tokenOverlapRatio(a, b) {
  const tokensA = wordList(a);
  const tokensB = wordList(b);
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  setA.forEach((token) => {
    if (setB.has(token)) intersection += 1;
  });
  const denominator = Math.min(setA.size, setB.size);
  return denominator > 0 ? intersection / denominator : 0;
}

function isNearCopyOfViralLine(text, viralLines, thresholds) {
  if (!text || !viralLines || !viralLines.length) return false;
  const normalized = normalizeText(text);
  const words = normalized.split(" ").filter(Boolean);
  if (words.length < 6) return false;
  for (const viralLine of viralLines) {
    const baseline = (viralLine || "").toString();
    const baselineWords = normalizeText(baseline).split(" ").filter(Boolean);
    if (baselineWords.length < 6) continue;
    if (normalized === normalizeText(baseline)) return true;
    const jaccard = jaccardSimilarity(normalized, baseline);
    const overlap = tokenOverlapRatio(normalized, baseline);
    if (jaccard >= thresholds.jaccard || overlap >= thresholds.overlap) {
      return true;
    }
  }
  return false;
}

function isStrongPushbackLine(text, format) {
  if (!text) return false;
  const trimmed = text.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (format === "D") {
    // Format D: first message must be a 3-10 word sarcastic roast, not punctuation-only
    if (/^\?+$/.test(trimmed) || /^huh\??$/i.test(trimmed)) return false;
    if (/^ok\??$/i.test(trimmed) || /^why\??$/i.test(trimmed)) return false;
    const lower = trimmed.toLowerCase();
    if (/^and\??$/.test(lower)) return false;
    if (/^so what\??$/.test(lower)) return false;
    if (/^and what about it\??$/.test(lower)) return false;
    if (/^says who\??$/.test(lower)) return false;
    return wordCount >= 3 && wordCount <= 10;
  }
  if (/\?\?+/.test(trimmed)) return true;
  if (/\?$/.test(trimmed) && wordCount <= 6) return true;
    if (wordCount >= 2 && wordCount <= 7) {
      if (/[.!]$/.test(trimmed)) return true;
      if (/\b(you|your|ur|me|mine|dont|don't|do not|slow|bold|serious|cap|prove|convince|impressed|assume|sure|real|believe|trust|handle|dangerous|reckless|cute|wild|crazy|risky|invite|list|tight)\b/i.test(trimmed)) {
        return true;
      }
    }
  return false;
}

const REPLY_STOPWORDS = new Set([
  "a",
  "about",
  "actually",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "but",
  "by",
  "can",
  "cant",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "here",
  "him",
  "his",
  "how",
  "i",
  "im",
  "in",
  "is",
  "it",
  "its",
  "just",
  "like",
  "lol",
  "me",
  "my",
  "no",
  "not",
  "now",
  "of",
  "ok",
  "okay",
  "on",
  "or",
  "our",
  "out",
  "really",
  "so",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "too",
  "u",
  "ur",
  "us",
  "was",
  "we",
  "were",
  "what",
  "with",
  "you",
  "your",
  "youre"
]);

function tokenizeReply(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function extractReplyKeywords(text) {
  const tokens = tokenizeReply(text);
  return tokens.filter(
    (token) =>
      token.length >= 3 &&
      !REPLY_STOPWORDS.has(token) &&
      !/^\d+$/.test(token)
  );
}

function isFormatDReplyTiedToBoy(girlText, replyText) {
  if (!girlText || !replyText) return true;
  const girlTokens = new Set(extractReplyKeywords(girlText));
  if (girlTokens.size === 0) return false;
  const replyTokens = extractReplyKeywords(replyText);
  return replyTokens.some((token) => girlTokens.has(token));
}

const REVEAL_LINES = new Set([
  "so its me then?",
  "so you picked me?",
  "so we locked in?",
  "so youre saying yes?",
  "so youre not denying it?",
  "ok so we on?",
  "thats a yes, loud",
  "cool, thats a yes",
  "say less, its me",
  "so its me or its me?",
  "thats the green light",
  "so youre claiming me?",
  "so youre team me now?",
  "so we skipping the small talk?",
  "so youre choosing me?",
  "so its official?",
  "so you want me?",
  "thats a yes, dont lie",
  "so im your problem now?",
  "so we outside?",
  "so you just green lit this?",
  "so you basically picked me?",
  "thats a yes with extra spice",
  "so we good or what?",
  "so you just said yes?"
]);

const CONTROVERSIAL_REVEAL_LINES = new Set([
  "you knew what you were doing",
  "dont act innocent now",
  "you wanted a reaction",
  "you post like a dare",
  "youre not as chill as you act",
  "you love the attention",
  "youre baiting and you know it",
  "you just wanted me to bite",
  "youre playing innocent",
  "you wanted the smoke",
  "you do this on purpose",
  "youre the reason im distracted",
  "youre not low key at all",
  "youre the chaos you post",
  "youre trying to start something",
  "you knew this would work",
  "you made this too easy",
  "you wanted me in your dms",
  "you wanted the fast reply",
  "you did not post this for peace",
  "you were asking for a reaction",
  "youre testing how bold i am",
  "youre not subtle at all",
  "you know exactly what youre doing",
  "youre fishing and it worked",
  "you wanted a problem",
  "you wanted me to say something",
  "you wanted the spotlight",
  "youre loud on purpose",
  "youre not as innocent as that post",
  "you wanted to stir the pot",
  "you wanted the attention and the smoke",
  "you knew i would fold",
  "you knew id notice",
  "you knew id bite",
  "you wanted a bold reply",
  "you wanted the chaos",
  "youre pushing buttons",
  "you were hoping id react",
  "you were asking for trouble",
  "youre not here to be ignored",
  "youre too loud to play shy",
  "youre not as shy as you act",
  "youre playing games and i respect it",
  "you were trying to tempt me",
  "you knew i would say something",
  "you wanted a risky reply",
  "you wanted a reason to clap back",
  "youre testing the limits",
  "you wanted me to chase",
  "youre acting calm but you love this",
  "you wanted a fight and a flirt",
  "youre baiting me and i like it",
  "you knew id take the bait",
  "you posted that for the chaos",
  "you wanted the heat not the peace",
  "youre not fooling anyone",
  "you wanted the attention and the proof",
  "youre the type to start fires",
  "you wanted me to challenge you",
  "youre not a mystery you are a dare",
  "you were calling my name without saying it",
  "youre bold for acting shy",
  "you wanted to see if id step up",
  "you wanted to see if id fold",
  "you wanted me to show up",
  "you wanted the risk",
  "youre testing if im real",
  "youre not as innocent as you type",
  "you wanted the flirty fight",
  "you wanted the comeback",
  "you wanted the confession",
  "you were fishing and i bit",
  "youre not as chill as you pretend",
  "you wanted a reason to say yes",
  "you wanted the push and the pull",
  "youre baiting and im biting",
  "youre daring me to be bold",
  "youre not posting for quiet",
  "you wanted me in your head",
  "you knew id read between the lines",
  "youre playing hard but not that hard",
  "you wanted to make it interesting",
  "you wanted to wake me up",
  "youre not hiding it well",
  "you wanted the reaction and the result",
  "youre not here for small talk",
  "you wanted a confession and got one",
  "you were hoping id call you out",
  "you wanted a reason to tease me",
  "youre not here for calm",
  "you wanted the tension",
  "you wanted to make it messy",
  "you wanted to push me",
  "youre not innocent in this",
  "youre the reason this got spicy",
  "you wanted to turn this into a moment",
  "you wanted the bold reply and got it",
  "youre the reason i said it",
  "you wanted a spark and you got it",
  "you were not subtle with that",
  "you wanted me to make the move",
  "you wanted to see if id risk it",
  "you wanted to test me",
  "you wanted me to be direct",
  "you wanted the drama",
  "you wanted the reaction and the tension",
  "you wanted the dare and the answer",
  "youre not playing nice today",
  "you wanted to start something and it worked"
]);

function isRevealPunchy(text) {
  if (!text) return false;
  const cleaned = text.trim().toLowerCase();
  if (REVEAL_LINES.has(cleaned) || CONTROVERSIAL_REVEAL_LINES.has(cleaned)) return true;
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  if (wordCount < 3 || wordCount > 10) return false;
  if (!/\b(you|youre|your)\b/.test(cleaned)) return false;
  return /\b(wanted|knew|dont|did|do|post|posted|bait|playing|acting|testing|pushing|dare|attention|chaos|smoke|reaction|problem|challenge|bold|risk|tease|call|fire|fold|bite|tempt|stir|wake|messy|prove)\b/.test(cleaned);
}

function isStrongAskLine(text) {
  if (!text) return false;
  const cleaned = text.toLowerCase();
  if (/\bdrinks?\b/.test(cleaned)) return true;
  if (/\bnumber\b/.test(cleaned)) return true;
  if (/\btext me\b/.test(cleaned)) return true;
  if (/\bwhen are we\b/.test(cleaned)) return true;
  // New ending system: boy leading with a plan
  if (/\bi know a spot\b/.test(cleaned)) return true;
  if (/\bi'll pick you up\b/.test(cleaned)) return true;
  if (/\bi'm choosing\b/.test(cleaned)) return true;
  if (/\bi'll send you\b/.test(cleaned)) return true;
  if (/\bi'll plan\b/.test(cleaned)) return true;
  if (/\bi'll handle\b/.test(cleaned)) return true;
  if (/\blet me take you\b/.test(cleaned)) return true;
  if (/\bgive me your number\b/.test(cleaned)) return true;
  if (/\blet me get your\b/.test(cleaned)) return true;
  if (/\bcan i get your\b/.test(cleaned)) return true;
  if (/\bwhat'?s your number\b/.test(cleaned)) return true;
  if (/\bwhat'?s ur number\b/.test(cleaned)) return true;
  if (/\bdrop your number\b/.test(cleaned)) return true;
  if (/\bslide me your\b/.test(cleaned)) return true;
  return false;
}

const QA_TEASE_LINES = [
  "don't be boring",
  "you better be fun",
  "deal. but you're paying",
  "don't disappoint me",
  "don't be late",
  "this better be worth it",
  "you're on",
  "but i'm ordering everything",
  "don't make me regret this",
  "don't blow it",
  "impress me",
  "if you're boring i'm blocking you",
  "you have one chance",
  "you have 24 hours",
  "i'm gonna regret this",
  "don't let it go to your head",
  "you better plan something good",
  "prove it",
  "you're lucky you're cute"
];

function isStrongWinLine(text) {
  if (!text) return false;
  const cleaned = text.toLowerCase().trim();
  if (/\btext me\b/.test(cleaned)) return true;
  if (/\bnumber\b/.test(cleaned)) return true;
  if (/\bwhen\b/.test(cleaned) && /\bwhere\b/.test(cleaned)) return true;
  // New ending system: phone number counts as win
  if (/555\s?\d{3}\s?\d{4}/.test(cleaned)) return true;
  // New ending system: tease line counts as win
  if (QA_TEASE_LINES.some((t) => t.toLowerCase() === cleaned)) return true;
  return false;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasPhoneDrop(messages) {
  return (messages || []).some(
    (m) => m && m.from === "girl" && /\b555\s?\d{3}\s?\d{4}\b/.test(m.text || "")
  );
}

function findFirstPhoneDropIndex(messages) {
  if (!Array.isArray(messages)) return -1;
  return messages.findIndex(
    (m) => m && m.from === "girl" && /\b555\s?\d{3}\s?\d{4}\b/.test(m.text || "")
  );
}

function findLastStrongAskBefore(messages, beforeIndex) {
  if (!Array.isArray(messages) || !Number.isFinite(beforeIndex) || beforeIndex <= 0) return -1;
  for (let i = beforeIndex - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg && msg.from === "boy" && isStrongAskLine(msg.text || "")) return i;
  }
  return -1;
}

function isNumberExchangeResistanceLine(text) {
  const value = normalizeText(text);
  if (!value) return false;
  if (/\b(and\?|so what|cap|nah|no|why|huh|wdym|wym|prove it|really|says who|who said)\b/.test(value)) return true;
  if (/\b(try harder|convince me|youre bold|you talk big|earned it|if )\b/.test(value)) return true;
  if (/\?$/.test(String(text || "").trim())) return true;
  return false;
}

function classifyOpenerIntensity(text) {
  const value = normalizeText(text);
  if (!value) return "neutral";
  if (/(you( are|'re)? mid|taste as good|inside out|thighs|earmuffs|criminal|lawsuit|pressing charges|ruined|dangerous|i need yall both)/.test(value)) {
    return "challenge_heavy";
  }
  if (/(bet|dare|complaint|sue|suing|question|how|why|\?)/.test(value)) {
    return "provocative";
  }
  return "neutral";
}

function hasResistanceBetweenAskAndPhone(messages, askIndex, phoneIndex) {
  if (!Array.isArray(messages)) return false;
  if (!Number.isFinite(askIndex) || !Number.isFinite(phoneIndex) || phoneIndex - askIndex <= 1) return false;
  for (let i = askIndex + 1; i < phoneIndex; i += 1) {
    const m = messages[i];
    if (!m || m.from !== "girl") continue;
    if (/\b555\s?\d{3}\s?\d{4}\b/.test(m.text || "")) continue;
    if (isNumberExchangeResistanceLine(m.text || "")) return true;
  }
  return false;
}

function passesNumberExchangeFlow(messages, openerText, scriptMeta) {
  const phoneIdx = findFirstPhoneDropIndex(messages);
  if (phoneIdx < 0) return false;
  const askIdx = findLastStrongAskBefore(messages, phoneIdx);
  if (askIdx < 0) return false;
  const intensity = classifyOpenerIntensity(openerText);
  if (intensity === "challenge_heavy") {
    // Brainrot punchline scripts have built-in resistance in the reveal exchange;
    // don't require a separate resistance beat between the ask and phone drop.
    if (scriptMeta && scriptMeta.punchline_style) return true;
    return hasResistanceBetweenAskAndPhone(messages, askIdx, phoneIdx);
  }
  // For neutral/provocative openers, allow direct ask -> number if the ask is strong.
  return true;
}

function passesArcIntegrity(script) {
  const arc = script && script.meta && script.meta.arc_type;
  const messages = Array.isArray(script && script.messages) ? script.messages : [];
  if (!arc || messages.length === 0) return false;
  const phoneDrop = hasPhoneDrop(messages);
  const last = messages[messages.length - 1] || {};
  const lastText = (last.text || "").toLowerCase();
  const allText = messages.map((m) => (m && m.text ? m.text.toLowerCase() : "")).join(" ");

  if (arc === "number_exchange") return passesNumberExchangeFlow(messages, script && script.reply && script.reply.text, script && script.meta);
  if (arc === "rejection") {
    if (phoneDrop) return false;
    return /\b(not|nah|pass|nope|nice try|not gonna happen|not happening|no shot|good luck|hard pass|i'm good|not for me|yeah no|keeping it moving|i don't think so|not interested|no thanks|uh no|lol no|sorry|i'll pass)\b/.test(lastText);
  }
  if (arc === "plot_twist") {
    if (phoneDrop) return false;
    // Twist must be implicit behavior — girl reveals something that reframes the conversation
    return /\b(testing|dated|set (this|it) up|not an accident|already knew|been watching|been following|on purpose|now you know|here we are|surprise|anyway|now what)\b/.test(allText);
  }
  if (arc === "cliffhanger") {
    if (phoneDrop) return false;
    return !/\b(don't be late|youre on|you're on|see you|locked in|deal)\b/.test(lastText);
  }
  if (arc === "comedy") {
    // comedy_number sub-ending: phone drop is valid
    if (phoneDrop) return true;
    // comedy_cliffhanger sub-ending
    if (/\b(not done|don't go|off the hook|not over|isn't over|more questions|thinking|don't leave)\b/.test(lastText)) return true;
    // comedy_twist sub-ending (twist is implicit in content, no "plot twist" label)
    if (/\b(anyway|now you know|here we are|now we're here|so yeah)\b/.test(lastText)) return true;
    // pure comedy closer
    return /\b(funny|weird|unhinged|got me|actually|respect|hate that|can't with|you win|ngl|that was|ok fine|not bad|this round|laughed|annoying|wasn't ready|good|bro)\b/.test(lastText);
  }
  // Brainrot arc integrity is validated inside the generator (scoreBrainrotScript).
  // The 6-line structure is always valid by the time it reaches QA.
  if (arc === "brainrot") return true;
  return false;
}

function hasBannedPhrase(text, bannedList) {
  const lower = text.toLowerCase();
  return bannedList.find((phrase) => lower.includes(phrase));
}

function hasBannedPattern(text, patterns) {
  return patterns.find((pattern) => pattern.test(text));
}

function checkLines(text, maxLineChars) {
  const lines = text.split(/\n/);
  const tooLong = lines.find((line) => line.length > maxLineChars);
  return tooLong;
}

function validateScript({ script, config, rootDir }) {
  const reasons = [];
  const hookLines = loadHookLines(rootDir);
  const viralHooks = loadViralHooks(rootDir);
  const viralLines = loadViralMessageCorpus(rootDir);
  const noveltyThresholds = {
    jaccard:
      Number(config && config.script_quality && config.script_quality.novelty_similarity_jaccard) || 0.84,
    overlap:
      Number(config && config.script_quality && config.script_quality.novelty_similarity_overlap) || 0.9
  };

  if (!isNonEmptyString(script.video_id)) reasons.push("missing video_id");
  if (!script.meta || typeof script.meta !== "object") reasons.push("missing meta");
  if (!script.story || typeof script.story !== "object") reasons.push("missing story");
  if (!script.reply || typeof script.reply !== "object") reasons.push("missing reply");
  if (!script.persona || typeof script.persona !== "object") reasons.push("missing persona");
  if (!Array.isArray(script.messages)) reasons.push("missing messages");

  const isFormatC = script.meta && script.meta.format === "C";
  const isFormatD = script.meta && script.meta.format === "D";
  const isFormatB = script.meta && script.meta.format === "B";
  const isFormatBLong = isFormatB && script.meta && script.meta.format_variant === "long";
  if (script.meta) {
    const duration = script.meta.duration_s;
    if (typeof duration !== "number") reasons.push("duration_s must be number");
    const durationBounds = isFormatBLong
      ? (config.duration_s_long || { min: 55, max: 80 })
      : isFormatC
      ? (config.duration_s_C || { min: 7, max: 12 })
      : isFormatD
      ? (config.duration_s_D || config.duration_s || { min: 17, max: 24 })
      : (config.duration_s || { min: 17, max: 24 });
    if (duration < durationBounds.min || duration > durationBounds.max) reasons.push("duration_s out of bounds");
    if (!["low", "medium", "high"].includes(script.meta.spice_tier)) {
      reasons.push("invalid spice_tier");
    }
    if (!["safe", "spicy", "edge"].includes(script.meta.controversy_tier)) {
      reasons.push("invalid controversy_tier");
    }
    if (!["number_exchange", "rejection", "plot_twist", "cliffhanger", "comedy", "brainrot"].includes(script.meta.arc_type)) {
      reasons.push("invalid arc_type");
    }
    if (script.meta.format && !["A", "B", "C", "D"].includes(script.meta.format)) {
      reasons.push("invalid format");
    }
    const beatPlan = script.meta.beat_plan || script.beat_plan;
    if (!beatPlan || !isNonEmptyString(beatPlan.shareable_moment)) {
      reasons.push("missing shareable_moment");
    }
    // Section 14.3.5: Shareable moment should be early (10-50%).
    if (beatPlan && isNonEmptyString(beatPlan.shareable_moment) && Array.isArray(script.messages) && script.messages.length >= 4) {
      const shareableIdx = script.beats && Number.isFinite(script.beats.shareable_index) ? script.beats.shareable_index : -1;
      if (shareableIdx >= 0) {
        const totalMessages = script.messages.length;
        const positionPct = shareableIdx / (totalMessages - 1);
        if (positionPct < 0.10 || positionPct > 0.50) {
          reasons.push(`shareable_moment position out of range: index ${shareableIdx}/${totalMessages - 1} = ${(positionPct * 100).toFixed(0)}% (target ~10-50%)`);
        }
      }
    }
  }

  if (script.story) {
    if (!isNonEmptyString(script.story.caption)) reasons.push("missing story caption");
    if (!isNonEmptyString(script.story.username)) reasons.push("missing story username");
    if (typeof script.story.age !== "number" || script.story.age < 18) {
      reasons.push("story age invalid or under 18");
    }
    if (!isNonEmptyString(script.story.asset)) {
      reasons.push("missing story asset");
    } else {
      const assetCandidates = [
        path.join(rootDir, script.story.asset),
        path.join(rootDir, "remotion", "public", script.story.asset)
      ];
      const assetExists = assetCandidates.some((candidate) => fs.existsSync(candidate));
      if (!assetExists) reasons.push("story asset path missing");
    }
  }

  if (script.hook && typeof script.hook === "object") {
    const hook = script.hook;
    if (
      Object.prototype.hasOwnProperty.call(hook, "mode") &&
      hook.mode !== "media" &&
      hook.mode !== "reply"
    ) {
      reasons.push("hook mode invalid");
    }
    if (Object.prototype.hasOwnProperty.call(hook, "asset")) {
      if (!isNonEmptyString(hook.asset)) {
        reasons.push("hook asset missing");
      } else {
        const hookCandidates = [
          path.join(rootDir, hook.asset),
          path.join(rootDir, "remotion", "public", hook.asset)
        ];
        const hookExists = hookCandidates.some((candidate) => fs.existsSync(candidate));
        if (!hookExists) reasons.push("hook asset path missing");
      }
    }
    if (Object.prototype.hasOwnProperty.call(hook, "headline") && !isNonEmptyString(hook.headline)) {
      reasons.push("hook headline missing");
    }
    if (
      Object.prototype.hasOwnProperty.call(hook, "subtitle") &&
      hook.subtitle != null &&
      typeof hook.subtitle !== "string"
    ) {
      reasons.push("hook subtitle invalid");
    }
    const hookFromLines = isHookFromLines(hook, hookLines);
    const hookProvenFormat = usesProvenHookFormat(hook);
    const hookMatchesViral = isHookMatchingViralPattern(hook, viralHooks);
    // Hook passes if ANY of the three checks pass
    if (!hookFromLines && !hookProvenFormat && !hookMatchesViral) {
      reasons.push("hook not in proven format (no match: hook_lines, proven keywords, or viral patterns)");
    }
    if (isNearCopyOfViralHook(hook.headline, viralHooks)) {
      reasons.push("low novelty: hook too close to viral source");
    }
  }

  if (script.stinger && typeof script.stinger === "object") {
    const stinger = script.stinger;
    if (Object.prototype.hasOwnProperty.call(stinger, "after_first")) {
      if (!isNonEmptyString(stinger.after_first)) {
        reasons.push("stinger asset missing");
      } else {
        const stingerCandidates = [
          path.join(rootDir, stinger.after_first),
          path.join(rootDir, "remotion", "public", stinger.after_first)
        ];
        const stingerExists = stingerCandidates.some((candidate) => fs.existsSync(candidate));
        if (!stingerExists) reasons.push("stinger asset path missing");
      }
    }
  }

  if (script.persona) {
    const { boy, girl } = script.persona;
    if (!boy || !isNonEmptyString(boy.name) || typeof boy.age !== "number") {
      reasons.push("invalid boy persona");
    } else if (boy.age < 18) {
      reasons.push("boy age under 18");
    }
    if (!girl || !isNonEmptyString(girl.name) || typeof girl.age !== "number") {
      reasons.push("invalid girl persona");
    } else if (girl.age < 18) {
      reasons.push("girl age under 18");
    }
  }

  const allTexts = [];
  if (script.reply && isNonEmptyString(script.reply.text)) {
    allTexts.push(script.reply.text);
  }

  if (Array.isArray(script.messages)) {
    const normalizedSeen = new Set();
    let duplicateLines = 0;
    script.messages.forEach((msg, index) => {
      if (!msg || typeof msg !== "object") {
        reasons.push(`message ${index + 1} invalid`);
        return;
      }
      if (!isNonEmptyString(msg.text)) reasons.push(`message ${index + 1} missing text`);
      if (typeof msg.type_at !== "number") reasons.push(`message ${index + 1} missing type_at`);
      if (isNonEmptyString(msg.text) && msg.text.length > config.message_max_chars) {
        reasons.push(`message ${index + 1} too long`);
      }
      if (isNonEmptyString(msg.text)) {
        const longLine = checkLines(msg.text, config.line_max_chars);
        if (longLine) reasons.push(`message ${index + 1} line too long`);
        allTexts.push(msg.text);
        const normalized = normalizeText(msg.text);
        if (normalized.length >= 8) {
          if (normalizedSeen.has(normalized)) duplicateLines += 1;
          normalizedSeen.add(normalized);
        }
      }
    });
    if (duplicateLines >= 2) reasons.push("low novelty: repeated message lines");
    const noveltyCandidates = [];
    if (script.reply && isNonEmptyString(script.reply.text)) noveltyCandidates.push(script.reply.text);
    script.messages.forEach((msg) => {
      if (msg && isNonEmptyString(msg.text)) noveltyCandidates.push(msg.text);
    });
    const nearCopyLine = noveltyCandidates.find((line) =>
      isNearCopyOfViralLine(line, viralLines, noveltyThresholds)
    );
    if (nearCopyLine && normalizeText(nearCopyLine).split(" ").length >= 10) {
      reasons.push("low novelty: message too close to viral source");
    }
  }

  if (Array.isArray(script.messages)) {
    const firstGirl = script.messages.find((msg) => msg && msg.from === "girl");
    const scriptFormat = script.meta && script.meta.format;
    if (!firstGirl || !isStrongPushbackLine(firstGirl.text || "", scriptFormat)) {
      script.meta = script.meta || {};
      script.meta.qa_signals = script.meta.qa_signals || {};
      script.meta.qa_signals.pushback_opener_weak = true;
    }
    if (
      scriptFormat === "D" &&
      (script.meta && script.meta.arc_type) !== "comedy" &&
      (script.meta && script.meta.arc_type) !== "brainrot" &&
      firstGirl &&
      isStrongPushbackLine(firstGirl.text || "", scriptFormat) &&
      !isFormatDReplyTiedToBoy(firstGirl.text || "", script.reply && script.reply.text)
    ) {
      reasons.push("pushback opener not tied to reply");
    }
    // Find the actual reveal line — scan for a boy message matching the reveal pool
    let revealIndex = -1;
    let revealMessage = null;
    if (isFormatD) {
      // Format D: reveal is at the midpoint, find it by matching the pool
      for (let ri = 0; ri < script.messages.length; ri++) {
        const m = script.messages[ri];
        if (m && m.from === "boy" && isRevealPunchy(m.text || "")) {
          revealIndex = ri;
          revealMessage = m;
          break;
        }
      }
    } else {
      revealIndex = firstGirl ? script.messages.indexOf(firstGirl) + 1 : -1;
      revealMessage = revealIndex >= 0 ? script.messages[revealIndex] : null;
    }
    const arcType = script.meta && script.meta.arc_type;
    // Brainrot-specific QA validation
    if (arcType === "brainrot") {
      const { isExactValidCue, scoreBrainrotScript } = require("./brainrot-validator");

      // Check message count (5-7 expected)
      const msgCount = script.messages.length;
      if (msgCount < 5 || msgCount > 7) {
        reasons.push(`brainrot_wrong_message_count (got ${msgCount}, expected 5-7)`);
      }

      // Check speaker order: girl/boy/girl/boy/girl
      const expectedSpeakers = ["girl", "boy", "girl", "boy", "girl"];
      script.messages.slice(0, 5).forEach((msg, i) => {
        if (msg && msg.from !== expectedSpeakers[i]) {
          reasons.push(`brainrot_wrong_speaker_at_msg${i + 1} (expected ${expectedSpeakers[i]}, got ${msg.from})`);
        }
      });

      // Check msg3 is exact valid cue (soft warn)
      const msg3Text = script.messages[2] && script.messages[2].text
        ? script.messages[2].text.toLowerCase().trim()
        : "";
      if (!isExactValidCue(msg3Text)) {
        script.meta.qa_signals = script.meta.qa_signals || {};
        script.meta.qa_signals.brainrot_disruption_cue_not_exact = true;
      }

      // Check msg5 word count (soft warn)
      const msg5Text = script.messages[4] && script.messages[4].text;
      if (msg5Text && msg5Text.trim().split(/\s+/).length < 4) {
        script.meta.qa_signals = script.meta.qa_signals || {};
        script.meta.qa_signals.brainrot_msg5_too_short = true;
      }

      // Run full score for qa_signals logging
      const brainrotResult = {
        reply: script.reply && script.reply.text,
        msg1: script.messages[0] && script.messages[0].text,
        msg2: script.messages[1] && script.messages[1].text,
        msg3: script.messages[2] && script.messages[2].text,
        msg4: script.messages[3] && script.messages[3].text,
        msg5: script.messages[4] && script.messages[4].text
      };
      const brainrotScore = scoreBrainrotScript(brainrotResult, {
        bannedPhrases: (config && config.brainrot_banned_phrases) || []
      });
      script.meta.brainrot_score = brainrotScore.score;
      script.meta.brainrot_recontext_score = brainrotScore.recontextScore;
      if (brainrotScore.warnings && brainrotScore.warnings.length > 0) {
        script.meta.brainrot_warnings = brainrotScore.warnings;
      }

      // Hard fails from scorer become QA reasons
      for (const f of brainrotScore.failures) {
        if (f.startsWith("RULE_6") || f.startsWith("RULE_11")) {
          reasons.push(`brainrot_validator: ${f}`);
        }
      }
    }

    if (arcType !== "brainrot" && (!revealMessage || revealMessage.from !== "boy" || !isRevealPunchy(revealMessage.text || ""))) {
      script.meta = script.meta || {};
      script.meta.qa_signals = script.meta.qa_signals || {};
      script.meta.qa_signals.reveal_not_punchy = true;
    }
    // Find a strong ask line among recent boy lines (required for number_exchange only)
    let hasStrongAsk = false;
    for (let ai = script.messages.length - 1; ai >= Math.max(0, script.messages.length - 6); ai--) {
      if (script.messages[ai] && script.messages[ai].from === "boy" && isStrongAskLine(script.messages[ai].text || "")) {
        hasStrongAsk = true;
        break;
      }
    }
    if (arcType === "number_exchange" && !hasStrongAsk) {
      script.meta = script.meta || {};
      script.meta.qa_signals = script.meta.qa_signals || {};
      script.meta.qa_signals.ask_line_weak = true;
      reasons.push("number_exchange missing strong ask");
    }
    // Arc-specific win checks
    const winMessage = script.messages[script.messages.length - 1];
    const hasPhoneInEnding = script.messages.slice(-4).some(
      (m) => m && m.from === "girl" && /555\s?\d{3}\s?\d{4}/.test(m.text || "")
    );
    const winText = winMessage && typeof winMessage.text === "string" ? winMessage.text.toLowerCase() : "";
    if (arcType === "number_exchange") {
      const phoneIndex = findFirstPhoneDropIndex(script.messages);
      if (phoneIndex < 0) {
        reasons.push("number_exchange missing phone drop");
      } else {
        const askBeforePhoneIndex = findLastStrongAskBefore(script.messages, phoneIndex);
        const openerIntensity = classifyOpenerIntensity(script.reply && script.reply.text);
        if (askBeforePhoneIndex < 0) {
          reasons.push("number_exchange missing ask before number");
        } else if (
          openerIntensity === "challenge_heavy" &&
          !hasResistanceBetweenAskAndPhone(script.messages, askBeforePhoneIndex, phoneIndex)
        ) {
          reasons.push("number_exchange missing resistance before number");
        }
      }
      if (!winMessage || winMessage.from !== "girl" || (!isStrongWinLine(winMessage.text || "") && !hasPhoneInEnding)) {
        script.meta = script.meta || {};
        script.meta.qa_signals = script.meta.qa_signals || {};
        script.meta.qa_signals.win_line_weak = true;
        reasons.push("number_exchange ending weak");
      }
    } else if (arcType === "rejection") {
      if (!/\b(not|nah|pass|nice try|not happening|not gonna happen|no shot|good luck)\b/.test(winText)) {
        script.meta = script.meta || {};
        script.meta.qa_signals = script.meta.qa_signals || {};
        script.meta.qa_signals.win_line_weak = true;
      }
    } else if (arcType === "plot_twist") {
      const allText = script.messages.map((m) => (m && m.text ? m.text.toLowerCase() : "")).join(" ");
      if (!/\b(plot twist|actually|surprise|testing)\b/.test(allText)) {
        script.meta = script.meta || {};
        script.meta.qa_signals = script.meta.qa_signals || {};
        script.meta.qa_signals.win_line_weak = true;
      }
    } else if (arcType === "cliffhanger") {
      if (/\b(see you|locked in|youre on|you're on|don't be late)\b/.test(winText)) {
        script.meta = script.meta || {};
        script.meta.qa_signals = script.meta.qa_signals || {};
        script.meta.qa_signals.win_line_weak = true;
      }
    }

    const revealTime =
      revealMessage && typeof revealMessage.type_at === "number" ? revealMessage.type_at : null;
    const winTime =
      winMessage && typeof winMessage.type_at === "number" ? winMessage.type_at : null;
    const firstMessageTime =
      script.messages[0] && typeof script.messages[0].type_at === "number"
        ? script.messages[0].type_at
        : null;
    const firstGirlTime =
      firstGirl && typeof firstGirl.type_at === "number" ? firstGirl.type_at : null;
    const firstSixSecondsCount = script.messages.filter(
      (m) => m && typeof m.type_at === "number" && m.type_at <= 6
    ).length;
    const timingWindows = getTimingWindows(config, script.meta && script.meta.format);
    const revealWindow = timingWindows.reveal;
    const winWindow = timingWindows.win;
    if (typeof revealTime === "number") {
      if (!isFormatB) {
        if (
          (Number.isFinite(revealWindow.min) && revealTime < revealWindow.min) ||
          (Number.isFinite(revealWindow.max) && revealTime > revealWindow.max)
        ) {
          reasons.push("reveal_time out of window");
        }
      }
    }
    if (typeof winTime === "number" && (arcType === "number_exchange" || arcType === "rejection")) {
      const duration = script.meta ? script.meta.duration_s : null;
      // Allow win_time if it's within 1.5s of the video duration (it's the last message)
      const withinDurationTolerance =
        typeof duration === "number" && winTime <= duration && winTime >= duration - 1.5;
      if (
        !withinDurationTolerance &&
        ((Number.isFinite(winWindow.min) && winTime < winWindow.min) ||
         (Number.isFinite(winWindow.max) && winTime > winWindow.max))
      ) {
        script.meta = script.meta || {};
        script.meta.qa_signals = script.meta.qa_signals || {};
        script.meta.qa_signals.win_time_out_of_window = true;
      }
    }

    // Timing diagnostics are tracked as QA signals; canonical gating is in validate-viral-mechanics.js.
    const firstMessageDeadline = isFormatC ? 2.6 : isFormatBLong ? 8.0 : 5.0;
    if (typeof firstMessageTime !== "number" || firstMessageTime > firstMessageDeadline) {
      script.meta = script.meta || {};
      script.meta.qa_signals = script.meta.qa_signals || {};
      script.meta.qa_signals.first_message_late = true;
    }
    if (firstSixSecondsCount < 1) {
      script.meta = script.meta || {};
      script.meta.qa_signals = script.meta.qa_signals || {};
      script.meta.qa_signals.early_pacing_weak = true;
    }
    const pushbackDeadline = isFormatD ? 5 : isFormatBLong ? 8 : 5;
    if (typeof firstGirlTime === "number" && firstGirlTime > pushbackDeadline) {
      script.meta = script.meta || {};
      script.meta.qa_signals = script.meta.qa_signals || {};
      script.meta.qa_signals.pushback_late = true;
    }

    const minGap = isFormatD ? 0.4 : isFormatBLong ? 1.5 : 0.8;
    const maxGap = isFormatD ? 2.2 : isFormatBLong ? 8 : isFormatC ? 2 : 6;
    const firstGapSoftPenalty =
      Number(config && config.script_quality && config.script_quality.first_gap_soft_penalty) || 3.5;
    const firstGapMax =
      Number(config && config.script_quality && config.script_quality.first_gap_max) || 4.8;
    const firstGapAbsoluteHardFail =
      Number(config && config.script_quality && config.script_quality.first_gap_absolute_hard_fail) || 5.5;
    let firstGapValue = null;
    for (let i = 1; i < script.messages.length; i += 1) {
      const prev = script.messages[i - 1];
      const next = script.messages[i];
      if (typeof prev.type_at === "number" && typeof next.type_at === "number") {
        const gap = next.type_at - prev.type_at;
        if (gap < minGap) {
          script.meta = script.meta || {};
          script.meta.qa_signals = script.meta.qa_signals || {};
          script.meta.qa_signals.timing_gap_small = true;
          break;
        }
        const allowedMax = maxGap;
        if (gap > allowedMax) {
          script.meta = script.meta || {};
          script.meta.qa_signals = script.meta.qa_signals || {};
          script.meta.qa_signals.timing_gap_large = true;
          break;
        }
      }
    }
    // Section 14.3.4 first-gap is girl's first response -> boy follow-up, not message[0]->message[1].
    if (typeof firstGirlTime === "number") {
      for (let i = 0; i < script.messages.length; i += 1) {
        const msg = script.messages[i];
        if (!msg || msg.from !== "boy" || typeof msg.type_at !== "number" || msg.type_at <= firstGirlTime) continue;
        const firstGap = msg.type_at - firstGirlTime;
        firstGapValue = firstGap;
        if (firstGap > firstGapAbsoluteHardFail) {
          script.meta = script.meta || {};
          script.meta.qa_signals = script.meta.qa_signals || {};
          script.meta.qa_signals.first_gap_absolute_hard_fail = true;
        } else if (firstGap > firstGapMax) {
          const overrideReason =
            script.meta &&
            script.meta.qa_overrides &&
            typeof script.meta.qa_overrides.first_gap_reason === "string" &&
            script.meta.qa_overrides.first_gap_reason.trim();
          script.meta = script.meta || {};
          script.meta.qa_signals = script.meta.qa_signals || {};
          script.meta.qa_signals.first_gap_hard_fail = !overrideReason;
        }
        break;
      }
    }
    if (typeof firstGapValue === "number" && firstGapValue > firstGapSoftPenalty) {
      // Soft penalty is analytics-only in QA output; don't fail the script.
      script.meta = script.meta || {};
      script.meta.qa_signals = script.meta.qa_signals || {};
      script.meta.qa_signals.first_gap_soft_penalty = true;
      script.meta.qa_signals.first_gap_value = Number(firstGapValue.toFixed(2));
    }

    if (!passesArcIntegrity(script)) {
      reasons.push("arc integrity failed");
    }
    const hasClips =
      script.meta &&
      Array.isArray(script.meta.in_between_assets) &&
      script.meta.in_between_assets.length > 0;
    if (hasClips) {
      const arcType = script.meta && script.meta.arc_type;
      const hasBeatMapping = arcType === "brainrot"
        // Brainrot uses beat_plan.shareable_moment instead of a beats index
        ? Boolean(script.meta && script.meta.beat_plan && script.meta.beat_plan.shareable_moment)
        : script.beats &&
          (Number.isFinite(script.beats.shareable_index) || Number.isFinite(script.beats.reveal_index));
      if (!hasBeatMapping) reasons.push("clip-beat mapping missing");
    }
  }

  if (script.reply && isNonEmptyString(script.reply.text)) {
    if (script.reply.text.length > config.message_max_chars) reasons.push("reply too long");
    const longLine = checkLines(script.reply.text, config.line_max_chars);
    if (longLine) reasons.push("reply line too long");
    const genericHookPatterns = [
      /\bhow to text\b/i,
      /\bwin in ig dms\b/i,
      /\bhow to get\b/i,
      /\btutorial\b/i,
      /\bpart \d+\b/i
    ];
    if (genericHookPatterns.some((pattern) => pattern.test(script.reply.text))) {
      reasons.push("hook authenticity weak");
    }
    const replyWords = script.reply.text.trim().split(/\s+/).filter(Boolean).length;
    if (replyWords < 3) reasons.push("hook specificity weak");
  }

  for (const text of allTexts) {
    const banned = hasBannedPhrase(text, config.banned_phrases);
    if (banned) {
      reasons.push(`banned phrase: ${banned}`);
      break;
    }
    const aiPattern = hasBannedPattern(text, AI_TERM_PATTERNS);
    if (aiPattern) {
      reasons.push("banned AI term");
      break;
    }
    const safetyPattern = hasBannedPattern(text, SAFETY_RISK_PATTERNS);
    if (safetyPattern) {
      reasons.push("safety risk phrase detected");
      break;
    }
  }

  return {
    pass: reasons.length === 0,
    reasons
  };
}

module.exports = { validateScript };
