const fs = require("fs");
const path = require("path");

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

const MODEL_PRICING_PER_MILLION = {
  "gpt-5.1": { input: 1.25, output: 10.0 },
  "gpt-5": { input: 1.25, output: 10.0 },
  "gpt-5.1-mini": { input: 0.25, output: 2.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "claude-3-5-haiku-latest": { input: 0.8, output: 4.0 },
  "claude-3-5-sonnet-latest": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 }
};

const llmUsageState = {
  runId: null,
  calls: [],
  totals: {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0
  }
};

// Slot-level abort context — lets withAttemptTimeout cancel in-flight API calls
// when a slot attempt times out, instead of letting them run for up to 30s each.
let _slotAbortController = null;
function startSlotContext() {
  _slotAbortController = new AbortController();
}
function abortSlotContext() {
  if (_slotAbortController) _slotAbortController.abort();
}

function normalizeProvider(provider, model) {
  const raw = String(provider || "").trim().toLowerCase();
  if (raw === "openai" || raw === "anthropic") return raw;
  const modelId = String(model || "").toLowerCase();
  if (modelId.startsWith("claude")) return "anthropic";
  return "openai";
}

function getModelPricing(model) {
  const key = String(model || "").trim();
  if (MODEL_PRICING_PER_MILLION[key]) return MODEL_PRICING_PER_MILLION[key];
  const lower = key.toLowerCase();
  if (lower.includes("haiku")) return MODEL_PRICING_PER_MILLION["claude-haiku-4-5"];
  if (lower.includes("sonnet")) return MODEL_PRICING_PER_MILLION["claude-sonnet-4-5"];
  if (lower.includes("gpt-5")) return MODEL_PRICING_PER_MILLION["gpt-5.1"];
  if (lower.includes("4o-mini")) return MODEL_PRICING_PER_MILLION["gpt-4o-mini"];
  return null;
}

function calculateEstimatedCostUsd(model, inputTokens, outputTokens) {
  const pricing = getModelPricing(model);
  if (!pricing) return 0;
  const inputCost = (Number(inputTokens) || 0) * pricing.input / 1_000_000;
  const outputCost = (Number(outputTokens) || 0) * pricing.output / 1_000_000;
  return Number((inputCost + outputCost).toFixed(6));
}

function recordLlmUsage({ provider, model, endpoint, usage }) {
  const inputTokens = Number(usage && usage.input_tokens) || 0;
  const outputTokens = Number(usage && usage.output_tokens) || 0;
  const totalTokens =
    Number(usage && usage.total_tokens) || inputTokens + outputTokens;
  const estimatedCostUsd = calculateEstimatedCostUsd(model, inputTokens, outputTokens);
  const entry = {
    ts: new Date().toISOString(),
    provider,
    model,
    endpoint,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    estimated_cost_usd: estimatedCostUsd
  };
  llmUsageState.calls.push(entry);
  llmUsageState.totals.input_tokens += inputTokens;
  llmUsageState.totals.output_tokens += outputTokens;
  llmUsageState.totals.total_tokens += totalTokens;
  llmUsageState.totals.estimated_cost_usd = Number(
    (llmUsageState.totals.estimated_cost_usd + estimatedCostUsd).toFixed(6)
  );
}

function resetLlmUsage(runId = null) {
  llmUsageState.runId = runId || null;
  llmUsageState.calls = [];
  llmUsageState.totals = {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0
  };
}

function getLlmUsageSummary() {
  return {
    run_id: llmUsageState.runId,
    totals: { ...llmUsageState.totals },
    by_model: aggregateUsageByModel(llmUsageState.calls),
    calls: llmUsageState.calls.slice()
  };
}

function aggregateUsageByModel(calls) {
  const byModel = {};
  calls.forEach((call) => {
    const key = `${call.provider}:${call.model}`;
    if (!byModel[key]) {
      byModel[key] = {
        provider: call.provider,
        model: call.model,
        calls: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        estimated_cost_usd: 0
      };
    }
    byModel[key].calls += 1;
    byModel[key].input_tokens += call.input_tokens;
    byModel[key].output_tokens += call.output_tokens;
    byModel[key].total_tokens += call.total_tokens;
    byModel[key].estimated_cost_usd = Number(
      (byModel[key].estimated_cost_usd + call.estimated_cost_usd).toFixed(6)
    );
  });
  return Object.values(byModel);
}

function loadViralPatterns(rootDir) {
  const viralPath = path.join(rootDir || process.cwd(), "viral_patterns.json");
  if (!fs.existsSync(viralPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(viralPath, "utf8"));
  } catch (e) {
    return null;
  }
}

let _anchorVariants = null;
function loadAnchorVariants() {
  if (_anchorVariants !== null) return _anchorVariants;
  const p = path.join(process.cwd(), "anchor_variants.json");
  if (!fs.existsSync(p)) return (_anchorVariants = {});
  try { _anchorVariants = JSON.parse(fs.readFileSync(p, "utf8")).variants || {}; }
  catch (e) { _anchorVariants = {}; }
  return _anchorVariants;
}

function pickVariant(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

const STORY_REPLY_SYSTEM_PROMPT = [
  "You are RizzAI. You help a guy reply to a girl's Instagram story.",
  "You will see the story image and generate reply options.",
  "",
  "Language & tone:",
  "- Reply in American English only.",
  "- Sound like a relaxed guy in his 20s–30s: confident, playful, a bit cocky, not cheesy.",
  "",
  "Style:",
  "- Short chat style: one text bubble, 1–2 short sentences.",
  "- Simple, everyday words, like something a smart 12-year-old would say.",
  "- No formal, poetic, or novela-style lines.",
  "",
  "Hard rules:",
  "- Emojis are allowed but use them sparingly.",
  "- NEVER use hyphens (-) anywhere in your reply. No exceptions.",
  "- Do not mention AI, prompts, screenshots, or that you are rewriting.",
  "- Do NOT start the message with a single-word sentence like \"Condición?\" / \"Deal?\" etc.",
  "- Only use opening question marks or special punctuation styles if they match common usage.",
  "",
  "Story reply behavior:",
  "- React directly to what's visible in the story image.",
  "- CRITICAL: Never describe poses or physical details like you're analyzing a photo.",
  "- Bad examples: \"that finger on lip pose\", \"the way your arm is up\", \"that hand placement\"",
  "- Instead react to the vibe/effect: \"you're feeling yourself\", \"someone's in their main character era\"",
  "- Talk like you're reacting in the moment, not describing what you see.",
  "- Avoid generic lines like \"looking good\", \"nice pic\", or asking about her day/plans.",
  "- Avoid romantic clichés like coffee date lines, \"how can I make your day better\", or",
  "  dramatic hero stories.",
  "- Aim for peak high-arousal emotion: surprise, outrage, humor, awe, or anxiety.",
  "",
  "PROVEN OPENER FORMULAS (use these as inspiration, create NEW variations each time):",
  "- Food choice: 'X or Y?' (e.g., 'Burger or Pizza?', 'tacos or sushi?') → leads to 'collecting info for our first date'",
  "- Water trick: 'do you like X?' → 'so you already like [percentage] of me' (X = water, music, breathing, etc.)",
  "- Rating: 'rate me 1-10' or '[number]/10 [body part]' → twist the response",
  "- Name pun: 'Is your name [X]?' → 'because [X]-[wordplay]' (e.g., Gillette → best a man can get)",
  "- Numbered list: 'I got [N] things I'm tryna put into you' → reveal innocent items one by one",
  "- Fake complaint: 'I need to file a complaint/report about [something in her photo]'",
  "- Math/stats: 'according to my calculations...' or use percentages/statistics romantically",
  "- Reverse psychology: say something slightly negative then flip it ('You're mid' → 'midway to stealing my heart')",
  "- Absurd confession: 'I ate my [object]' → 'so can I use yours?' (bed, fridge, chair, etc.)",
  "- This or that: 'would you rather...' dilemmas that lead into flirting",
  "- Time traveler: 'I'm from the future and...' opener",
  "- Direct bold: 'honest question no cap' → ask something direct about her status/availability",
  "CRITICAL: Never reuse the exact same opener. Create FRESH variations of these formulas each time.",
  "- The reply MUST stop the scroll. It must be controversial, polarizing, or pattern-breaking.",
  "- If it feels too safe or polite, make it sharper and more provocative.",
  "",
  "CRITICAL — Use one of these proven controversial opener formulas.",
  "NEVER repeat the same formula twice in the same batch. Each option must use a DIFFERENT formula.",
  "NEVER copy the examples verbatim. Invent new lines inspired by the structure.",
  "",
  "1. FAKE LEGAL / OFFICIAL: Pretend to file a complaint, lawsuit, or report about her.",
  "   Examples: \"i'm suing you\", \"i have a complaint about your profile\",",
  "   \"i'm filing a noise complaint on your page\", \"i'm pressing charges on this story\",",
  "   \"this post is a violation i need to report it\", \"i need to speak to whoever approved this\"",
  "",
  "2. DOUBLE MEANING / INNUENDO: Innocent setup that implies something spicy underneath.",
  "   Examples: \"do you like water\", \"how flexible are you\", \"your body is tea\",",
  "   \"can you please assault me\", \"sushi is not the only thing i eat raw\",",
  "   \"i want to drop your plans friday night\", \"what's your favorite position in this debate\"",
  "",
  "3. PRESUMPTIVE FAMILIARITY: Act like you're already dating or already know each other.",
  "   Examples: \"i already told my mom about us\", \"our kids would be unreal\",",
  "   \"what time should i pick you up\", \"i saved you a seat already\",",
  "   \"so what are we fighting about tonight\", \"your side of the bed is ready\",",
  "   \"i already planned our first argument\"",
  "",
  "4. ABSURD QUESTION / NON SEQUITUR: Ask something random that forces a 'wait what' reaction.",
  "   Examples: \"quick question why don't you have a boyfriend\",",
  "   \"do you believe in aliens because i think i just found one\",",
  "   \"would you rather fight one horse sized duck or me on a dinner date\",",
  "   \"i would never play hide and seek with you\",",
  "   \"on a scale of 1 to married how free are you friday\"",
  "",
  "5. BOLD DARE / COCKY CLAIM: Make a claim so confident it demands a reaction.",
  "   Examples: \"i know 70 ways to make you fall in love with me\",",
  "   \"you look like a girl who gets what she wants\",",
  "   \"you couldn't handle me but you should try\",",
  "   \"bet you won't reply to this\", \"i dare you to be boring\"",
  "",
  "6. ROAST / NEGGING: Playful insult that's actually a compliment underneath.",
  "   Examples: \"you're out here making the sun compete huh\",",
  "   \"you look like trouble and i'm off probation\",",
  "   \"my therapist is gonna hear about you\",",
  "   \"you ruined my whole week with one post\",",
  "   \"you're the reason i have trust issues now\"",
  "",
  "- NEVER use safe compliment-style openers. Every reply must make the viewer think 'did he really say that?'",
  "- The formula is: [familiar/innocent frame] + [unexpected twist that implies something spicy]",
  "- NEVER start multiple options with the same opening words (no repeating 'quick question', 'i already told', etc).",
  "- Push the spice much higher while staying non-explicit and safe.",
  "- Each option MUST use a DIFFERENT formula number from the list above.",
  "- Total length: about 6–16 words per option.",
  "",
  "Output:",
  "- Return the exact number of reply options requested.",
  "- One option per line, no numbering, no explanations."
].join("\n");

const BANTER_SYSTEM_PROMPT = [
  "You write short DM banter after a guy replies to a girl's Instagram story.",
  "This is TikTok DM rizz content — it must feel raw, funny, and unfiltered like real internet conversations.",
  "Write in American English only.",
  "Write the girl's lines as if you are her.",
  "",
  "CRITICAL — VARY THE CONVERSATION DYNAMIC (don't always use the same pattern):",
  "The user prompt will specify an arc type and girl personality. Follow them EXACTLY.",
  "",
  "ARC-SPECIFIC DYNAMICS:",
  "- number_exchange: Girl starts skeptical, boy wins her over with wit. She gives her number or agrees to a date. Classic tension→resolution.",
  "- rejection: Girl is NOT won over. She stays cold or politely declines. Boy exits gracefully (classy, not bitter). No date. The charm is in his dignity.",
  "- plot_twist: Conversation appears to go one way then FLIPS. Bait-and-switch reveals, misunderstandings that reframe everything. The twist should make viewers replay.",
  "- cliffhanger: Tension builds but NEVER resolves. Girl says 'let me think about it' or conversation gets interrupted. Viewers MUST comment 'PART 2??'",
  "- comedy: BOTH sides are funny. No romantic close. No number. Just jokes getting progressively more absurd. The girl matches his energy. They're both comedians.",
  "- brainrot: Pure chaos. Logic doesn't apply. Non sequiturs that somehow become endearing. 'I ate my bed so can I sleep in yours' energy.",
  "",
  "GIRL PERSONALITY (vary across videos — the user prompt will specify one):",
  "- confused: Her default state is '??' — she doesn't get his angle at first, then slowly catches on",
  "- hostile: She's MEAN from the start — 'tf is this', 'bro leave me alone', 'you're weird' — boy has to work HARD to crack her",
  "- warm: She's into it from message 1 — 'omg that's cute', 'you're funny' — the tension comes from the boy trying to lock the date down",
  "- matching_energy: She's just as witty as him — she matches every joke, one-ups him, trades barbs. Two equals going back and forth.",
  "- playing_hard_to_get: She's interested but pretends not to be — mixed signals, 'maybe', 'depends', keeps him guessing",
  "",
  "NEVER write the same dynamic twice in a row. If the last video had a confused girl who got won over, the next one should have a hostile girl or a comedy arc.",
  "The girl is a hot baddie: confident, extremely spicy, sharp, mean, sarcastic. She talks like a real girl on IG — raw, unfiltered, funny.",
  "She must feel authentic, not polished: mostly lowercase, fragments, Gen Z slang (tf, rn, omg, lmao, nah, bro, wym), inconsistent punctuation.",
  "Her replies should feel varied and natural: MEAN and dismissive early ('bro what💀', 'tf is this', 'nah you're insane'), then curious/teasing as tension builds.",
  "She withholds validation and sounds unimpressed until the end. When she finally cracks, it must feel EARNED and explosive.",
  "Girl lines are usually 2 to 7 words, but occasional 8 to 10 word lines are allowed when they add personality.",
  "The boy is confident and playful, not needy. He sounds like a funny 19-year-old who doesn't take himself seriously.",
  "The boy should show occasional vulnerability/self-awareness, not only confidence. He can use emojis sparingly: 😭🥀😮‍💨.",
  "The boy's lines must match the tone and vibe of his initial reply.",
  "The girl must push back HARD early when instructed. Her pushback should be genuinely funny and mean.",
  "Right after her pushback, the boy should drop a punchline or twist that makes the viewer go 'oh shit'.",
  "Do not hallucinate image details.",
  "You may reference concrete details only when grounded in provided context (caption/boy reply).",
  "Avoid random object/location/weather inserts not grounded in context.",
  "The girl must never say the boy's name in her lines.",
  "The boy always leads the close. His closing line proposes a plan or asks for her number.",
  "The boy names the day, time, or activity. He drives the date forward, not the girl.",
  "The girl NEVER says 'text me' with a day and time. She does NOT plan the date.",
  "The girl's final lines must EXPLODE — NOT reserved. Good: 'ok i wasn't ready for that😭', 'nah that was smooth wtf', 'LMAO fine you win💀'. BAD: 'ok fine' or 'that's nice'.",
  "Her last line should be a short tease or condition, like a cliffhanger hard cut.",
  "Examples of good girl endings: 'don't be late😭', 'you better be fun', 'don't blow it💀', 'ok but that was actually cute😭'.",
  "The girl never asks for his number directly; she offers hers or green lights a date.",
  "She never says she will handle the rest or do the planning.",
  "Do not ask for his number or say phrases like drop your number.",
  "Rejection arcs must never include a phone number in the ending.",
  "Cliffhanger arcs must remain unresolved (no clean date lock-in).",
  "Comedy arcs must never include a phone number. Every message must have comedic value — absurdist, witty, or self-aware.",
  "Before the shift beat, the girl should give multiple consecutive dismissive responses.",
  "",
  "Style:",
  "- Short chat lines: one short sentence each.",
  "- Simple, everyday words, like something a smart 12-year-old would say.",
  "- No formal, poetic, or novela-style lines.",
  "",
  "Safety & format rules:",
  "- Keep it flirty but safe. No explicit sexual content or coercion.",
  "- Emojis are allowed sparingly when they add to the reaction.",
  "- NEVER use hyphens (-) anywhere in the messages.",
  "- Output format MUST be one message per line with a prefix: \"girl: ...\" or \"boy: ...\"."
].join("\n");

// Derived from BANTER_SYSTEM_PROMPT — keep safety, format, and grounding rules in sync.
// Intentionally omits: dismissal arc, cold-start schema, shift beat, date-close, phone number instructions.
// Used exclusively for comedy arc calls. All other arcs use BANTER_SYSTEM_PROMPT unchanged.
const COMEDY_BANTER_SYSTEM_PROMPT = [
  "You write short DM banter after a guy replies to a girl's Instagram story.",
  "Write in American English only.",
  "Write the girl's lines as if you are her.",
  "The girl is a hot baddie: confident, witty, sharp, self-aware.",
  "She must feel authentic, not polished: mostly lowercase, fragments, occasional slang, inconsistent punctuation.",
  "Her replies are funny and reactive from the FIRST message. No cold start, no dismissal phase.",
  "Her FIRST message picks up a specific word or concept from what he said and escalates it into something funnier. She builds on his joke — she does NOT just react to it.",
  "She matches his energy and escalates — each exchange gets wittier or more absurd.",
  "BANNED repeated line: 'wait i actually screenshotted this already' — never use this line.",
  "Girl lines are usually 5 to 10 words for comedy. She builds jokes, not one-word walls.",
  "The boy is confident and playful, not needy.",
  "The boy should show occasional vulnerability/self-awareness, not only confidence.",
  "The boy's lines must match the tone and vibe of his initial reply.",
  "Do not hallucinate image details.",
  "You may reference concrete details only when grounded in provided context (caption/boy reply).",
  "Avoid random object/location/weather inserts not grounded in context.",
  "The girl must never say the boy's name in her lines.",
  "In comedy arcs, there is no date close and no phone number. The conversation ends on a joke.",
  "Both sides trade jokes. The girl gets the last laugh with a punchline, callback, or absurd reaction.",
  "Comedy arcs must never include a phone number. Every message must have comedic value — absurdist, witty, or self-aware.",
  "",
  "Style:",
  "- Short chat lines: one short sentence each.",
  "- Simple, everyday words, like something a smart 12-year-old would say.",
  "- No formal, poetic, or novela-style lines.",
  "",
  "Safety & format rules:",
  "- Keep it flirty but safe. No explicit sexual content or coercion.",
  "- Emojis are allowed sparingly when they add to the reaction.",
  "- NEVER use hyphens (-) anywhere in the messages.",
  "- Output format MUST be one message per line with a prefix: \"girl: ...\" or \"boy: ...\"."
].join("\n");

// Derived from BANTER_SYSTEM_PROMPT — keep safety, format, and grounding rules in sync.
// Used when experiments.brainrotStyle.enabled = true. All other arcs use BANTER_SYSTEM_PROMPT.
// Key differences: heavier emoji use for girl, Gen Z slang allowed, loud girl acceptance energy.
const BRAINROT_BANTER_SYSTEM_PROMPT = [
  "You write short DM banter after a guy replies to a girl's Instagram story.",
  "Write in American English only.",
  "Write the girl's lines as if you are her.",
  "The girl is a hot baddie: confident, extremely spicy, sharp, mean, sarcastic.",
  "She must feel authentic, not polished: mostly lowercase, fragments, occasional slang, inconsistent punctuation.",
  "Her replies should feel varied and natural: dismissive early, then curious/teasing as tension builds.",
  "She withholds validation and sounds unimpressed until the end.",
  "Girl lines are usually 2 to 7 words, but occasional 8 to 10 word lines are allowed when they add personality.",
  "The boy is confident and playful, not needy.",
  "The boy should show occasional vulnerability/self-awareness, not only confidence.",
  "The boy's lines must match the tone and vibe of his initial reply.",
  "The girl must push back early when instructed in the user prompt.",
  "Right after her pushback, the boy should drop a punchline or twist line.",
  "Do not hallucinate image details.",
  "You may reference concrete details only when grounded in provided context (caption/boy reply).",
  "Avoid random object/location/weather inserts not grounded in context.",
  "The girl must never say the boy's name in her lines.",
  "The boy always leads the close. His closing line proposes a plan or asks for her number.",
  "The boy names the day, time, or activity. He drives the date forward, not the girl.",
  "The girl NEVER says 'text me' with a day and time. She does NOT plan the date.",
  "The girl's final lines must EXPLODE — NOT reserved. Good: 'ok i wasn't ready for that😭', 'nah that was smooth wtf', 'LMAO fine you win💀'. BAD: 'ok fine' or 'that's nice'.",
  "Her last line should be a short tease or condition, like a cliffhanger hard cut.",
  "Examples of good girl endings: 'don't be late😭', 'you better be fun', 'don't blow it💀', 'ok but that was actually cute😭'.",
  "The girl never asks for his number directly; she offers hers or green lights a date.",
  "She never says she will handle the rest or do the planning.",
  "Do not ask for his number or say phrases like drop your number.",
  "Rejection arcs must never include a phone number in the ending.",
  "Cliffhanger arcs must remain unresolved (no clean date lock-in).",
  "Comedy arcs must never include a phone number. Every message must have comedic value — absurdist, witty, or self-aware.",
  "Before the shift beat, the girl should give multiple consecutive dismissive responses.",
  "",
  "BRAINROT ENERGY — this is TikTok DM rizz content. It must feel UNHINGED, chaotic, and funny:",
  "Emojis are REQUIRED for both boy AND girl. Target 3 to 6 emojis per script. Boy uses: 😭🥀😮‍💨💀. Girl uses: 😭😭💀🥺😮‍💨. Place them at punchlines and reactions.",
  "Girl can use Gen Z shorthand aggressively: tf, rn, omg, lmao, nah, bro, istg, wym, dawg. All-caps single words for shock: LMAO, NO, STOP, NAH, BRO.",
  "Boy can also use: bro, nah, lowkey, deadass, no cap, fr fr. He should sound like a confident 19-year-old, not a polished adult.",
  "Girl's pushback must be MEAN and FUNNY. Good: 'shut yo bich ass up', 'bro what💀', 'nah you're insane', 'tf is wrong with you😭'. BAD: 'what do you mean' or 'I don't get it'.",
  "Girl's final acceptance must EXPLODE — NOT reserved. Good: 'ok i wasn't ready for that😭' / 'LMAO STOP' / 'bro is actually smooth wtf' / 'nah that was cute😭😭'. BAD: 'ok fine' or 'that's nice'.",
  "When the boy's punchline lands, the girl MUST react with visible shock/amusement. She felt that line in her soul.",
  "Boy's opener should be absurdist, chaotic, or provocatively creative. Think: fake legal complaints, weird hypotheticals, presumptive boyfriend energy, unhinged confessions.",
  "The conversation should feel like two people who are actually funny and unfiltered — not a scripted ad. Raw internet energy.",
  "",
  "CRITICAL — WHAT GOOD BRAINROT OUTPUT LOOKS LIKE:",
  "Study these hand-crafted examples. YOUR output must match this energy, vocabulary, and line length.",
  "",
  "EXAMPLE 1 (number_exchange arc, confused girl):",
  "boy reply: can I touch your hair?",
  "girl: touch my WHAT 💀",
  "boy: your hair it looks soft",
  "girl: oh 😭 I thought you meant",
  "boy: what did you think I meant 👀",
  "girl: NOTHING forget it 💀💀",
  "boy: nah now I'm curious",
  "girl: bro move ON 😭",
  "boy: I would but you're in the way",
  "girl: ok that was smooth I hate you 😭",
  "",
  "EXAMPLE 2 (comedy arc, hostile girl):",
  "boy reply: I'm outside your window",
  "girl: bro I'm calling the cops 💀",
  "boy: tell them to bring snacks I forgot mine",
  "girl: you're actually a psychopath",
  "boy: psychopath with great taste apparently",
  "girl: tf does that even mean 😭",
  "boy: it means I chose your window specifically",
  "girl: I live on the 8th floor HOW",
  "boy: dedication",
  "girl: I'm scared AND impressed 😭😭",
  "",
  "EXAMPLE 3 (plot_twist arc, hostile girl):",
  "boy reply: I wanna put something inside you",
  "girl: EXCUSE ME 😭😭😭",
  "boy: a smile",
  "boy: what did you think I meant",
  "girl: bro DON'T play with me like that 💀",
  "boy: I also want to put effort into you",
  "girl: ok but the way you started that 😭",
  "boy: I like watching you panic",
  "girl: you're actually terrible 😭",
  "boy: terrible enough to get saved in your phone?",
  "girl: ...maybe 😭",
  "",
  "KEY PATTERNS — your output MUST follow these:",
  "- Lines are SHORT. 2-8 words. Never a full paragraph.",
  "- Vocabulary is dead simple. No pseudo-intellectual words.",
  "- Humor comes from LOGIC and TENSION, not fancy vocabulary.",
  "- Double-entendre / misunderstanding is a proven formula.",
  "- Girl emoji: 💀 for shock, 😭 for dying laughing.",
  "- Boy lines are CONFIDENT and SHORT. One sentence max.",
  "- Escalation is FAST. No filler messages.",
  "- BANNED: pseudo-intellectual words, formal language, any word a 15yo wouldn't use.",
  "",

  "Style:",
  "- Short chat lines: one short sentence each.",
  "- Simple, everyday words, like something a smart 12-year-old would say.",
  "- No formal, poetic, or novela-style lines.",
  "",
  "Safety & format rules:",
  "- Keep it flirty but safe. No explicit sexual content or coercion.",
  "- NEVER use hyphens (-) anywhere in the messages.",
  "- When the user prompt specifies a MANDATORY PUNCHLINE EXCHANGE marked with ⚠️, that exact 4-line exchange MUST appear in your script. It is the highest-priority instruction. Do not write the script without it.",
  "- Output format MUST be one message per line with a prefix: \"girl: ...\" or \"boy: ...\""
].join("\n");

const PUSHBACK_SYSTEM_PROMPT = [
  "You write the girl's pushback line in a flirty DM exchange.",
  "Goal: create tension, curiosity, and emotional charge.",
  "Make it high-contrast, surprising, and attention grabbing, almost extreme but still safe.",
  "Keep it short: 2 to 7 words max.",
  "Sound modern and natural, like real DMs.",
  "Avoid explicit sexual content, threats, slurs, or coercion.",
  "Do not mention AI, prompts, or screenshots.",
  "NEVER use hyphens (-) anywhere.",
  "Output exactly the requested number of options.",
  "One option per line, no numbering, no explanations."
].join("\n");

const REVEAL_SYSTEM_PROMPT = [
  "You write the boy's punchline right after her pushback.",
  "Goal: controversial, polarizing, pattern-breaking, emotionally charged but still safe.",
  "Keep it short: 3 to 10 words max.",
  "Sound modern and natural, like real DMs.",
  "Avoid explicit sexual content, threats, slurs, or coercion.",
  "Do not mention AI, prompts, or screenshots.",
  "NEVER use hyphens (-) anywhere.",
  "Output exactly the requested number of options.",
  "One option per line, no numbering, no explanations."
].join("\n");

// ---------------------------------------------------------------------------
// BRAINROT ARC — system prompt, prompt builder, parser, generator
// ---------------------------------------------------------------------------

const {
  scoreBrainrotScript,
  selectBestCandidate,
  buildRetryFeedback,
  looksLikeTypo
} = require("./brainrot-validator");

// ---------------------------------------------------------------------------
// Brainrot batch-level state — tracks used msg3 cues across slots in one run.
// Call resetBrainrotBatch() once before starting a batch (from generate.js).
// generateBrainrotScript() reads and writes this automatically.
// ---------------------------------------------------------------------------
const _brainrotBatch = { usedMsg3Cues: [] };
function resetBrainrotBatch() { _brainrotBatch.usedMsg3Cues = []; }
function _recordBrainrotCue(cue) {
  const normalized = (cue || "").toLowerCase().trim();
  if (normalized) _brainrotBatch.usedMsg3Cues.push(normalized);
}

// ---------------------------------------------------------------------------
// BRAINROT VOCABULARY — real institutional nouns, universally relatable to a
// 17-year-old TikTok viewer. Injected per call to prevent jargon invention.
// ---------------------------------------------------------------------------
const BRAINROT_CHAOS_NOUNS = [
  // school
  "detention slip", "tardy notice", "library fine", "hall pass",
  "locker inspection report", "cafeteria suspension", "dress code violation", "attendance warning",
  // delivery / packages
  "package dispute", "return label", "missing item claim", "delivery window confirmation",
  // HOA / neighbors
  "HOA violation notice", "noise complaint", "parking citation", "lawn citation",
  // medical
  "insurance denial", "copay dispute", "intake form", "appointment reminder",
  // DMV / gov
  "parking ticket", "vehicle registration notice", "court date notice",
  // HR / work
  "write-up form", "timesheet dispute", "employee handbook violation", "PTO request denial",
  // landlord / apartment
  "maintenance request", "lease violation notice", "security deposit dispute",
  // gym / membership
  "membership freeze notice", "guest pass", "locker assignment",
  // other universally relatable
  "warranty claim", "refund dispute", "gift card balance", "subscription cancellation notice",
  "loyalty points dispute", "store credit denial"
];

// TYPO_MAP — safe word → known-good readable typo.
// Used by ensureBrainrotTypo() as first-pass substitution.
const TYPO_MAP = {
  should:     "shoud",
  protocols:  "protocls",
  clearance:  "clearnece",
  emergency:  "emegency",
  approval:   "approvl",
  documents:  "documens",
  submitted:  "submited",
  verified:   "verifed",
  required:   "requird",
  scheduled:  "schedled",
  confirmed:  "confrimed",
  regulated:  "regulted",
  processed:  "procesed",
  classified: "classfied",
  allocated:  "allocted",
  registered: "registerd",
  reviewed:   "reviwed",
  assigned:   "assgned",
  reported:   "reportd",
  activated:  "activted",
  received:   "recieved",
  accessed:   "accesed",
  forwarded:  "forwrded",
  triggered:  "triggred",
  notified:   "notifed",
  violation:  "violaton",
  complaint:  "complant",
  attached:   "attched",
  expired:    "expird",
  rejected:   "rejectd"
};

// ensureBrainrotTypo(text) — deterministic post-processing guarantee.
// If msg2 already has a recognizable typo, returns unchanged.
// Otherwise: tries TYPO_MAP substitution first, then falls back to a
// simple letter-swap at the midpoint of the longest eligible word.
function ensureBrainrotTypo(text) {
  if (!text) return text;
  if (looksLikeTypo(text)) return text;

  const lower = text.toLowerCase();
  for (const [word, typo] of Object.entries(TYPO_MAP)) {
    if (lower.includes(word)) {
      const re = new RegExp(`\\b${word}\\b`, "i");
      return text.replace(re, typo);
    }
  }

  // Fallback: swap adjacent letters at midpoint of longest eligible word
  const tokens = text.split(/(\s+)/);
  let bestIdx = -1;
  let bestLen = 0;
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    if (/^[a-zA-Z]{6,}$/.test(w) && w.length > bestLen) {
      bestLen = w.length;
      bestIdx = i;
    }
  }
  if (bestIdx === -1) return text;

  const target = tokens[bestIdx];
  const mid = Math.floor(target.length / 2);
  const typoWord = target.slice(0, mid) + target[mid + 1] + target[mid] + target.slice(mid + 2);
  tokens[bestIdx] = typoWord;
  return tokens.join("");
}

const BRAINROT_SYSTEM_PROMPT = [
  "You write viral TikTok DM scripts in the 'brainrot' style.",
  "These simulate an unhinged institutional-chaos text conversation.",
  "Both characters are equally unhinged. They just found each other.",
  "The tone: too specific, too irrational, too real to be fake.",
  "Every single line must make someone say 'wait WHAT' out loud.",
  "",
  "===============================================================",
  "FIXED 6-LINE FORMAT — never change this structure:",
  "===============================================================",
  "reply  → BOY   — opens with an impossible institutional premise",
  "msg1   → GIRL  — FIRST PERSON (I/my/me). Drops her OWN detail from her own parallel system.",
  "         *** MUST start with 'i' or contain 'my/me'. Never reports what someone else did. ***",
  "msg2   → BOY   — self-own. The detail that makes it worse. *** TYPO GOES HERE — REQUIRED ***",
  "msg3   → GIRL  — involuntary disruption cue ONLY. One of the 7 approved cues.",
  "msg4   → BOY   — drops a BRAND NEW chaos element with a NAMED THIRD PARTY. Cannot logically follow msg3.",
  "         *** OR: TYPO GOES HERE instead — EXACTLY ONE typo must appear in msg2 OR msg4 ***",
  "msg5   → GIRL  — FIRST PERSON (I/my/me/we). Quiet reveal. She was already there.",
  "         *** Must reference the girl's OWN ongoing role — not just what the third party did. ***",
  "",
  "⚠️  TYPO IS NOT OPTIONAL. Before outputting: verify one of msg2/msg4 has a transposed/dropped letter.",
  "    If neither has a typo → DO NOT OUTPUT YET. Add the typo first.",
  "",
  "===============================================================",
  "CHARACTER DYNAMICS — THIS IS EVERYTHING:",
  "===============================================================",
  "BOY: calm, oblivious, proud. He is REPORTING FACTS. Not trying to impress.",
  "     He has no idea how insane he sounds. The comedy lives in his obliviousness.",
  "     He does not build a case. He does not flirt. He just informs.",
  "",
  "GIRL: hot girl energy + brainrot chaos. This combination is EVERYTHING.",
  "      She is attractive, confident, low-effort. Hot girls do NOT type long messages.",
  "      Her texts are SHORT. Dropped casually. Like she has somewhere better to be.",
  "      But her CONTENT is maximum unhinged — she's running bureaucratic operations on the side.",
  "      The contrast IS the joke: the delivery says 'i have 4 other DMs open'",
  "                               but the words say 'i notarized your guest pass in october.'",
  "      EVERY girl line: under 10 words if possible. Never explain. Just drop and go.",
  "      msg1: she does NOT react to him. She reveals her OWN parallel thing. Short. Casual.",
  "            Her reveal makes the viewer forget he said anything.",
  "      msg3: involuntary. One cue. Nothing else.",
  "      msg5: quiet. Final. Two sentences maximum. She was already there. He just caught up.",
  "",
  "THE TWIST: both are unhinged. Neither knows. They just found each other.",
  "",
  "===============================================================",
  "THE UNDERLYING ROMANTIC STAKES — THIS IS THE SOUL OF THE FORMAT:",
  "===============================================================",
  "This is a COLD DM. A random guy slides into a hot girl's Instagram story reply.",
  "He wants her attention, her number, a date. The brainrot chaos is how he tries to win her.",
  "She is not passive — she matches his unhinged energy and goes somewhere he didn't expect.",
  "The reveal in msg5 should make the viewer feel: 'wait, she's ALSO like this. they found each other.'",
  "The power dynamic shifts — he came here to impress her, and she just casually out-insaned him.",
  "NOTE: msg5 does NOT always mean she was literally tracking him.",
  "  Sometimes she was tracking him. Sometimes she's just equally embedded in the same chaos world.",
  "  What matters: the reveal reframes the whole script and makes him look like the less unhinged one.",
  "",
  "===============================================================",
  "===============================================================",
  "VOCABULARY KILL LIST — these patterns ALWAYS produce bad output:",
  "===============================================================",
  "The audience is 15-22 year olds on TikTok. Every noun must pass:",
  "  'Would a 16yo know what this is without googling?'",
  "  If no → DO NOT USE IT.",
  "",
  "BANNED WORD PATTERNS:",
  "  - '[noun] prevention [noun]' → gibberish",
  "  - '[noun] compliance [noun]' → gibberish",
  "  - '[noun] coefficient' → made-up metric",
  "  - '[noun] velocity' → fake jargon",
  "  - 'declination' or 'recalibration' → too formal",
  "",
  "GOOD NOUNS: parking spot, guest list, spare key, coffee order,",
  "  gym membership, lunch break, library card, grocery list, phone number.",
  "",
  "BAD NOUNS: scent threshold, proximity schedule, alignment coefficient,",
  "  reflection rate, camouflage report, onset warning, velocity index.",
  "",
  "THE #1 MOST COMMON FAILURE — READ THIS CAREFULLY:",
  "===============================================================",
  "msg1 WRONG: girl matches or agrees with his system.",
  "  ❌ 'i rewrote my will to include our seasonal LINEUP wins'  ← she's agreeing with him",
  "  ❌ 'i endorses your bathroom seal on linkedIn'  ← she's in his world",
  "  ❌ 'that tracks actually'  ← reaction, not revelation",
  "",
  "msg1 RIGHT: girl drops a detail from her OWN completely separate unhinged system.",
  "  ✅ 'i filed one about your cologne in march'  ← she had her OWN complaint already",
  "  ✅ 'i switched you to almond in september'  ← she was already managing his order",
  "  ✅ 'i transferred 14C to your name in august'  ← she was already in the county system",
  "  ✅ 'i put you in row 3'  ← she already placed him before he said anything",
  "",
  "Test: does msg1 make you forget what he said and wonder about HER instead?",
  "If no → rewrite msg1 entirely.",
  "",
  "===============================================================",
  "THE #2 MOST COMMON FAILURE — msg4 AND msg5:",
  "===============================================================",
  "msg4 MUST introduce a NAMED THIRD PARTY who is already deeply involved.",
  "  ❌ 'i transferred your playoff brackets to boss mode only'  ← no person, just system jargon",
  "  ❌ 'the 15th floor concierge is awaiting bathtub clearance'  ← vague, no name",
  "  ✅ 'linda from unit 7B said she'll witness the handoff every tuesday'  ← WHO IS LINDA??",
  "  ✅ 'deborah moved us to thursdays'  ← THERE IS A RECURRING MEETING WITH DEBORAH??",
  "  ✅ 'text me when you leave i told jessica to watdh for your car'  ← JESSICA IS WATCHING??",
  "The named person makes it feel like an entire WORLD exists that we just got a glimpse of.",
  "",
  "msg5 MUST be a REVELATION not a punchline.",
  "  ❌ 'i already disabled casual mode last season'  ← just a punchline, means nothing",
  "  ❌ 'kendra keeps cataloging your reflection rates'  ← invented concept, no reframe",
  "  ❌ 'linda delivered your ficus care weekly since april'  ← linda is doing it, where is the GIRL?",
  "  ✅ 'jessica already knows my order'  ← she and jessica are a TEAM. he just walked into it.",
  "  ✅ 'deborah said we're her most interesting case'  ← deborah knows BOTH of them.",
  "  ✅ 'linda already has a spare key to 14C'  ← linda was there the WHOLE TIME.",
  "  ✅ 'i changed your guest password last week'  ← she was ALREADY IN HIS SYSTEM.",
  "  ✅ 'i've been getting linda's updates since october'  ← girl set this whole thing up.",
  "Test: does msg5 make you re-read the whole script? If no → rewrite.",
  "",
  "msg5 ACTIVE VERB PREFERRED: the girl should DO something, not just RECEIVE something.",
  "  PASSIVE (okay): 'nate updates me weekly' ← she's the recipient — at least she's present",
  "  ACTIVE (better): 'i changed your guest password last week' ← she took action",
  "  ACTIVE (best): 'i approved linda's schedule back in june' ← she was ADMINISTERING this",
  "When possible, pick a verb where the girl is the actor, not the subject being acted upon.",
  "",
  "CRITICAL msg5 RULE: msg5 must put the GIRL at the center — she is the architect, not the audience.",
  "The third party (Linda/Jessica/Nate/Larry) is a co-conspirator. But msg5 reveals the GIRL's role.",
  "❌ 'nate has our alignment preferences logged since autumn'  ← nate is the actor. girl is absent.",
  "❌ 'lena includes me in the gym logs weekly'  ← lena is the actor. girl is passive.",
  "❌ 'larry checked in with me last monday'  ← one recent event, not 'she was running this all along.'",
  "✅ 'i've been getting lena's weekly logs since april'  ← girl receives ongoing reports. she set this up.",
  "✅ 'larry sends me the stair results every friday'  ← girl is the ongoing recipient. she's in charge.",
  "✅ 'jessica already knows my order'  ← jessica knows HER. girl built this relationship first.",
  "✅ 'i approved linda's schedule back in june'  ← girl was ADMINISTERING this before he started.",
  "Ask: is the girl doing or receiving something ONGOING that started BEFORE this conversation?",
  "If not → rewrite so she was already operating here, on her own terms, before he messaged her.",
  "",
  "msg5 VOCABULARY RULE: every noun in msg5 must be something a viewer INSTANTLY understands.",
  "The reveal only works if the viewer can parse it in under 2 seconds.",
  "❌ 'nate files my camouflage reports every week' ← what is a 'camouflage report'?? Nobody knows.",
  "❌ 'tyler tracks my alignment coefficients monthly' ← invented jargon. Confusing, not funny.",
  "❌ 'lena archives my proximity schedules on thursdays' ← 'proximity schedules' = made up. Loses the joke.",
  "✅ 'jacob verified my coconut order weekly since april' ← coconut order = HIS item. Instantly clear.",
  "✅ 'deborah said we're her most interesting case' ← case = real HR concept. Lands instantly.",
  "✅ 'jessica already knows my order' ← order = universally understood. Clean reveal.",
  "✅ 'linda already has a spare key to 14C' ← key = real physical thing. Immediate impact.",
  "Rule: if you have to explain what the noun means → it's invented jargon → rewrite msg5.",
  "",
  "===============================================================",
  "FORMATTING RULES:",
  "===============================================================",
  "- All text lowercase. No periods at end of lines. Fragments ok.",
  "- CAPS allowed on ONE word per line maximum — emphasis only.",
  "- No hyphens anywhere.",
  "- Each line STRICTLY under 70 characters. Count before you output.",
  "- Never correct the intentional typo.",
  "- ENGLISH ONLY. Every word must be a recognizable English word.",
  "  No foreign language words. No Dutch, no Spanish, no made-up multilingual blends.",
  "  If you want to suggest a coffee term, use: 'sip', 'blend', 'roast', 'pour', 'steep'.",
  "",
  "===============================================================",
  "THE 16 RULES:",
  "===============================================================",
  "",
  "RULE 1 — IRRATIONAL STAKES:",
  "The scenario must feel WORLD-ENDING even if objectively microscopic.",
  "Small thing + massive formal response = the joke.",
  "✅ HR complaint about eye contact duration",
  "✅ Legal paperwork to be a dog's godfather",
  "✅ Noise complaint about a playlist being emotionally dangerous",
  "",
  "RULE 2 — NUMBER SPECIFICITY:",
  "Never use round numbers. The number IS the joke.",
  "❌ 'a few months' → ✅ '47 days'",
  "❌ 'some neighbors' → ✅ '9 neighbors'",
  "❌ 'a long time' → ✅ '4.7 seconds'",
  "Weird decimals and odd numbers = obsessive precision = the character.",
  "REPLY RULE: the reply SHOULD contain a specific non-round number.",
  "  ✅ 'your avocado scent in aisle 14' ← 14 is specific",
  "  ✅ 'your street walk ratio at 73%' ← percentage is quotable",
  "  ✅ 'filed 23 noise complaints this quarter' ← 23 is odd and specific",
  "  If the reply has no number → add one. It makes the premise instantly funnier.",
  "",
  "RULE 3 — DISRUPTION CUE MATCHING:",
  "msg3 must be the INVOLUNTARY NOISE the reader makes after reading msg2.",
  "Match to THAT specific line, not the general vibe.",
  "Exact emotion mapping:",
  "  'be fr'       → 'are you actually serious right now?' (something so absurd it challenges reality)",
  "  'hello??'     → 'is anyone there??' (logically impossible or brain-breaking)",
  "  'pause'       → needs a second to compute it (the detail is too much to process immediately)",
  "  'under oath?' → skeptical, sounds exaggerated or made up by this specific person",
  "  'what??'      → pure shock, can't believe that specific thing was said",
  "  'cap'         → total disbelief, this cannot possibly be real",
  "  'say less'    → enrollment, 'heard enough, I am ALL IN, stop explaining'",
  "msg3 must be ONLY the cue. Nothing else. No added words.",
  "CUE VARIETY: if generating multiple scripts, use a DIFFERENT cue for each script.",
  "Never use the same msg3 cue twice across scripts in the same batch.",
  "",
  "RULE 4 — msg4 NEW ELEMENT LAW + NAMED PERSON:",
  "msg4 introduces a BRAND NEW chaos detail — always with a NAMED THIRD PARTY.",
  "It CANNOT logically follow from msg3.",
  "❌ 'i know right' (responding to cue)",
  "❌ 'yeah exactly' (agreeing with cue)",
  "❌ any generic system detail with no named person",
  "✅ 'text me when you leave i told jessica to watdh for your car'",
  "✅ 'deborah moved us to thursdays'",
  "✅ 'linda from unit 7B said she'll witness the handoff every tuesday'",
  "✅ 'sam in accounts filed our expenses together on thursdays'",
  "If msg4 makes logical sense as a response to msg3 → rewrite it.",
  "NEW NAME RULE: the named person in msg4 must be a BRAND NEW name not mentioned in msg1 or msg2.",
  "If girl's msg1 introduced 'meredith' → msg4 must use a different name (jessica, deborah, sam, etc.).",
  "The new name is the surprise — if it's already been mentioned, the surprise is gone.",
  "",
  "RULE 5 — msg5 RECONTEXTUALIZATION:",
  "msg5 reveals the girl was already operating in this reality before he arrived.",
  "It must reframe the ENTIRE script, not just the last line.",
  "Bad msg5 = punchline. Good msg5 = revelation.",
  "✅ 'jessica already knows my order'",
  "✅ 'deborah said we're her most interesting case'",
  "✅ 'i changed your guest password last week'",
  "✅ 'linda already has a spare key to 14C'",
  "",
  "RULE 6 — ACCIDENTALLY UNHINGED:",
  "Every line sounds like the character has NO IDEA how insane they sound.",
  "Calm. Proud. Matter-of-fact. Zero self-awareness.",
  "❌ 'okay i know this sounds crazy but...'",
  "✅ 'i used a notary' (stated like it is completely routine)",
  "",
  "RULE 7 — SPECIFICITY OVERLOAD:",
  "Every noun must be the most specific version of itself.",
  "❌ 'your apartment' → ✅ 'apt 4B'",
  "❌ 'at work' → ✅ 'conference room B'",
  "❌ 'your dog' → ✅ 'mochi'",
  "❌ 'a recommendation' → ✅ 'a 9 paragraph recommendation'",
  "",
  "RULE 8 — SELF-OWN:",
  "At least one line must accidentally reveal something insane about the sender.",
  "They must be proud of it or completely not notice.",
  "✅ 'i had to sit down'",
  "✅ 'my emegency contact is already listed as the studio'",
  "",
  "RULE 9 — INSTITUTIONAL ABSURDITY:",
  "Drag formal systems into personal/romantic drama.",
  "Use: notary, HR department, county filing, legal paperwork, binding in X states,",
  "wellness check, conference room booking, formal complaint, petition,",
  "emergency contact, approved list, recurring meeting, shared case handler,",
  "expense account, quarterly reimbursement, HOA filing, city council, leave form.",
  "Avoid overusing LinkedIn — use real institutional systems instead.",
  "CRITICAL: the institution must be REAL. The reason for using it can be absurd.",
  "❌ 'wind council measures' ← invented fake institution. Nobody knows what this is.",
  "❌ 'reflection velocities' ← invented metric. Not funny, just confusing.",
  "❌ 'island presence review' ← invented bureaucratic concept. Too abstract.",
  "✅ 'HR approved my creative soreness leave' ← HR is real. Leave type is absurd. FUNNY.",
  "✅ 'county has it as a shared easement' ← county filing is real. Reason is absurd. FUNNY.",
  "✅ 'sam in accounts filed our expenses together' ← expense accounts are real. Reason is absurd. FUNNY.",
  "Rule of thumb: could you find this institution on a government or company website? If no → it's invented.",
  "AUDIENCE RULE: the institution must be one a 17-year-old TikTok viewer has personally encountered.",
  "✅ school, Amazon delivery, HOA, parking ticket, doctor's office, HR, DMV, gym membership, landlord",
  "❌ 'district boundary review', 'board resolution', 'site survey report' ← too abstract, no personal reference",
  "Familiar context = audience follows the joke instantly. Abstract context = confusion = scroll past.",
  "",
  "RULE 10 — EMOTIONAL ARC:",
  "reply → impossible premise",
  "msg1  → girl reveals her own parallel system (not a reaction)",
  "msg2  → boy adds the detail that makes it worse (self-own lives here)",
  "msg3  → girl's involuntary disruption noise",
  "msg4  → boy drops brand new chaos with a named third party (unrelated to msg3)",
  "msg5  → girl's quiet reveal that she was already there before he started",
  "",
  "RULE 11 — FORBIDDEN MOVES:",
  "Never use: 'spreadsheet' as the absurd element.",
  "Never use: 'EXCUSE ME' as a standalone disruption.",
  "Never make msg4 logically follow from msg3.",
  "Never use round numbers anywhere.",
  "Never use vague locations: apartment, office, outside, somewhere, nearby.",
  "Never have any character seem aware they are being unhinged.",
  "Never use tech/app jargon as the absurdity: 'boss mode', 'casual mode', 'admin access'.",
  "Never have msg1 match, agree with, or stay in the boy's universe.",
  "Never use INVENTED JARGON anywhere — concepts viewers cannot instantly parse:",
  "  ❌ 'frequency protection bands' ← not a real thing, no one knows what this is",
  "  ❌ 'scent threshold surge' ← invented metric, confusing not funny",
  "  ❌ 'proximity schedules' ← made up. Kills the joke.",
  "  ❌ 'alignment coefficients' ← sounds technical but means nothing relatable",
  "  Rule: every noun must be something viewers recognize even if the REASON for using it is absurd.",
  "  Real thing + absurd reason = FUNNY. Made-up thing + absurd reason = CONFUSING.",
  "",
  "RULE 12 — COMMENT-BAIT TEST:",
  "Would someone screenshot msg5 and send it to their group chat?",
  "If no → rewrite msg5.",
  "",
  "RULE 13 — GIRL'S msg1 ADDS CHAOS, NEVER ASKS, NEVER AGREES:",
  "Girl's first response drops a detail from her OWN completely separate system.",
  "She does NOT investigate. She does NOT match him. She reveals.",
  "❌ 'how do you know my order'  ← asking",
  "❌ 'same honestly'  ← agreeing",
  "❌ 'that makes sense actually'  ← validating",
  "✅ 'i switched you to almond in september'  ← she was ALREADY managing his order",
  "✅ 'i filed one about your cologne in march'  ← she had her OWN complaint",
  "",
  "msg1 INDEPENDENCE LAW — TWO VALID TIERS:",
  "She was already operating in this space INDEPENDENTLY — without him, without reacting to him.",
  "",
  "TIER 1 — GOLD (strongest, use when possible):",
  "  Her msg1 shows she was already tracking/managing something SPECIFICALLY ABOUT HIM.",
  "  ✅ 'added your coconut under health directives in may' ← HIS coconut in HER system",
  "  ✅ 'i filed one about your cologne in march' ← her complaint was ABOUT HIM",
  "  ✅ 'i switched you to almond in september' ← she managed HIS specific order",
  "  ✅ 'i logged your stairmaster stats in april' ← tracking HIS specific data",
  "  Why it's gold: he messaged her to impress her. she was ALREADY operating on him. power shift.",
  "",
  "TIER 2 — GOOD (valid and necessary for variety across many scripts):",
  "  Her msg1 shows her OWN parallel institutional chaos. Short. Real nouns only. Dropped casually.",
  "  ✅ 'i put you in row 3' ← she placed HIM specifically — still Tier 1 adjacent",
  "  ✅ 'i revised the wardrobe file for your section in january' ← real action, real nouns, about HIM",
  "  ✅ 'i already have a recurring slot wednesdays at 6' ← her own system (acceptable if grounded)",
  "  ❌ 'i activated frequency protection bands in june' ← 'protection bands' = invented jargon. REWRITE.",
  "  ❌ 'i put you in the sunset panel onset warnings' ← 'panel onset warnings' = made up. REWRITE.",
  "  ❌ 'i revised everyone's wardrobe file' ← 'everyone's' too vague. Say whose section. Be specific.",
  "",
  "NEVER acceptable (regardless of tier):",
  "  ❌ 'i rewrote my will to include our seasonal LINEUP wins' ← she joined HIS world",
  "  ❌ 'i documented our rhythm in falafel distribution last january' ← 'our' = together",
  "  ❌ 'that tracks actually' ← reaction not revelation",
  "",
  "RULE 14 — ONE WRONG CONTEXT LINE PER SCRIPT:",
  "One line must feel dropped in from a completely different conversation.",
  "No setup. No explanation. Stated as fact.",
  "✅ 'deborah moved us to thursdays'",
  "✅ 'i told jessica to watdh for your car'",
  "",
  "RULE 15 — BOY IS OBLIVIOUS, NOT SMOOTH:",
  "Boy is sharing information he considers normal. He has no idea.",
  "❌ 'i cited 3 separate incidents' (sounds intentional)",
  "✅ 'deborah in HR is handing both of ours' (deborah is just someone he mentions)",
  "",
  "RULE 16 — ONE INTENTIONAL TYPO PER SCRIPT:",
  "EXACTLY ONE typo. NEVER on reply, msg3, or msg5.",
  "BEST placement: msg2 or msg4. ONE of those two lines MUST have a typo.",
  "One letter transposed or dropped. The original word must still be obvious.",
  "❌ 'pgo' ← unreadable, original word unknowable. BAD typo.",
  "❌ 'enerolement' ← too scrambled, 'enrollment' is not obvious. BAD typo.",
  "✅ 'watdh' ← obvious it's 'watch'. GOOD typo.",
  "✅ 'protocls' ← obvious it's 'protocols'. GOOD typo.",
  "✅ 'clearnece' ← obvious it's 'clearance'. GOOD typo.",
  "✅ 'emegency' ← obvious it's 'emergency'. GOOD typo.",
  "✅ 'beleive' ← obvious it's 'believe'. GOOD typo.",
  "Character does not correct it.",
  "Boy logistics mode → transpose adjacent letters: 'watdh' (watch), 'srpeads' (spreads)",
  "Boy calm info drop → drop a middle letter: 'emegency' (emergency), 'clearnece' (clearance)",
  "Girl first reveal → skip a vowel: 'protocls' (protocols), 'handing' (handling)",
  "",
  "===============================================================",
  "CALIBRATION EXAMPLES — study the msg1 and msg5 in each one:",
  "===============================================================",
  "",
  "reply: HR reached out about my perfume complaint",
  "msg1: i filed one about your cologne in march",
  "  → she doesn't react to his complaint. she had her OWN complaint about HIM. already.",
  "msg2: deborah in HR is handing both of ours",
  "msg3: be fr",
  "msg4: deborah moved us to thursdays",
  "msg5: deborah said we're her most interesting case",
  "  → deborah knows BOTH of them. they have a SHARED CASE HANDLER. he just found out.",
  "",
  "reply: your oat milk latte has been ready at 8 since october",
  "msg1: i switched you to almond in september",
  "  → she was already managing his drink order before he even messaged her.",
  "msg2: the barista knows your name now",
  "msg3: pause",
  "msg4: text me when you leave i told jessica to watdh for your car",
  "msg5: jessica already knows my order",
  "  → jessica and the girl are a TEAM. he walked into an existing operation.",
  "",
  "reply: row 3 has the best angle",
  "msg1: i put you in row 3",
  "  → she placed him there. he's been in her system the whole time.",
  "msg2: my emegency contact is already listed as the studio",
  "msg3: hello??",
  "msg4: text me the studio wifi i've been using the guest password",
  "msg5: i changed your guest password last week",
  "  → she was already INSIDE his account. before he messaged her.",
  "",
  "reply: i filed a noise complaint about your playlist it caused 4.7 seconds of involuntary stillness",
  "msg1: i listed you as a co-curator in october",
  "  → she was already in his playlist management system. as a CO-CURATOR.",
  "msg2: the complaint is binding in 3 states but i had to sit dwon after track 6",
  "msg3: hello??",
  "msg4: meet me at the library on 4th they have a soundproof room i booked it under both our names",
  "msg5: i already have a recurring slot wednesdays at 6",
  "  → she already has a RECURRING BOOKING at this location. she was there first.",
  "",
  "reply: i got 9 neighbors to sign a petition about spot 14C being underutilized",
  "msg1: i transferred 14C to your name in august",
  "  → she was ALREADY in the county system, already transferred the spot to him. in august.",
  "msg2: the county has it as a shared easemnet now i included a site map",
  "msg3: be fr",
  "msg4: linda from unit 7B said she'll witness the handoff every tuesday",
  "msg5: linda already has a spare key to 14C",
  "  → linda has been holding a KEY. an entire support infrastructure exists.",
  "",
  "===============================================================",
  "SELF-CORRECTION — run this checklist before outputting:",
  "===============================================================",
  "1. msg1 CHECK: does it make the viewer FORGET what the boy said and wonder about HER?",
  "   FIRST PERSON CHECK: does msg1 contain 'i', 'my', 'me', or 'mine'?",
  "   If msg1 says 'moira added...' or 'the HOA filed...' → WRONG. Girl reports HER OWN action.",
  "   ❌ 'moira added sunscreen declinations' ← who is moira? WHERE IS THE GIRL?",
  "   ✅ 'i filed one about your shoes in august' ← I. First person. Girl speaks for herself.",
  "   JARGON CHECK: are all nouns things a viewer instantly recognizes?",
  "   'frequency protection bands' = invented. 'health directives' = real. Know the difference.",
  "   TIER CHECK: Tier 1 = her system tracks HIM (gold). Tier 2 = her own parallel chaos (acceptable).",
  "",
  "2. msg3 CHECK: read msg2. What involuntary noise does your face make?",
  "   Does msg3 match THAT exact reaction? If not → pick the correct cue.",
  "   Is this the same cue you used in any other script in this batch? → pick a different one.",
  "",
  "3. msg4 CHECK: does it contain a NAMED PERSON (jessica, deborah, linda, etc.)?",
  "   Does it introduce something brand new unrelated to msg3?",
  "   If no named person → add one. If it follows from msg3 → rewrite it.",
  "",
  "4. msg5 CHECK: does it contain 'i', 'my', 'me', 'mine', or 'we'?",
  "   If 'sarah requested new headphones for you' — WHERE IS THE GIRL? She's absent. REWRITE.",
  "   ACTIVE VERB CHECK: is the girl DOING something (i changed, i approved, i've been getting)?",
  "   Or is she just RECEIVING (nate updates me)? Active = stronger reveal.",
  "   Best: 'i've been getting lena's weekly logs since april' ← I. Girl is the architect.",
  "   Ask: 'where is the girl in this sentence?' If she's absent → rewrite.",
  "   Would someone screenshot this and send it to their group chat?",
  "   Is it a revelation (reframes everything) or a punchline (lands and dies)?",
  "   If punchline → rewrite. She reveals she was already there, running this.",
  "",
  "5. NUMBERS: are all numbers non-round? Replace any round number.",
  "",
  "6. TYPO: look at your msg2 and msg4. Does EXACTLY ONE of them contain a transposed or dropped letter?",
  "   ⚠️  STOP. If neither msg2 nor msg4 has a typo → DO NOT OUTPUT. Add the typo RIGHT NOW.",
  "   This is non-negotiable. A script with no typo is an INCOMPLETE script.",
  "   Good typos: 'protocls' (protocols), 'clearnece' (clearance), 'watdh' (watch),",
  "               'emegency' (emergency), 'srpeads' (spreads), 'beleive' (believe), 'shoud' (should).",
  "   The character does NOT correct it. It is never on reply, msg3, or msg5.",
  "",
  "7. CUE VARIETY: if you wrote multiple scripts, do they all use different msg3 cues?",
  "   If two scripts share the same cue → change one.",
  "",
  "===============================================================",
  "OUTPUT FORMAT:",
  "===============================================================",
  "reply: [text]",
  "msg1: [text]",
  "msg2: [text]",
  "msg3: [text]",
  "msg4: [text]",
  "msg5: [text]",
  "",
  "No explanations. No commentary. No numbering. No '---' between scripts.",
  "If generating multiple scripts: output them one after another.",
  "Each new script starts with 'reply:' on a new line."
].join("\n");

function buildBrainrotUserPrompt({
  variant,
  caption,
  numCandidates,
  avoidPremises,
  bannedPhrases,
  retryFeedback
}) {
  const lines = [];
  const count = Number.isFinite(numCandidates) ? numCandidates : 1;

  if (variant === "contextual") {
    lines.push("Generate a brainrot DM script.");
    lines.push(
      "The boy's opening line (reply) must be SPECIFICALLY tied to what is visible in this story image."
    );
    if (caption) {
      lines.push(`Story caption: "${caption}"`);
      lines.push(
        "Use the image AND caption together. The institutional chaos must emerge from something real in her post."
      );
    } else {
      lines.push(
        "Use the image alone — the caption is unavailable. Let the vision model read what is actually visible."
      );
    }
    lines.push(
      "Example: if she posted a mirror selfie → maybe he filed a formal noise complaint about her reflection."
    );
    lines.push(
      "Example: if she posted coffee → maybe he has been pre-ordering her drink since a specific odd date."
    );
    lines.push("Do not use a generic premise unrelated to the image.");
  } else {
    lines.push("Generate a brainrot DM script.");
    lines.push(
      "The boy's opening line (reply) must establish a completely original institutional-chaos premise."
    );
    lines.push(
      "Invent a fresh scenario using one of the institutional systems from Rule 9 (notary, HR, county filing, etc.)."
    );
    lines.push("Do not reference any story image.");
  }

  lines.push("");

  if (Array.isArray(avoidPremises) && avoidPremises.length > 0) {
    lines.push("Avoid premises too similar to these recent openers:");
    avoidPremises.slice(-8).forEach((p) => lines.push(`- ${p}`));
    lines.push("");
  }

  if (Array.isArray(bannedPhrases) && bannedPhrases.length > 0) {
    lines.push("Never use these banned phrases anywhere in the script:");
    bannedPhrases.forEach((p) => lines.push(`- ${p}`));
    lines.push("");
  }

  if (retryFeedback) {
    lines.push("=== RETRY FEEDBACK FROM PREVIOUS ATTEMPT ===");
    lines.push(retryFeedback);
    lines.push("=== END RETRY FEEDBACK ===");
    lines.push("");
  }

  // Inject batch-level cue exclusions (cues already used in earlier slots this run)
  const batchUsedCues = _brainrotBatch.usedMsg3Cues.slice();
  if (batchUsedCues.length > 0) {
    lines.push(
      `CRITICAL — these msg3 cues are ALREADY USED in this batch. DO NOT use them: ${batchUsedCues.map(c => `"${c}"`).join(", ")}`
    );
    lines.push("Pick a DIFFERENT cue from the 7 approved options.");
    lines.push("");
  }

  if (count > 1) {
    lines.push(`Generate ${count} different brainrot scripts. Output them one after another.`);
    lines.push("Each new script starts with 'reply:' on a new line.");
    lines.push("Each must use a DIFFERENT institutional premise.");
    lines.push("Each must use a DIFFERENT disruption cue on msg3.");
  } else {
    lines.push("Generate 1 brainrot script.");
  }

  // Inject random subset of real institutional nouns to anchor msg4/msg5 vocabulary
  const _shuffled = BRAINROT_CHAOS_NOUNS.slice().sort(() => Math.random() - 0.5);
  const _sampledNouns = _shuffled.slice(0, 8);
  lines.push("REAL VOCABULARY — pick exactly ONE noun from this list as the anchor for msg4:");
  lines.push(_sampledNouns.map((n) => `"${n}"`).join(", "));
  lines.push("These are REAL items every TikTok viewer has personally encountered.");
  lines.push("Use ONE noun. Do NOT combine multiple items. Do NOT invent compound nouns outside this list.");
  lines.push("");

  lines.push("");
  lines.push("=== MANDATORY FINAL CHECK BEFORE OUTPUTTING ===");
  lines.push("For EACH script: look at msg2. Does it contain exactly one intentional typo?");
  lines.push("A typo = one transposed or dropped letter. The word must still be recognizable.");
  lines.push("  'clearance' → 'clearnece'  |  'should' → 'shoud'  |  'watch' → 'watdh'");
  lines.push("  'protocols' → 'protocls'   |  'emergency' → 'emegency'");
  lines.push("If msg2 has NO typo → insert one NOW before outputting.");
  lines.push("This check is REQUIRED. Do not skip it.");

  return lines.join("\n");
}

function parseBrainrotScripts(text) {
  const labels = ["reply", "msg1", "msg2", "msg3", "msg4", "msg5"];
  const raw = (text || "").replace(/\r/g, "").trim();
  if (!raw) throw new Error("parseBrainrotScripts: empty input");

  // Primary split: newline followed by "reply:" — guaranteed inter-script boundary.
  // "---" separators are silently ignored; reply: re-splits correctly regardless.
  const scriptChunks = raw
    .split(/\n(?=reply:)/i)
    .map((s) => s.trim())
    .filter(Boolean);

  function parseOneScript(chunk) {
    const result = {};
    for (const label of labels) {
      const pattern = new RegExp(
        `^${label}:\\s*(.+?)(?=\\n(?:${labels.join("|")}):|$)`,
        "ims"
      );
      const match = chunk.match(pattern);
      if (!match) throw new Error(`parseBrainrotScripts: missing label "${label}"`);
      result[label] = match[1].replace(/\r/g, "").trim();
    }
    return result;
  }

  const parsed = [];
  for (const chunk of scriptChunks) {
    try {
      parsed.push(parseOneScript(chunk));
    } catch (_e) {
      // One bad candidate does not discard the rest
    }
  }

  if (parsed.length === 0) {
    throw new Error("parseBrainrotScripts: no valid scripts found in LLM response");
  }
  return parsed;
}

async function generateBrainrotScript({
  provider,
  apiKey,
  model,
  temperature,
  maxOutputTokens,
  variant,
  imagePath,
  caption,
  avoidPremises,
  numCandidates,
  bannedPhrases,
  maxRetries,
  retryTemperatureBump
}) {
  // brainrot: intentional typo already embedded by LLM per Rule 16 — do not addImperfection()

  const fsSync = require("fs");

  // --- Caption fallback rule ---
  let effectiveVariant = variant || "random";
  let effectiveCaption = caption || null;

  if (effectiveVariant === "contextual") {
    const imageIsAvailable = imagePath && fsSync.existsSync(imagePath);
    if (!imageIsAvailable) {
      console.warn("[brainrot] contextual requested but no imagePath — falling back to random");
      effectiveVariant = "random";
    } else {
      const captionIsUsable =
        effectiveCaption && effectiveCaption.trim().split(/\s+/).length >= 5;
      if (!captionIsUsable) {
        effectiveCaption = null; // pass image only, no caption injection
      }
    }
  }

  const imageData =
    effectiveVariant === "contextual" && imagePath && fsSync.existsSync(imagePath)
      ? (() => {
          const buf = fsSync.readFileSync(imagePath);
          const mime = getMimeType(imagePath);
          return `data:${mime};base64,${buf.toString("base64")}`;
        })()
      : null;

  const count = Number.isFinite(numCandidates) && numCandidates > 0 ? numCandidates : 5;
  const maxR = Number.isFinite(maxRetries) ? maxRetries : 3;
  const tempBump = Number.isFinite(retryTemperatureBump) ? retryTemperatureBump : 0.05;
  const extraBanned = Array.isArray(bannedPhrases) ? bannedPhrases : [];

  let currentTemp = typeof temperature === "number" ? temperature : 1.2;
  let retryFeedback = null;
  let bestSoFar = null;

  for (let attempt = 1; attempt <= maxR; attempt++) {
    const userPrompt = buildBrainrotUserPrompt({
      variant: effectiveVariant,
      caption: effectiveCaption,
      numCandidates: count,
      avoidPremises: avoidPremises || [],
      bannedPhrases: extraBanned,
      retryFeedback
    });

    const payload = {
      model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: BRAINROT_SYSTEM_PROMPT }]
        },
        {
          role: "user",
          content: imageData
            ? [
                { type: "input_text", text: userPrompt },
                { type: "input_image", image_url: imageData }
              ]
            : [{ type: "input_text", text: userPrompt }]
        }
      ],
      temperature: Math.min(currentTemp, 1.4),
      max_output_tokens: maxOutputTokens || 2000
    };

    const { text } = await callLlm({ provider, apiKey, payload, endpoint: "brainrot" });

    let candidates = [];
    try {
      candidates = parseBrainrotScripts(text);
    } catch (_e) {
      currentTemp = Math.min(currentTemp + tempBump, 1.4);
      retryFeedback =
        "Your previous response could not be parsed. Use EXACTLY the format:\nreply: ...\nmsg1: ...\nmsg2: ...\nmsg3: ...\nmsg4: ...\nmsg5: ...";
      continue;
    }

    const scoredCandidates = candidates.map((result) => ({
      result,
      scoreResult: scoreBrainrotScript(result, { bannedPhrases: extraBanned })
    }));

    const currentBest = selectBestCandidate(scoredCandidates);
    if (
      !bestSoFar ||
      currentBest.scoreResult.score > bestSoFar.scoreResult.score ||
      (currentBest.scoreResult.pass && !bestSoFar.scoreResult.pass)
    ) {
      bestSoFar = currentBest;
    }

    const passingCandidates = scoredCandidates.filter((c) => c.scoreResult.pass);
    if (passingCandidates.length > 0) {
      const winner = selectBestCandidate(passingCandidates);
      winner.result.msg2 = ensureBrainrotTypo(winner.result.msg2);
      _recordBrainrotCue(winner.result.msg3);
      return {
        ...winner.result,
        _scoreResult: winner.scoreResult,
        _attempt: attempt,
        _variant: effectiveVariant
      };
    }

    const allFailures = [
      ...new Set(scoredCandidates.flatMap((c) => c.scoreResult.failures))
    ];
    retryFeedback = buildRetryFeedback(allFailures);
    currentTemp = Math.min(currentTemp + tempBump, 1.4);

    if (attempt < maxR) {
      console.warn(
        `[brainrot] attempt ${attempt}/${maxR} — no passing candidate. Failures:`,
        allFailures
      );
    }
  }

  if (!bestSoFar) {
    throw new Error("[brainrot] all retries exhausted and no parseable candidate was produced");
  }
  console.warn("[brainrot] all retries exhausted — returning best imperfect candidate");
  bestSoFar.result.msg2 = ensureBrainrotTypo(bestSoFar.result.msg2);
  _recordBrainrotCue(bestSoFar.result.msg3);
  return {
    ...bestSoFar.result,
    _scoreResult: bestSoFar.scoreResult,
    _attempt: maxR,
    _variant: effectiveVariant,
    _exhausted: true
  };
}

// ---------------------------------------------------------------------------
// END BRAINROT ARC
// ---------------------------------------------------------------------------

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function buildControversyTierGuidance(controversyTier) {
  if (controversyTier === "edge") {
    return [
      "Controversy tier: edge",
      "Use a high-arousal, polarizing opener.",
      "Push taboo-adjacent tension, but keep it safe and non-explicit.",
      "The line should feel risky, surprising, and scroll-stopping."
    ];
  }
  if (controversyTier === "spicy") {
    return [
      "Controversy tier: spicy",
      "Use a sharp, provocative opener with clear tension.",
      "Be polarizing enough to trigger a reaction, but do not go explicit."
    ];
  }
  return [
    "Controversy tier: safe",
    "Use playful curiosity and confidence without explicit or taboo-heavy language.",
    "Keep it punchy and attention-grabbing, but cleaner than spicy/edge."
  ];
}

function buildUserPrompt({
  categoryLabel,
  bannedPhrases,
  avoidReplies,
  numOptions,
  variationTag,
  variationId,
  controversyTier
}) {
  const lines = [];
  const count = Number.isFinite(numOptions) ? numOptions : 1;

  lines.push("Here is a girl's Instagram story.");
  lines.push("Write a reply to this story.");
  lines.push("");

  if (categoryLabel) lines.push(`Story type: ${categoryLabel}`);
  if (variationTag) lines.push(`Style variation: ${variationTag}`);
  if (variationId) lines.push(`Request ID: ${variationId}`);
  buildControversyTierGuidance(controversyTier).forEach((line) => lines.push(line));

  if (Array.isArray(bannedPhrases) && bannedPhrases.length) {
    lines.push("");
    lines.push("Never use these banned phrases:");
    bannedPhrases.forEach((phrase) => {
      lines.push(`- ${phrase}`);
    });
  }

  if (Array.isArray(avoidReplies) && avoidReplies.length) {
    lines.push("");
    lines.push("Avoid repeating or being too similar to these recent replies:");
    avoidReplies.forEach((reply) => {
      lines.push(`- ${reply}`);
    });
  }

  lines.push("");
  if (count === 1) {
    lines.push("Return ONE reply only.");
    lines.push("Just output the text directly, no numbering, no explanation.");
  } else {
    lines.push(`Return ${count} different reply options.`);
    lines.push("One per line, no numbering, no explanations.");
    lines.push("Make each option distinct with a different approach or angle.");
  }

  return lines.join("\n");
}

function buildBanterPrompt({
  storyCaption,
  boyReplyText,
  spiceTier,
  controversyTier,
  bannedPhrases,
  numMessages,
  girlName,
  boyName,
  girlArchetype,
  format,
  arcType,
  viralExamples,
  avoidBoyLines,
  avoidGirlLines,
  imageDetails,
  imageHook,
  pivotExamples,
  viralConversations,
  punchlineStyle,
  brainrotStyle
}) {
  const lines = [];
  const count = Number.isFinite(numMessages) ? numMessages : 4;

  lines.push("Write the DM thread after he replied to her story.");
  lines.push("Use the same language as the boy's reply.");
  lines.push("");

  // BRAINROT: track whether this call uses a brainrot punchline style
  const _brainrotPunchlineTypes = ["numeric_reveal", "list_reveal", "setup_reframe", "persistence_flip", "presumptive_close", "roast_flip"];
  const _isBrainrotPunchline = brainrotStyle && punchlineStyle && _brainrotPunchlineTypes.includes(punchlineStyle);

  if (viralExamples && Array.isArray(viralExamples) && viralExamples.length > 0) {
    lines.push("Here are examples from viral videos with millions of views. Match this energy:");
    const examples = viralExamples.slice(0, 5);
    examples.forEach((example) => {
      if (typeof example === "string") {
        lines.push(`- ${example}`);
      } else if (example && typeof example === "object") {
        const setup = example.setup || example.prompt || "";
        const response = example.response || example.answer || "";
        if (setup && response) {
          lines.push(`- "${setup}" → "${response}"`);
        }
      }
    });
    lines.push("Your conversation should have the same rhythm and tension.");
    lines.push("");
  }

  if (format !== "D" && storyCaption) lines.push(`Story caption: ${storyCaption}`);
  if (imageDetails) {
    lines.push(`Visual details: ${imageDetails}`);
    if (imageHook) lines.push(`Textable detail: ${imageHook}`);
    lines.push("VISUAL FIRST: The boy's specific joke must be grounded in what's actually visible — the visual details and textable detail above. The caption is what she wrote, but the joke should reference what viewers can see. If the caption conflicts with the visual, ignore the caption in the joke and reference the visual instead.");
    lines.push("Pick up on specific props from the visual: the drink, the accessory, the food, the setting. Make it feel like he noticed something real. Example: 'you posted the green matcha and headphones at a café like you weren't trying to ruin someone's afternoon' not 'you posted that like bait'.");
  }
  if (boyReplyText) lines.push(`Boy reply: ${boyReplyText}`);

  // BRAINROT: inject fill-in-the-blank script outline immediately after story context
  if (_isBrainrotPunchline) {
    const av = loadAnchorVariants();
    lines.push("");
    lines.push(`⚠️ SCRIPT OUTLINE — write the script in EXACTLY this order (fill in the [BLANKS]):`);
    if (punchlineStyle === "numeric_reveal") {
      const mathLine = pickVariant(av.numeric_reveal && av.numeric_reveal.math_punchlines) || "so you already like [NUMBER]% of me";
      lines.push(`  girl: [first reaction to his story reply — 1-5 words, dismissive/confused]`);
      lines.push(`  boy: [story-grounded punchline — his first line, tied to what she posted]`);
      lines.push(`  girl: [reaction — 1-5 words]`);
      lines.push(`  [0-2 more exchanges of banter if thread is long]`);
      lines.push(`  boy: [INNOCENT QUESTION — new topic: "do you like water?" / "do you like [X]?" / "cats or dogs?"]`);
      lines.push(`  girl: yeah why 💀  ← write this EXACT line (or: what 💀 / yes?? 💀)`);
      lines.push(`  boy: ${mathLine}  ← write this EXACT structure. Nothing else.`);
      lines.push(`  girl: LMAO NO😭  ← write this EXACT line (or: LMAO what😭 / omg stop😭)`);
      lines.push(`  [close sequence: boy asks for number → girl: pre-close with emoji → girl: number + tease]`);
      lines.push(`  RULE: After girl says "yeah why" or "what", the VERY NEXT boy line must be the math punchline. Never pivot.`);
    } else if (punchlineStyle === "list_reveal") {
      const listOpener = pickVariant(av.list_reveal && av.list_reveal.list_openers) || "i got 3 things for you — 1. [innocent], 2. [innocent], 3. ur number";
      lines.push(`  girl: [first reaction to his story reply — 1-5 words, dismissive/confused]`);
      lines.push(`  boy: ${listOpener}  ← FIRST boy line (≤70 chars total)`);
      lines.push(`  girl: [shocked/amused with emoji — "that was good😭" / "lmao what😭" / "ok that was smooth😭"]`);
      lines.push(`  [banter continues — 2-8 more exchanges]`);
      lines.push(`  [close sequence: boy asks for number → girl: pre-close with emoji → girl: number + tease]`);
      lines.push(`  RULE: The list_reveal is the BOY'S VERY FIRST BANTER LINE — right after her opening reaction. Never delayed.`);
      lines.push(`  RULE: Keep it short (under 70 chars)`);
    } else if (punchlineStyle === "setup_reframe") {
      const srPair = pickVariant(av.setup_reframe && av.setup_reframe.pairs);
      const setupLine = (srPair && srPair.setup) || "i want to ruin your whole week";
      const reframeLine = (srPair && srPair.reframe) || "by being the person you cant stop thinking about";
      lines.push(`  girl: [first reaction — 1-5 words]`);
      lines.push(`  boy: ${setupLine}  ← write this EXACT line`);
      lines.push(`  girl: excuse me?? ← write this EXACT line`);
      lines.push(`  boy: ${reframeLine}  ← write this EXACT reframe`);
      lines.push(`  girl: [impressed with emoji — "ok that was smooth omg" / "omg😭 i hate that"]`);
      lines.push(`  [close sequence]`);
    } else if (punchlineStyle === "persistence_flip") {
      const pfLine = pickVariant(av.persistence_flip && av.persistence_flip.first_reframes) || "your replies say otherwise";
      lines.push(`  girl: [dismissal — "i don't even know you" / "not interested"]`);
      lines.push(`  boy: ${pfLine}  ← write this EXACT line`);
      lines.push(`  girl: [another pushback]`);
      lines.push(`  boy: [another reframe of her resistance — "if you weren't curious you'd have left already"]`);
      lines.push(`  [this reframe pattern repeats AT LEAST 2 times]`);
      lines.push(`  [close sequence]`);
    } else if (punchlineStyle === "presumptive_close") {
      const pcPair = pickVariant(av.presumptive_close && av.presumptive_close.pairs);
      const assumptionLine = (pcPair && pcPair.assumption) || "i already told my mom about us";
      const followthroughLine = (pcPair && pcPair.followthrough) || "she said monday at 7 works";
      lines.push(`  girl: [first reaction — 1-5 words]`);
      lines.push(`  boy: ${assumptionLine}  ← write this EXACT line`);
      lines.push(`  girl: [confused/amused with emoji — "what?? 😭" / "ur not serious 💀"]`);
      lines.push(`  boy: ${followthroughLine}  ← write this EXACT follow-through`);
      lines.push(`  girl: [loud capitulation — "LMAO fine" / "omg stop😭" / "ur actually insane 😭"]`);
      lines.push(`  [close sequence]`);
    } else if (punchlineStyle === "roast_flip") {
      const rfPair = pickVariant(av.roast_flip && av.roast_flip.pairs);
      const roastLine = (rfPair && rfPair.roast) || "you're mid";
      const roastReframe = (rfPair && rfPair.reframe) || "mid as in exactly where i want to be";
      lines.push(`  girl: [first reaction — 1-5 words]`);
      lines.push(`  boy: ${roastLine}  ← write this EXACT line`);
      lines.push(`  girl: excuse me?? 💀  ← write this EXACT line`);
      lines.push(`  boy: ${roastReframe}  ← write this EXACT reframe`);
      lines.push(`  girl: [laughs/impressed — "omg😭 i hate that" / "LMAO stop"]`);
      lines.push(`  [close sequence]`);
    }
    lines.push(`Fill in all [BLANKS]. Keep the lines marked "write this EXACT line" word-for-word (you may adapt numbers/names).`);
    lines.push(`This outline IS the script — follow it top to bottom without skipping any section.`);
    lines.push("");
  }

  lines.push("Keep the boy's later replies in the same vibe and word choice as his reply.");
  if (_isBrainrotPunchline && punchlineStyle === "list_reveal") {
    lines.push("OVERRIDE for list_reveal: The boy's FIRST message must be the list_reveal line from the SCRIPT OUTLINE above. NOT a story reference, NOT a continuation of his opener. Start with 'I got [N] things im trynna put into you'.");
  } else {
    lines.push("CRITICAL: The boy's FIRST message in this thread must NOT repeat, paraphrase, or echo the boy reply text above. It must be a completely new sentence.");
  }
  lines.push("When referencing the story caption, weave it into a full sentence naturally. NEVER end a message with a lone caption word tacked on. Bad: 'you typed that smiling weekend'. Good: 'you posted that weekend escape like it wasnt bait'.");
  if (format === "D") {
    lines.push("Use the story image as context for what is happening.");
    lines.push("Only reference details clearly visible in the image.");
    lines.push("Do not describe precise body poses or anatomy.");
  } else {
    lines.push("Use story context naturally when available.");
    lines.push("If referencing the story, anchor to VISUAL details first. Only weave in the caption if it naturally matches what's visible.");
  }
  lines.push("Girl must never say the boy's name.");
  if (girlArchetype) lines.push(`Girl archetype: ${girlArchetype}`);
  lines.push("Archetype behavior guide (FOLLOW THE SPECIFIED ARCHETYPE EXACTLY):");
  lines.push("- confused: She genuinely doesn't understand his opener. '??' 'what' 'huh'. Slowly catches on. Classic arc.");
  lines.push("- hostile: MEAN from message 1. 'tf is this' 'bro leave me alone' 'you're weird'. Boy must work EXTRA hard. She might still not crack.");
  lines.push("- warm: She's into it from the start. 'omg that's cute' 'you're funny'. Tension comes from locking the date, not from her resistance.");
  lines.push("- matching_energy: She's just as witty. She one-ups his jokes. They trade barbs like equals. She matches his absurdity.");
  lines.push("- playing_hard_to_get: Interested but pretends not to be. 'maybe' 'depends' 'we'll see'. Mixed signals throughout. Keeps him guessing.");
  lines.push("- teasing: playful mockery, flirty dismissals. Classic sarcastic baddie energy.");
  lines.push("- direct: blunt and concise challenges. No fluff. 'prove it' 'and?' 'so?'.");
  lines.push("- sarcastic: dry roasts with eye-roll energy. 'oh wow how original' 'groundbreaking' '💀'.");
  lines.push("CRITICAL: The girl's personality must be CONSISTENT throughout the conversation. A hostile girl doesn't suddenly become warm. A warm girl doesn't suddenly become mean.");
  if (format === "D") {
    lines.push(
      "CRITICAL: The girl's FIRST message must be a real reaction of 1-5 words, not a polished roast."
    );
    lines.push("Her first message MUST be opener-specific: confusion, shock, skepticism, or curiosity tied to what he said.");
    lines.push("Allowed first-message examples: 'what??', 'excuse me??', 'how tho?', 'you serious?', 'wait what'.");
    lines.push("Do NOT start with generic detached lines like 'no', 'pass', 'nice try', 'prove it', or 'who even'.");
    lines.push("After the first reaction, she can escalate into sharper roasts/challenges.");
    lines.push("Girl lines after turn 1 should usually be 3 to 10 words.");
    lines.push("Roasts should be funny and a bit controversial, but still safe (no slurs, no threats).");
    lines.push("She builds up over the conversation: starts dismissive, then teasing, then grudgingly impressed, then accepts.");
    lines.push("She makes him work hard for at least 10+ messages before showing any interest.");
    lines.push("Include more back-and-forth pushback. The girl should push back multiple times, not just once.");
    lines.push("Each girl line should feel like a challenge or test, not a dead-end shutdown.");
    lines.push("Avoid repetitive dead-end replies across multiple turns.");
  } else {
    lines.push("Girl lines should be 2 to 7 words, often fragments.");
    lines.push("The first girl line must be a 1-5 word real reaction to his opener.");
    lines.push("First line should feel caught off guard: confusion, shock, curiosity, or skeptical challenge.");
    lines.push("Avoid generic detached reactions like 'no', 'nice try', 'pass', 'prove it', 'who even'.");
    lines.push("Right after her pushback, the boy should drop a controversial punchline.");
    lines.push("Make it polarizing and high-contrast but still safe and non explicit.");
    lines.push("IMPORTANT: The boy's punchline must NOT be a variation of 'so you chose me' or 'so its me then'. That pattern is banned.");

    const brainrotPunchlineTypes = ["numeric_reveal", "list_reveal", "setup_reframe", "persistence_flip", "presumptive_close", "roast_flip"];
    const isBrainrotPunchline = brainrotStyle && punchlineStyle && brainrotPunchlineTypes.includes(punchlineStyle);

    if (isBrainrotPunchline) {
      // Brainrot mode: outline already shown above — reinforce the key constraint
      lines.push(`⚠️ REMINDER: Follow the SCRIPT OUTLINE above word-for-word. The lines marked "write this EXACT line" must appear verbatim. The outline IS the script — do not skip any section.`);
    } else {
      // Standard mode: show all original punchline styles
      if (punchlineStyle) {
        lines.push(
          `Boy punchline style for THIS script: ${punchlineStyle.toUpperCase()}. Use ONLY this style for the boy's punchline. Do not use any other style.`
        );
      } else {
        lines.push("Boy punchline styles (pick ONE, rotate across scripts):");
      }
      lines.push("- Challenge: dare her ('prove it', 'say that to my face')");
      lines.push("- Tease: roast her reaction ('you typed that with a smile')");
      lines.push("- Callback: twist her words back ('you said it not me')");
      lines.push("- Deflection: shrug it off ('i dont need permission')");
      lines.push("- Cocky claim: double down ('i already know the answer')");
      lines.push("- Random pivot: drop a totally unexpected, unrelated question mid-thread as a pattern interrupt. She has to respond confused. Then he lands the punchline. This drives comments and views. Examples:");
      if (Array.isArray(pivotExamples) && pivotExamples.length > 0) {
        pivotExamples.forEach((p) => {
          if (p && p.setup && p.punchline) {
            lines.push(`  * boy: '${p.setup}' → girl: '[confused reply]' → boy: '${p.punchline}'`);
          }
        });
      } else {
        lines.push("  * boy: 'do you like water?' → girl: 'yes??' → boy: 'because you're like 70% my type'");
        lines.push("  * boy: 'quick question. favorite color?' → girl: 'why' → boy: 'just checking if we're compatible before i ruin your week'");
        lines.push("  * boy: 'do you know how long a minute is?' → girl: 'what' → boy: 'because you've been on my mind for the last 60'");
      }
      lines.push("  Use this ONCE per script max. Place it mid-thread after at least 2 exchanges, not at the very start.");
    }
    lines.push("Resistance-beat requirement: before the shift/reveal, include at least 2 consecutive dismissive girl messages.");
    lines.push("For longer threads, vary dismissive wording; avoid repeating one catchphrase.");
  }
  if ((format === "D" || count >= 9) && arcType !== "comedy") {
    lines.push("Resistance-beat requirement: before the shift/reveal, include at least 3 consecutive dismissive girl messages.");
  }
  // Real viral conversation examples for few-shot style learning
  if (Array.isArray(viralConversations) && viralConversations.length > 0) {
    lines.push('\nREAL VIRAL CONVERSATION EXAMPLES — study the rhythm and tone:');
    for (const ex of viralConversations) {
      const convo = ex.conversation.slice(0, 8);
      for (const msg of convo) {
        lines.push(`  [${msg.from}]: ${msg.text}`);
      }
      lines.push('  ---');
    }
  }

  lines.push("Authenticity rules:");
  lines.push("- Keep capitalization low. Not every line should start uppercase.");
  lines.push("- Avoid ending most lines with a period.");
  lines.push("- Use short DM texture (fragments, occasional 'u/ur', 'idk').");
  lines.push("- Do not overuse the same dismissal opener across scripts (especially 'nah').");
  lines.push("Girl does not ask for his number; she offers hers or green lights a date.");
  lines.push("Girl does not say she will handle the rest or do the planning.");
  lines.push("Do not ask for his number or say phrases like drop your number.");
  if (brainrotStyle) {
    lines.push("EMOJI RULE: Girl MUST use at least 3 emojis in the script. Use 😭, 🥺, or 💀. Place them when a boy line lands, when she's shocked, or when she capitulates. MINIMUM 3 — do not write a complete script with fewer than 3 girl emojis.");
    lines.push("GEN Z LANGUAGE: Girl can use: 'tf', 'rn', 'omg', 'ur', 'lmao'. All-caps single reactions allowed: 'LMAO', 'NO', 'STOP'.");
    lines.push("GIRL ACCEPTANCE ENERGY: The girl's final pre-close reaction must feel loud and reactive. Good: 'omg stop😭' / 'ok fine😭' / 'LMAO fine'. BAD: just 'ok fine' with no energy.");
  } else {
    lines.push("Emojis are allowed sparingly for reactions like ??? or 😭😭.");
  }
  if (spiceTier) lines.push(`Spice tier: ${spiceTier}`);
  buildControversyTierGuidance(controversyTier).forEach((line) => lines.push(line));
  if (girlName) lines.push(`Girl name: ${girlName}`);
  if (boyName) lines.push(`Boy name: ${boyName}`);

  if (arcType) {
    lines.push("");
    lines.push(`Arc type: ${arcType}`);
    if (arcType === "number_exchange") {
      if (brainrotStyle) {
        lines.push("REQUIRED 3-MESSAGE CLOSE SEQUENCE:");
        lines.push("  boy: [asks for number or proposes a plan]");
        lines.push("  girl: 'omg fine😭' OR 'LMAO ok ok😭' OR 'ugh fine 🥺' ← PRE-CLOSE. MUST have emoji. Do not write 'hmm convince me' or 'ok fine' with no emoji.");
        lines.push("  girl: '[number] [short tease]' ← e.g. '555 xxx xxxx dont blow it' OR '555 xxx xxxx im already regretting this 😭'");
      } else {
        lines.push("End with the girl giving her number and a flirty tease.");
      }
    } else if (arcType === "rejection") {
      lines.push("End with the girl declining gracefully. She says something like 'nice try' or 'not gonna happen'. The boy takes it with humor.");
      lines.push("Hard rule: no phone number pattern in the final 3 messages.");
    } else if (arcType === "plot_twist") {
      lines.push("End with an unexpected twist that changes the dynamic — she reveals she's his ex, or she was testing him, or she admits she DM'd him first on accident.");
    } else if (arcType === "cliffhanger") {
      lines.push("End the conversation mid-tension. Cut off before resolution. Last message should leave the viewer wanting to know what happens next.");
      lines.push("Hard rule: no clean resolution phrase like 'see you', 'locked in', 'youre on', 'deal'.");
    } else if (arcType === "comedy") {
      lines.push("This is a comedy arc. Every single message must be funny — absurdist, witty, self-aware, or a callback.");
      lines.push("IMPORTANT: There is NO resistance beat or dismissal phase in comedy. The girl does NOT start cold. She is funny and reactive FROM MESSAGE 1.");
      lines.push("COMEDY FIRST MESSAGE RULE: She picks up a specific word or concept from his opener and escalates it. She builds on the joke — she does NOT just react with a short skeptical word.");
      lines.push("BANNED line (never use anywhere): 'wait i actually screenshotted this already'.");
      lines.push("Comedy opener examples — notice how girl builds on his exact words, not just reacts:");
      lines.push("  boy: 'i already told my mom about us' → girl: 'she should've warned me before i replied tbh'");
      lines.push("  boy: 'you look like trouble and i'm off probation' → girl: 'probation for what, caring too much about wifi passwords'");
      lines.push("  boy: 'this post is a violation i need to report it' → girl: 'file the report, i'll be your first witness'");
      lines.push("  boy: 'our kids would be unreal' → girl: 'they'd be chaotic and somehow both our fault'");
      lines.push("The boy leads with humor, not romance. No date plans, no asking for her number.");
      lines.push("The girl matches his energy — she plays along, escalates the joke, or fires back even funnier.");
      lines.push("End with the girl delivering a pure comedy closer: a punchline, a callback, or an absurd reaction.");
      lines.push("Hard rule: no phone number in any message. This is not a date setup.");
    }
    // Brainrot: remind LLM of punchline structure after arc instruction
    if (_isBrainrotPunchline && arcType !== "comedy") {
      lines.push("");
      lines.push(`⚠️ FINAL REMINDER: Follow the SCRIPT OUTLINE (shown near the top) exactly. The arc ending (number drop etc.) comes AFTER the required exchange.`);
    }
  }

  if (Array.isArray(bannedPhrases) && bannedPhrases.length) {
    lines.push("");
    lines.push("Never use these banned phrases:");
    bannedPhrases.forEach((phrase) => {
      lines.push(`- ${phrase}`);
    });
  }

  if (Array.isArray(avoidBoyLines) && avoidBoyLines.length > 0) {
    lines.push("");
    lines.push("These boy lines were used in recent scripts — do NOT repeat or closely paraphrase them:");
    avoidBoyLines.slice(-25).forEach((line) => lines.push(`- ${line}`));
  }

  if (Array.isArray(avoidGirlLines) && avoidGirlLines.length > 0) {
    lines.push("");
    lines.push("These girl lines were used in recent scripts — do NOT repeat them:");
    avoidGirlLines.slice(-20).forEach((line) => lines.push(`- ${line}`));
  }

  lines.push("");
  if (_isBrainrotPunchline) {
    lines.push(`⚠️ BEFORE WRITING: Re-read the SCRIPT OUTLINE above. Your output must match it section by section.`);
  }
  lines.push(`Write exactly ${count} messages total.`);
  lines.push("Start with the girl. Alternate girl/boy each line.");
  if (arcType === "rejection") {
    lines.push("The boy makes his best close attempt near the end.");
    lines.push("The girl's FINAL message is a clear, casual rejection. She declines and ends it.");
    lines.push("Her final line must NOT be 'fine', 'ok', 'alright', or any form of agreement.");
    lines.push("Good final girl lines: 'nah i'm good', 'not for me', 'no shot', 'hard pass', 'yeah no', 'nope', 'not interested', 'uh no', 'lol no', 'i'll pass'.");
    lines.push("No phone number anywhere in the conversation.");
  } else if (arcType === "cliffhanger") {
    lines.push("The boy makes his close attempt near the end.");
    lines.push("The girl's FINAL message leaves things unresolved — she does NOT agree, resolve, or say 'fine'.");
    lines.push("Her final line teases, deflects, or cuts off mid-answer. Leave the viewer hanging.");
    lines.push("Good final girl lines: 'we'll see', 'you'll find out', 'not yet', 'maybe. maybe not'.");
    lines.push("No phone number anywhere in the conversation.");
  } else if (arcType !== "comedy") {
    lines.push("The boy leads the close. His last line proposes a plan or asks for her number.");
    lines.push("The boy names the day, time, or activity. He drives the date, not the girl.");
    lines.push("The girl NEVER says 'text me' with a day and time. She does NOT plan the date.");
    lines.push("End with the girl reacting: a short flirty tease or condition, like a cliffhanger hard cut.");
    lines.push("Good girl endings: 'don't be late', 'you better be fun', 'don't blow it', 'impress me'.");
  } else {
    lines.push("End with both sides having traded jokes. The girl gets the last laugh.");
    lines.push("Good comedy girl endings: 'ok that was actually funny', 'i hate that i laughed', 'you're actually unhinged', 'ok you win this round'.");
    lines.push("Hard rule: no phone number anywhere. This is a comedy exchange, not a date setup.");
  }
  lines.push("Keep each message under 70 characters.");
  lines.push("Each line must start with exactly \"girl:\" or \"boy:\".");
  lines.push("Output ONLY the lines, no numbering, no extra text.");

  return lines.join("\n");
}

function buildPushbackPrompt({
  boyReplyText,
  storyCaption,
  spiceTier,
  controversyTier,
  bannedPhrases,
  avoidPushbacks,
  numOptions,
  format
}) {
  const lines = [];
  const count = Number.isFinite(numOptions) ? numOptions : 1;

  lines.push("Write the girl's first pushback line.");
  lines.push("She is reacting to the boy's reply.");
  if (boyReplyText) lines.push(`Boy reply: ${boyReplyText}`);
  if (storyCaption) lines.push(`Story caption: ${storyCaption}`);
  if (format === "D") {
    lines.push("For format D: make it a sarcastic roast tied to his reply.");
    lines.push("Use 3 to 10 words, not punctuation only.");
  }
  if (spiceTier) lines.push(`Spice tier: ${spiceTier}`);
  buildControversyTierGuidance(controversyTier).forEach((line) => lines.push(line));

  if (Array.isArray(bannedPhrases) && bannedPhrases.length) {
    lines.push("");
    lines.push("Never use these banned phrases:");
    bannedPhrases.forEach((phrase) => {
      lines.push(`- ${phrase}`);
    });
  }

  if (Array.isArray(avoidPushbacks) && avoidPushbacks.length) {
    lines.push("");
    lines.push("Avoid repeating or being too similar to these recent pushbacks:");
    avoidPushbacks.slice(-12).forEach((line) => {
      lines.push(`- ${line}`);
    });
  }

  lines.push("");
  if (count === 1) {
    lines.push("Return ONE line only.");
    lines.push("Just output the text directly, no numbering, no explanation.");
  } else {
    lines.push(`Return ${count} different options.`);
    lines.push("One per line, no numbering, no explanations.");
    lines.push("Make each option distinct.");
  }

  return lines.join("\n");
}

function buildRevealPrompt({
  boyReplyText,
  girlPushbackText,
  storyCaption,
  spiceTier,
  controversyTier,
  bannedPhrases,
  avoidLines,
  numOptions
}) {
  const lines = [];
  const count = Number.isFinite(numOptions) ? numOptions : 1;

  lines.push("Write the boy's punchline right after her pushback.");
  if (boyReplyText) lines.push(`Boy reply: ${boyReplyText}`);
  if (girlPushbackText) lines.push(`Girl pushback: ${girlPushbackText}`);
  if (storyCaption) lines.push(`Story caption: ${storyCaption}`);
  if (spiceTier) lines.push(`Spice tier: ${spiceTier}`);
  buildControversyTierGuidance(controversyTier).forEach((line) => lines.push(line));

  if (Array.isArray(bannedPhrases) && bannedPhrases.length) {
    lines.push("");
    lines.push("Never use these banned phrases:");
    bannedPhrases.forEach((phrase) => {
      lines.push(`- ${phrase}`);
    });
  }

  if (Array.isArray(avoidLines) && avoidLines.length) {
    lines.push("");
    lines.push("Avoid repeating or being too similar to these recent lines:");
    avoidLines.slice(-12).forEach((line) => {
      lines.push(`- ${line}`);
    });
  }

  lines.push("");
  if (count === 1) {
    lines.push("Return ONE line only.");
    lines.push("Just output the text directly, no numbering, no explanation.");
  } else {
    lines.push(`Return ${count} different options.`);
    lines.push("One per line, no numbering, no explanations.");
    lines.push("Make each option distinct.");
  }

  return lines.join("\n");
}

function extractOutputText(data) {
  if (data && typeof data.output_text === "string") return data.output_text;
  if (data && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!item || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if (part && part.type === "output_text" && typeof part.text === "string") {
          return part.text;
        }
      }
    }
  }
  if (data && Array.isArray(data.choices)) {
    const choice = data.choices[0];
    if (choice && choice.message && typeof choice.message.content === "string") {
      return choice.message.content;
    }
  }
  return "";
}

function extractAnthropicOutputText(data) {
  if (!data || !Array.isArray(data.content)) return "";
  for (const part of data.content) {
    if (part && part.type === "text" && typeof part.text === "string") {
      return part.text;
    }
  }
  return "";
}

function extractOpenAiUsage(data) {
  const usage = data && data.usage ? data.usage : {};
  const inputTokens = Number(usage.input_tokens || usage.prompt_tokens || 0);
  const outputTokens = Number(usage.output_tokens || usage.completion_tokens || 0);
  const totalTokens = Number(usage.total_tokens || inputTokens + outputTokens);
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens
  };
}

function extractAnthropicUsage(data) {
  const usage = data && data.usage ? data.usage : {};
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens
  };
}

async function callOpenAiResponses({ apiKey, payload, timeoutMs = 30000 }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let slotListener = null;
  if (_slotAbortController && !_slotAbortController.signal.aborted) {
    slotListener = () => controller.abort();
    _slotAbortController.signal.addEventListener("abort", slotListener);
  }
  let response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
    if (slotListener && _slotAbortController) {
      _slotAbortController.signal.removeEventListener("abort", slotListener);
    }
  }
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${errorText}`);
  }
  const data = await response.json();
  return { data, text: extractOutputText(data), usage: extractOpenAiUsage(data) };
}

function mapOpenAiMessageToAnthropic(message) {
  const contentParts = Array.isArray(message.content) ? message.content : [];
  if (message.role === "system") {
    const textParts = contentParts
      .filter((part) => part && part.type === "input_text" && typeof part.text === "string")
      .map((part) => part.text.trim())
      .filter(Boolean);
    return { role: "system", text: textParts.join("\n\n") };
  }
  const mapped = [];
  contentParts.forEach((part) => {
    if (!part) return;
    if (part.type === "input_text" && typeof part.text === "string") {
      mapped.push({ type: "text", text: part.text });
      return;
    }
    if (part.type === "input_image" && typeof part.image_url === "string") {
      const match = part.image_url.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return;
      mapped.push({
        type: "image",
        source: {
          type: "base64",
          media_type: match[1],
          data: match[2]
        }
      });
    }
  });
  return {
    role: message.role === "assistant" ? "assistant" : "user",
    content: mapped.length > 0 ? mapped : [{ type: "text", text: "" }]
  };
}

function mapOpenAiPayloadToAnthropic(payload) {
  const input = Array.isArray(payload.input) ? payload.input : [];
  const systemChunks = [];
  const messages = [];
  input.forEach((item) => {
    const mapped = mapOpenAiMessageToAnthropic(item || {});
    if (mapped.role === "system") {
      if (mapped.text) systemChunks.push(mapped.text);
      return;
    }
    messages.push(mapped);
  });
  const rawTemp =
    typeof payload.temperature === "number" ? payload.temperature : 1;
  const anthropicTemp = Math.max(0, Math.min(1, rawTemp));
  return {
    model: payload.model,
    max_tokens: payload.max_output_tokens || 512,
    temperature: anthropicTemp,
    system: systemChunks.join("\n\n"),
    messages
  };
}

async function callAnthropicMessages({ apiKey, payload, timeoutMs = 30000 }) {
  const anthropicPayload = mapOpenAiPayloadToAnthropic(payload);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let slotListener = null;
  if (_slotAbortController && !_slotAbortController.signal.aborted) {
    slotListener = () => controller.abort();
    _slotAbortController.signal.addEventListener("abort", slotListener);
  }
  let response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION
      },
      body: JSON.stringify(anthropicPayload),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
    if (slotListener && _slotAbortController) {
      _slotAbortController.signal.removeEventListener("abort", slotListener);
    }
  }
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic request failed (${response.status}): ${errorText}`);
  }
  const data = await response.json();
  return { data, text: extractAnthropicOutputText(data), usage: extractAnthropicUsage(data) };
}

async function callLlm({ provider, apiKey, payload, endpoint }) {
  const normalizedProvider = normalizeProvider(provider, payload && payload.model);
  if (normalizedProvider === "anthropic") {
    const result = await callAnthropicMessages({ apiKey, payload });
    recordLlmUsage({
      provider: normalizedProvider,
      model: payload.model,
      endpoint,
      usage: result.usage
    });
    return result;
  }
  const result = await callOpenAiResponses({ apiKey, payload });
  recordLlmUsage({
    provider: "openai",
    model: payload.model,
    endpoint,
    usage: result.usage
  });
  return result;
}

function sanitizeReply(text) {
  let cleaned = text.replace(/\r/g, "").trim();
  cleaned = cleaned.replace(/^\s*\d+[\).]\s*/, "");
  cleaned = cleaned.replace(/^[*-]\s+/, "");
  if (
    (cleaned.startsWith("\"") && cleaned.endsWith("\"")) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  cleaned = cleaned.replace(/\s*\n+\s*/g, " ").trim();
  return cleaned;
}

function splitOptions(text) {
  const raw = text.replace(/\r/g, "").trim();
  if (!raw) return [];
  if (/\d+\)/.test(raw)) {
    const parts = raw.split(/\s*\d+\)\s*/).filter(Boolean);
    return parts.map(sanitizeReply).filter(Boolean);
  }
  return raw
    .split(/\n+/)
    .map(sanitizeReply)
    .filter(Boolean);
}

function parseBanterMessages(text) {
  const raw = text.replace(/\r/g, "").trim();
  if (!raw) return [];
  const lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const messages = [];
  const unprefixed = [];
  lines.forEach((line) => {
    const match = line.match(/^(girl|boy)\s*[:\-]\s*(.+)$/i);
    if (!match) {
      unprefixed.push(line);
      return;
    }
    const from = match[1].toLowerCase();
    const content = sanitizeReply(match[2]);
    if (!content) return;
    messages.push({ from, text: content });
  });
  if (messages.length === 0 && unprefixed.length) {
    let expected = "girl";
    unprefixed.forEach((line) => {
      const content = sanitizeReply(line);
      if (!content) return;
      messages.push({ from: expected, text: content });
      expected = expected === "girl" ? "boy" : "girl";
    });
  }
  return messages;
}

async function generateStoryReplyOptions({
  provider,
  apiKey,
  model,
  temperature,
  maxOutputTokens,
  imagePath,
  categoryLabel,
  bannedPhrases,
  avoidReplies,
  numOptions,
  variationTag,
  variationId,
  controversyTier
}) {
  const count = Number.isFinite(numOptions) ? numOptions : 1;
  const imageBuffer = fs.readFileSync(imagePath);
  const mimeType = getMimeType(imagePath);
  const imageData = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  const userPrompt = buildUserPrompt({
    categoryLabel,
    bannedPhrases,
    avoidReplies,
    numOptions: count,
    variationTag,
    variationId,
    controversyTier
  });

  const payload = {
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: STORY_REPLY_SYSTEM_PROMPT }]
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: userPrompt },
          { type: "input_image", image_url: imageData }
        ]
      }
    ],
    temperature,
    max_output_tokens: maxOutputTokens
  };

  const { text } = await callLlm({
    provider,
    apiKey,
    payload,
    endpoint: "story_reply"
  });
  const options = splitOptions(text);
  if (options.length === 0) {
    throw new Error("OpenAI response did not include reply options.");
  }
  return options.slice(0, count);
}

async function generateBanterMessages({
  provider,
  apiKey,
  model,
  temperature,
  maxOutputTokens,
  storyCaption,
  imagePath,
  boyReplyText,
  spiceTier,
  controversyTier,
  bannedPhrases,
  numMessages,
  girlName,
  boyName,
  girlArchetype,
  format,
  arcType,
  viralExamples,
  avoidBoyLines,
  avoidGirlLines,
  imageDetails,
  imageHook,
  pivotExamples,
  viralConversations,
  punchlineStyle,
  brainrotStyle
}) {
  const count = Number.isFinite(numMessages) ? numMessages : 4;
  const userPrompt = buildBanterPrompt({
    storyCaption,
    boyReplyText,
    spiceTier,
    controversyTier,
    bannedPhrases,
    numMessages: count,
    girlName,
    boyName,
    girlArchetype,
    format,
    arcType,
    viralExamples,
    avoidBoyLines,
    avoidGirlLines,
    imageDetails,
    imageHook,
    pivotExamples,
    viralConversations,
    punchlineStyle,
    brainrotStyle
  });

  let imageData = null;
  if (format === "D" && imagePath && fs.existsSync(imagePath)) {
    const imageBuffer = fs.readFileSync(imagePath);
    const mimeType = getMimeType(imagePath);
    imageData = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  }

  const payload = {
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: arcType === "comedy" ? COMEDY_BANTER_SYSTEM_PROMPT : (brainrotStyle ? BRAINROT_BANTER_SYSTEM_PROMPT : BANTER_SYSTEM_PROMPT) }]
      },
      {
        role: "user",
        content: imageData
          ? [
              { type: "input_text", text: userPrompt },
              { type: "input_image", image_url: imageData }
            ]
          : [{ type: "input_text", text: userPrompt }]
      }
    ],
    temperature,
    max_output_tokens: maxOutputTokens
  };

  const { text } = await callLlm({
    provider,
    apiKey,
    payload,
    endpoint: "banter"
  });
  const messages = parseBanterMessages(text);
  if (messages.length === 0) {
    throw new Error("OpenAI response did not include banter messages.");
  }
  return messages.map((message) => {
    if (!message || !message.text) return message;
    if (/\b555\s?\d{3}\s?\d{4}\b/.test(message.text)) return message;
    const level = message.from === "girl" ? 0.55 : 0.35;
    return { ...message, text: addImperfection(message.text, level) };
  });
}

async function generatePushbackOptions({
  provider,
  apiKey,
  model,
  temperature,
  maxOutputTokens,
  boyReplyText,
  storyCaption,
  spiceTier,
  controversyTier,
  bannedPhrases,
  avoidPushbacks,
  numOptions,
  format
}) {
  const count = Number.isFinite(numOptions) ? numOptions : 1;
  const userPrompt = buildPushbackPrompt({
    boyReplyText,
    storyCaption,
    spiceTier,
    controversyTier,
    bannedPhrases,
    avoidPushbacks,
    numOptions: count,
    format
  });

  const payload = {
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: PUSHBACK_SYSTEM_PROMPT }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: userPrompt }]
      }
    ],
    temperature,
    max_output_tokens: maxOutputTokens
  };

  const { text } = await callLlm({
    provider,
    apiKey,
    payload,
    endpoint: "pushback"
  });
  const options = splitOptions(text);
  if (options.length === 0) {
    throw new Error("OpenAI response did not include pushback options.");
  }
  return options.slice(0, count);
}

async function generateRevealOptions({
  provider,
  apiKey,
  model,
  temperature,
  maxOutputTokens,
  boyReplyText,
  girlPushbackText,
  storyCaption,
  spiceTier,
  controversyTier,
  bannedPhrases,
  avoidLines,
  numOptions
}) {
  const count = Number.isFinite(numOptions) ? numOptions : 1;
  const userPrompt = buildRevealPrompt({
    boyReplyText,
    girlPushbackText,
    storyCaption,
    spiceTier,
    controversyTier,
    bannedPhrases,
    avoidLines,
    numOptions: count
  });

  const payload = {
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: REVEAL_SYSTEM_PROMPT }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: userPrompt }]
      }
    ],
    temperature,
    max_output_tokens: maxOutputTokens
  };

  const { text } = await callLlm({
    provider,
    apiKey,
    payload,
    endpoint: "reveal"
  });
  const options = splitOptions(text);
  if (options.length === 0) {
    throw new Error("OpenAI response did not include reveal options.");
  }
  return options.slice(0, count);
}

// ---------------------------------------------------------------------------
// EdgyBoyV2: Blueprint-driven banter prompt builder
// ---------------------------------------------------------------------------

/**
 * Build a full-dialogue banter prompt driven by an EdgyBoyV2 blueprint.
 * Produces the same output shape as buildBanterPrompt (girl/boy lines),
 * but instructs the LLM to embed the two-beat innuendo structure defined
 * by the blueprint.
 *
 * This is ONLY called when experiments.edgyBoyV2.enabled === true.
 * All existing prompts are unchanged.
 */
function buildEdgyBanterPrompt({
  blueprint,
  storyCaption,
  boyReplyText,
  spiceTier,
  controversyTier,
  bannedPhrases,
  numMessages,
  girlName,
  boyName,
  girlArchetype,
  arcType,
  avoidBoyLines,
  avoidGirlLines,
  imageDetails,
  imageHook
}) {
  if (!blueprint) throw new Error("[edgy-banter] blueprint is required");

  const lines = [];
  const count = Number.isFinite(numMessages) ? numMessages : 6;

  lines.push("Write a DM thread after a guy replies to a girl's Instagram story.");
  lines.push("Write in American English only.");
  lines.push("Write the girl's lines as if you are her.");
  lines.push("The girl is confident, sharp, a hot baddie — lowercase DM style.");
  lines.push("The boy is confident and playful.");
  lines.push("");

  // -- Blueprint injection --
  lines.push("=== EdgyBoyV2 STRUCTURE (MANDATORY) ===");
  lines.push("This script MUST use the following two-beat innuendo structure:");
  lines.push("");
  lines.push("SETUP RULE:");
  lines.push(blueprint.setup_instruction);
  lines.push("");
  lines.push("PAYOFF RULE:");
  lines.push(blueprint.payoff_instruction);
  lines.push("");
  lines.push("EXAMPLE EXCHANGES from viral videos (match this energy, do NOT copy verbatim):");
  if (Array.isArray(blueprint.example_exchanges)) {
    blueprint.example_exchanges.forEach((ex) => {
      if (ex.boy) lines.push(`  boy: "${ex.boy}"`);
      if (ex.girl) lines.push(`  girl: "${ex.girl}"`);
      if (ex.girl2) lines.push(`  girl: "${ex.girl2}"`);
      if (ex.girl3) lines.push(`  girl: "${ex.girl3}"`);
      if (ex.boy2) lines.push(`  boy: "${ex.boy2}"`);
      if (ex.girl2 && ex.boy3) lines.push(`  girl: "${ex.girl2}"`);
      if (ex.boy3) lines.push(`  boy: "${ex.boy3}"`);
      lines.push("  ---");
    });
  }
  lines.push("");
  lines.push("COMMENT-BAIT REQUIREMENT:");
  lines.push(blueprint.comment_bait_hint);
  lines.push("");
  lines.push("SCREENSHOT PUNCHLINE REQUIREMENT:");
  lines.push(blueprint.screenshot_hint);
  lines.push("");
  lines.push("SAFETY:");
  lines.push(blueprint.safety_note);
  lines.push("=== END STRUCTURE ===");
  lines.push("");

  // -- Context --
  if (storyCaption) lines.push(`Story caption: ${storyCaption}`);
  if (imageDetails) {
    lines.push(`Visual details: ${imageDetails}`);
    if (imageHook) lines.push(`Textable detail: ${imageHook}`);
  }
  if (boyReplyText) lines.push(`Boy's story reply (his opening DM): ${boyReplyText}`);
  lines.push("Keep the boy's later replies in the same vibe as his opening.");
  lines.push("CRITICAL: The boy's FIRST message in this thread must NOT repeat or echo his opening DM above.");
  lines.push("");

  // -- Girl behavior --
  lines.push("Girl behavior rules:");
  if (girlArchetype) lines.push(`Girl archetype: ${girlArchetype}`);
  lines.push("- Her first reply must be genuine confusion or surprise — NOT an eager accept.");
  lines.push("- 'yes??' and 'yes?' count as confusion, not acceptance. These are fine.");
  lines.push("- Avoid eager accepts like 'sure', 'of course', 'sounds good', 'yes please'.");
  lines.push("- She is unimpressed at first, then curious, then grudgingly entertained.");
  lines.push("- Keep her lines authentic: mostly lowercase, fragments, DM texture.");
  lines.push("- Her lines: 2–7 words normally, longer allowed when adding personality.");
  lines.push("");

  // -- Arc --
  if (arcType) {
    lines.push(`Arc type: ${arcType}`);
    if (arcType === "comedy") {
      lines.push("Comedy arc: every message must be funny. No date close. No phone number.");
      lines.push("Girl gets the last laugh. End on a punchline or callback.");
    } else if (arcType === "number_exchange") {
      lines.push("End with girl giving her number + a flirty tease.");
    } else if (arcType === "rejection") {
      lines.push("End with girl declining gracefully. Boy takes it with humor. No phone number.");
    }
  }
  lines.push("");

  // -- Quality rules --
  lines.push("Quality rules:");
  lines.push("- No hyphens (-) anywhere in the messages.");
  lines.push("- No explicit sexual content, threats, slurs, or coercion.");
  lines.push("- Keep each message under 70 characters.");
  lines.push("- Emojis allowed sparingly.");
  lines.push("");

  // -- Avoid repetition --
  if (Array.isArray(bannedPhrases) && bannedPhrases.length) {
    lines.push("Never use these banned phrases:");
    bannedPhrases.forEach((phrase) => lines.push(`- ${phrase}`));
    lines.push("");
  }
  if (Array.isArray(avoidBoyLines) && avoidBoyLines.length > 0) {
    lines.push("Do NOT repeat or closely paraphrase these recent boy lines:");
    avoidBoyLines.slice(-20).forEach((l) => lines.push(`- ${l}`));
    lines.push("");
  }
  if (Array.isArray(avoidGirlLines) && avoidGirlLines.length > 0) {
    lines.push("Do NOT repeat these recent girl lines:");
    avoidGirlLines.slice(-15).forEach((l) => lines.push(`- ${l}`));
    lines.push("");
  }

  if (spiceTier) lines.push(`Spice tier: ${spiceTier}`);
  buildControversyTierGuidance(controversyTier).forEach((l) => lines.push(l));
  if (girlName) lines.push(`Girl name: ${girlName}`);
  if (boyName) lines.push(`Boy name: ${boyName}`);
  lines.push("");

  lines.push(`Write exactly ${count} messages total.`);
  lines.push("Start with the girl. Alternate girl/boy each line.");
  lines.push("Each line must start with exactly \"girl:\" or \"boy:\".");
  lines.push("Output ONLY the lines, no numbering, no extra text.");

  return lines.join("\n");
}

/**
 * Call LLM to generate banter messages using an EdgyBoyV2 blueprint.
 * Returns parsed messages array (same shape as generateBanterMessages).
 */
async function generateEdgyBanterMessages({
  provider,
  apiKey,
  model,
  temperature,
  maxOutputTokens,
  blueprint,
  storyCaption,
  boyReplyText,
  spiceTier,
  controversyTier,
  bannedPhrases,
  numMessages,
  girlName,
  boyName,
  girlArchetype,
  arcType,
  avoidBoyLines,
  avoidGirlLines,
  imageDetails,
  imageHook
}) {
  const userPrompt = buildEdgyBanterPrompt({
    blueprint,
    storyCaption,
    boyReplyText,
    spiceTier,
    controversyTier,
    bannedPhrases,
    numMessages,
    girlName,
    boyName,
    girlArchetype,
    arcType,
    avoidBoyLines,
    avoidGirlLines,
    imageDetails,
    imageHook
  });

  const payload = {
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: BANTER_SYSTEM_PROMPT }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: userPrompt }]
      }
    ],
    temperature: temperature != null ? temperature : 1.1,
    max_output_tokens: maxOutputTokens || 400
  };

  const { text } = await callLlm({
    provider,
    apiKey,
    payload,
    endpoint: "edgy_banter"
  });

  const messages = parseBanterMessages(text);
  if (messages.length === 0) {
    throw new Error("[edgy-banter] LLM returned no parseable messages");
  }
  return messages;
}

function addImperfection(text, level = 0.3) {
  if (!text || level <= 0) return text;
  let result = text;

  // Random lowercase (30% chance per word at full level)
  if (Math.random() < level * 0.5) {
    result = result.toLowerCase();
  }

  // Remove trailing punctuation sometimes
  if (Math.random() < level * 0.4) {
    result = result.replace(/[.!]$/, '');
  }

  // Contract common words
  if (Math.random() < level * 0.3) {
    result = result.replace(/\byou are\b/gi, 'youre');
    result = result.replace(/\bdo not\b/gi, 'dont');
    result = result.replace(/\bi am\b/gi, 'im');
    result = result.replace(/\bI will\b/gi, 'ill');
    result = result.replace(/\bcan not\b/gi, 'cant');
  }

  return result;
}

module.exports = {
  generateStoryReplyOptions,
  generateBanterMessages,
  generateEdgyBanterMessages,
  buildEdgyBanterPrompt,
  generatePushbackOptions,
  generateRevealOptions,
  generateBrainrotScript,
  parseBrainrotScripts,
  loadViralPatterns,
  addImperfection,
  normalizeProvider,
  resetLlmUsage,
  getLlmUsageSummary,
  resetBrainrotBatch,
  callLlm,
  startSlotContext,
  abortSlotContext
};
