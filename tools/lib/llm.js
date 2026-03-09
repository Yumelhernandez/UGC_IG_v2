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
  "You write TikTok DM rizz conversations. Study these REAL viral examples first:",
  "",
  "EXAMPLE 1 (561K views — recovery play):",
  "boy reply: you remind me of treasure",
  "girl: that's random af",
  "boy: my dad abandoned me",
  "girl: oh no im sorry",
  "boy: well an abandoned treasure is still treasure",
  "girl: BRO 😭😭😭",
  "boy: dinner friday?",
  "girl: ok that was actually smooth 😭",
  "",
  "EXAMPLE 2 (935K views — double entendre):",
  "boy reply: i just know it's pinker than that dress",
  "girl: pinker than WHAT 😭",
  "boy: the pink dress is beautiful",
  "girl: oh... 😭😭",
  "boy: you free saturday?",
  "girl: maybe. maybe not",
  "",
  "EXAMPLE 3 (240K views — shock opener):",
  "boy reply: I goon to your highlights",
  "girl: EXCUSE ME??",
  "boy: just trying to get your attention",
  "girl: that's corny but sweet 😭",
  "boy: let me take you out",
  "girl: you're bold i'll give you that",
  "",
  "EXAMPLE 4 (hand-crafted — confused girl):",
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
  "EXAMPLE 5 (hand-crafted — hostile girl):",
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
  "=== WHAT MAKES THESE WORK (match this energy) ===",
  "",
  "BOY ENERGY: unhinged, specific, bold. NOT smooth or polished.",
  "  ✅ 'I goon to your highlights' — shocking, nobody expects this",
  "  ✅ 'my dad abandoned me' — vulnerable, then pivots to smooth",
  "  ✅ 'tell them to bring snacks' — absurd escalation",
  "  ❌ 'youre trouble and i like it' — generic, could be any girl",
  "  ❌ 'interesting of you to assume i listen' — sounds AI-written",
  "  ❌ 'problem is you care who im' — confusing, not a real sentence",
  "",
  "GIRL ENERGY: visceral gut reactions, NOT polished comebacks.",
  "  ✅ 'touch my WHAT 💀' — she misheard and panicked",
  "  ✅ 'pinker than WHAT 😭' — genuine shock at the innuendo",
  "  ✅ 'I live on the 8th floor HOW' — logic-checking his absurdity",
  "  ❌ 'careful you sound dangerously possessive' — too eloquent for DMs",
  "  ❌ 'you filing or folding rn' — sounds like a copywriter wrote it",
  "  ❌ 'huh, what do u mean?' — bland, no personality",
  "",
  "THE LINE TEST: Would someone screenshot this line and send it to their group chat?",
  "If no one would screenshot it → the line is too boring → rewrite it.",
  "",
  "=== MID-CONVERSATION LINES (the gaps between punchlines) ===",
  "",
  "The lines BETWEEN the hook and close are where most scripts fail. They go generic.",
  "",
  "GOOD boy mid-lines (specific, short, confident):",
  "  ✅ 'nah now I'm curious' — simple, pushes forward",
  "  ✅ 'dedication' — one word flex after she challenges him",
  "  ✅ 'what did you think I meant 👀' — turns it back on her",
  "  ✅ 'I would but you're in the way' — smooth callback to her pushback",
  "  ✅ 'save it for in person' — redirects to the date",
  "",
  "BAD boy mid-lines (abstract, confusing, AI-written):",
  "  ❌ 'problem is you care who im' — not a real sentence",
  "  ❌ 'you tease the jungle then fear the roar' — compound metaphor gibberish",
  "  ❌ 'noted, ill remember that' — too polite, sounds like customer service",
  "  ❌ 'interesting of you to flirt with liability' — corporate speak",
  "  ❌ 'nah because you knew that photo was cruel' — retrospective narrator voice",
  "",
  "GOOD girl mid-reactions (short, specific to what he said):",
  "  ✅ 'bro move ON 😭' — she's flustered and wants him to stop",
  "  ✅ 'NOTHING forget it 💀💀' — she said too much and regrets it",
  "  ✅ 'I live on the 8th floor HOW' — logic-checking his claim",
  "  ✅ 'not ur imaginary wife bro😭' — roasting his specific claim",
  "  ✅ 'ur actually chatting nonsense' — dismissive but engaged",
  "",
  "BAD girl mid-reactions (filler, overused, no personality):",
  "  ❌ 'says who?' — lazy filler, adds nothing",
  "  ❌ 'oh really?' — bland, could be any conversation",
  "  ❌ 'and what about it' — overused, no personality",
  "  ❌ 'huh? how?' — empty placeholder",
  "  ❌ 'you sure you're stable enough' — too eloquent",
  "",
  "RULE: Every mid-line must REACT TO the specific previous line.",
  "If the boy said something about her photo, her reply references the photo.",
  "If the boy escalated the joke, she escalates back or logic-checks him.",
  "Generic filler ('says who?', 'oh really?') = script sounds AI-generated.",
  "",
  "=== RULES ===",
  "",
  "Write in American English. Write the girl's lines as if you are her.",
  "Girl: hot baddie, lowercase, fragments, Gen Z slang (tf, rn, omg, lmao, nah, bro). 2-7 words usually.",
  "Boy: funny 19yo, bold, slightly unhinged, NOT smooth or polished. Uses emojis sparingly: 😭🥀😮‍💨.",
  "Girl pushes back HARD early. She's genuinely unimpressed. When she cracks, it EXPLODES.",
  "Boy leads the close. He names the day/time/activity.",
  "Girl's final line must be loud: 'ok that was smooth I hate you 😭' not 'ok fine'.",
  "Girl never says boy's name. Girl never plans the date.",
  "",
  "BANNED (sounds AI-written):",
  "- 'about that [noun]' transitions",
  "- Abstract combos: 'chaos couture', 'vibe portfolio', 'emotion insurance'",
  "- Fortune cookie lines: 'the best things come to those who wait'",
  "- Corporate metaphors: 'filing a claim', 'quarterly report'",
  "",
  "Format: one message per line, prefix \"girl: ...\" or \"boy: ...\". No hyphens.",
  "Keep it flirty but safe. No explicit sexual content."
].join("\n");

// Derived from BANTER_SYSTEM_PROMPT — keep safety, format, and grounding rules in sync.
// COMEDY_BANTER_SYSTEM_PROMPT removed (2026-03-08 simplification) — comedy arc disabled.

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
// BRAINROT ARC — REMOVED (2026-03-08 simplification)
// The entire brainrot institutional chaos generation system (487-line system prompt,
// buildBrainrotUserPrompt, parseBrainrotScripts, generateBrainrotScript, etc.)
// was removed because the brainrot arc is disabled (0% in arc_distribution).
// Stub functions below maintain the module.exports contract.
// ---------------------------------------------------------------------------
function resetBrainrotBatch() {}
async function generateBrainrotScript() { return null; }
function parseBrainrotScripts() { return []; }

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
  const _brainrotPunchlineTypes = ["numeric_reveal", "list_reveal", "setup_reframe", "persistence_flip", "presumptive_close", "roast_flip", "recovery_play", "sustained_metaphor"];
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
  // SKIP for comedy arcs — comedy needs free-form humor, not rigid punchline structures
  if (_isBrainrotPunchline && arcType !== "comedy") {
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
      // Fallback pairs if pickVariant returns null — rotate through diverse options, never default to same one
      const _srFallbacks = [
        { setup: "i wanna put something inside you", reframe: "a smile", girl_reaction: "EXCUSE ME 😭😭😭", type: "double_entendre" },
        { setup: "are your parents divorced?", reframe: "because i can't figure out which one gave you all the looks", girl_reaction: "wow really 💀", type: "question_misdirect" },
        { setup: "i need you on your knees", reframe: "to help me find my contact lens i dropped it", girl_reaction: "HELLO?? 💀💀", type: "double_entendre" },
      ];
      const _fb = srPair || _srFallbacks[Math.floor(Math.random() * _srFallbacks.length)];
      const setupLine = _fb.setup;
      const reframeLine = _fb.reframe;
      const girlReaction = _fb.girl_reaction || "excuse me?? 💀";
      const pairType = _fb.type || "negative_reframe";
      lines.push(`  girl: [first reaction — 1-5 words]`);
      lines.push(`  boy: ${setupLine}  ← write this EXACT line`);
      lines.push(`  girl: ${girlReaction} ← write this EXACT reaction`);
      lines.push(`  boy: ${reframeLine}  ← write this EXACT reframe`);
      if (pairType === "double_entendre") {
        lines.push(`  boy: what did you think i meant 👀  ← add this line to twist the knife`);
        lines.push(`  girl: [flustered with emoji — "NOTHING forget it 💀" / "bro DON'T play with me 😭"]`);
      } else if (pairType === "question_misdirect") {
        lines.push(`  girl: [shocked impressed — "ok wait that was actually good 😭" / "i hate you for that 💀"]`);
      } else {
        lines.push(`  girl: [impressed with emoji — "ok that was smooth omg" / "omg😭 i hate that"]`);
      }
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
    } else if (punchlineStyle === "recovery_play") {
      const rpStarter = pickVariant(av.recovery_play && av.recovery_play.starters);
      const awkwardLine = (rpStarter && rpStarter.awkward) || "i just got out of therapy";
      const recoveryLine = (rpStarter && rpStarter.recovery) || "she said face my fears and here i am";
      lines.push(`  girl: [first reaction — 1-5 words, curious/confused]`);
      lines.push(`  boy: ${awkwardLine}  ← write this EXACT line (it sounds bad on purpose)`);
      lines.push(`  girl: [concerned or confused — "wait what 💀" / "um ok??" / "that's... something"]`);
      lines.push(`  boy: ${recoveryLine}  ← write this EXACT recovery (the pivot that makes it smooth)`);
      lines.push(`  girl: [stunned impressed — "ok THAT was smooth 😭" / "bro the recovery 💀💀" / "how did you save that"]`);
      lines.push(`  [close sequence — the recovery earned it]`);
    } else if (punchlineStyle === "sustained_metaphor") {
      const smTheme = pickVariant(av.sustained_metaphor && av.sustained_metaphor.themes);
      const metaphor = (smTheme && smTheme.metaphor) || "criminal";
      const escalations = (smTheme && smTheme.escalations) || ["stole my attention", "stole my focus", "now you owe time"];
      lines.push(`  girl: [first reaction — 1-5 words]`);
      lines.push(`  The conversation must build on a SINGLE ${metaphor} metaphor across 3+ messages.`);
      lines.push(`  Each boy line escalates the same metaphor: "${escalations[0]}" → "${escalations[1]}" → "${escalations[2]}"`);
      lines.push(`  The girl reacts to each escalation — she can play along, resist, or be confused.`);
      lines.push(`  The humor comes from how far the boy stretches ONE theme. He never breaks character.`);
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

    const brainrotPunchlineTypes = ["numeric_reveal", "list_reveal", "setup_reframe", "persistence_flip", "presumptive_close", "roast_flip", "recovery_play", "sustained_metaphor"];
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
      lines.push("End with the girl declining — but make it FUNNY, not flat. The rejection should be entertaining and quotable.");
      lines.push("The boy tried his best and the girl genuinely considered it — but she's choosing peace. The humor is in how she says no.");
      lines.push("Good rejection endings (funny AND final): 'nah you're sweet but i'm choosing peace today 💀', 'that was actually smooth but still no 😭', 'you're funny but not funny enough to get my number', 'saving this to show my friends but still no', 'A for effort tho'");
      lines.push("BAD rejection endings (flat, boring): 'not gonna happen', 'nah i'm good', 'hard pass', 'no', 'pass'");
      lines.push("The boy's last line after rejection should be dignified-funny, not bitter: 'respect. your loss tho', 'fair enough. universe owes me one', 'can't blame me for trying 😭'");
      lines.push("Hard rule: no phone number pattern in the final 3 messages.");
    } else if (arcType === "plot_twist") {
      lines.push("End with an unexpected twist that changes the dynamic. The twist must make the viewer re-read the conversation.");
      lines.push("Twist types (VARY these — never use the same one twice in a row):");
      lines.push("  - Double entendre: boy says something suggestive → reveals innocent meaning → girl is flustered");
      lines.push("  - Identity reveal: she's his ex, his friend's sister, his classmate, his neighbor");
      lines.push("  - Testing: she was testing him all along and he passed/failed");
      lines.push("  - Misunderstanding: she thought he meant X but he meant Y (or vice versa)");
      lines.push("  - Role reversal: she reveals SHE slid into HIS DMs first, or she already has his number");
    } else if (arcType === "cliffhanger") {
      lines.push("End the conversation mid-tension. Cut off before resolution. Last message should leave the viewer wanting to know what happens next.");
      lines.push("Hard rule: no clean resolution phrase like 'see you', 'locked in', 'youre on', 'deal'.");
      lines.push("BANNED PATTERN: never write 'about that [noun]' or 'about that casual' or 'about that [anything]'. This is a crutch — find a better way to continue the conversation.");
      lines.push("Cliffhanger examples (study the TENSION that makes viewers need part 2):");
      lines.push("  boy: 'so when am i picking you up' → girl: 'i didn't say yes yet' → END");
      lines.push("  boy: 'you're blushing i can tell through the screen' → girl: 'i need to tell you something first' → END");
      lines.push("  boy: 'whats your number' → girl: 'depends. what are you gonna do with it' → END");
      lines.push("Notice: the girl's last line creates a QUESTION the viewer needs answered. Not just 'maybe'.");
    } else if (arcType === "comedy") {
      lines.push("This is a comedy arc. Every single message must be funny — absurdist, witty, self-aware, or a callback.");
      lines.push("IMPORTANT: There is NO resistance beat or dismissal phase in comedy. The girl does NOT start cold. She is funny and reactive FROM MESSAGE 1.");
      lines.push("COMEDY FIRST MESSAGE RULE: She picks up a specific word or concept from his opener and escalates it. She builds on the joke — she does NOT just react with a short skeptical word.");
      lines.push("BANNED line (never use anywhere): 'wait i actually screenshotted this already'.");
      lines.push("");
      lines.push("CRITICAL — THE GIRL MUST BE FUNNIER THAN THE BOY at least twice. She doesn't just react — she one-ups him:");
      lines.push("Comedy examples where the girl CARRIES the humor:");
      lines.push("  boy: 'i'm outside your window' → girl: 'bro I'm calling the cops 💀' → boy: 'tell them to bring snacks' → girl: 'i live on the 8th floor HOW'");
      lines.push("  boy: 'you come here often?' → girl: 'to my own DMs? yeah occasionally' → boy: 'smartass' → girl: 'and yet here you still are'");
      lines.push("  boy: 'i already told my mom about us' → girl: 'she should've warned me before i replied tbh'");
      lines.push("  boy: 'this post is a violation' → girl: 'file the report, i'll be your first witness'");
      lines.push("  boy: 'our kids would be unreal' → girl: 'they'd be chaotic and somehow both our fault'");
      lines.push("Notice: the girl doesn't just say '😭' or 'omg'. She adds NEW comedy information that makes HER line the quotable one.");
      lines.push("GIRL COMEDY MOVES: escalate to absurd ('i live on the 8th floor HOW'), flip his logic ('to my own DMs? yeah occasionally'), one-up his joke ('and yet here you still are').");
      lines.push("");
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
    lines.push("The girl's FINAL message is a FUNNY rejection — entertaining to watch, quotable, but definitively no.");
    lines.push("Her final line must NOT be 'fine', 'ok', 'alright', or any form of agreement.");
    lines.push("Good final girl lines: 'nah you're sweet but i'm choosing peace today 💀', 'that was smooth but still no 😭', 'saving this to show my friends but still no', 'A for effort tho honestly 💀', 'you're not bad you're just not it rn 😭'");
    lines.push("No phone number anywhere in the conversation.");
  } else if (arcType === "cliffhanger") {
    lines.push("The boy makes his close attempt near the end.");
    lines.push("The girl's FINAL message leaves things unresolved — she does NOT agree, resolve, or say 'fine'.");
    lines.push("Her final line creates a QUESTION the viewer NEEDS answered. Not just 'maybe'.");
    lines.push("Good final girl lines: 'depends. what are you gonna do with it', 'i need to tell you something first', 'ask me that again in person', 'i didn't say yes yet 😭', 'that depends on something you don't know yet'.");
    lines.push("BANNED: 'about that [noun]' pattern. Never write it.");
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
        content: [{ type: "input_text", text: brainrotStyle ? BRAINROT_BANTER_SYSTEM_PROMPT : BANTER_SYSTEM_PROMPT }]
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
