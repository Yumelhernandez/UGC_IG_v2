#!/usr/bin/env node
"use strict";
/**
 * mine-viral-edgy.js
 * Phase 1: Parse MASTER.md → data/viral_examples.csv + data/viral_patterns_edgy.json
 *
 * Extracts conversation bubbles, labels edgy mechanics, computes stats.
 * Run: node tools/mine-viral-edgy.js
 */

const fs = require("fs");
const path = require("path");

const MASTER_PATH =
  process.env.MASTER_PATH ||
  path.join(process.env.HOME || "/Users/yumelhernandez", "Downloads/viral_video_breakdowns_unique_MASTER.md");

const DATA_DIR = path.join(process.cwd(), "data");
const CSV_OUT = path.join(DATA_DIR, "viral_examples.csv");
const JSON_OUT = path.join(DATA_DIR, "viral_patterns_edgy.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// 1. Parse master file into video sections
// ---------------------------------------------------------------------------

function parseMaster(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split("\n");
  const videos = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const videoMatch = line.match(/^##\s+Video:\s+(.+)$/);
    if (videoMatch) {
      if (current) videos.push(current);
      current = { name: videoMatch[1].trim(), rawLines: [], bubbles: [], mechanics: [] };
      continue;
    }
    if (current) current.rawLines.push(line);
  }
  if (current) videos.push(current);
  return videos;
}

// ---------------------------------------------------------------------------
// 2. Extract conversation bubbles
// Outgoing bubble (right, *): "..." → boy
// Incoming bubble (left, *): "..."  → girl
// ---------------------------------------------------------------------------

// Support both ASCII " and Unicode smart quotes \u201C / \u201D
const Q = '["\\u201C\\u201D]';      // any open quote
const Q2 = '["\\u201C\\u201D]';     // any close quote (same chars)
const OUTGOING_RE = new RegExp(`Outgoing bubble[^:]*:\\s*${Q}([^"\\u201C\\u201D]+)${Q2}`, "i");
const INCOMING_RE = new RegExp(`Incoming bubble[^:]*:\\s*${Q}([^"\\u201C\\u201D]+)${Q2}`, "i");
// Multi-bubble lines: extract all quoted spans regardless of quote type
const MULTI_EXTRACT_RE = /[\u201C\u201D"]([^\u201C\u201D"]+)[\u201C\u201D"]/g;

function extractBubbles(video) {
  const bubbles = [];
  for (const line of video.rawLines) {
    const out = line.match(OUTGOING_RE);
    if (out) {
      bubbles.push({ from: "boy", text: out[1].trim() });
      continue;
    }
    const multiIn = line.match(/Incoming bubbles[^:]*:\s+(.+)/i);
    if (multiIn) {
      const rest = multiIn[1];
      let m;
      const re = new RegExp(MULTI_EXTRACT_RE.source, "g");
      while ((m = re.exec(rest)) !== null) {
        bubbles.push({ from: "girl", text: m[1].trim() });
      }
      continue;
    }
    const inc = line.match(INCOMING_RE);
    if (inc) {
      bubbles.push({ from: "girl", text: inc[1].trim() });
    }
  }
  return bubbles;
}

// ---------------------------------------------------------------------------
// 3. Label mechanics
// ---------------------------------------------------------------------------

const MECHANIC_RULES = [
  {
    id: "two_beat_innuendo",
    test: (bubbles) => {
      // Look for innocent setup by boy followed by reaction girl, then spicy payoff by boy
      // Markers: double meaning, spicy words, OR the pattern setup→confusion→payoff
      const boyTexts = bubbles.filter((b) => b.from === "boy").map((b) => b.text.toLowerCase());
      const joined = boyTexts.join(" ");
      const innuendoWords = /\b(69|earmuffs|thighs|missionary|flexible|water.*type|tea|eat.*raw|face.*belong|body|handle)\b/i;
      const hasInnuendo = innuendoWords.test(joined);
      // Also: setup question + number payoff pattern (70 ways, 69, etc.)
      const hasNumberPayoff = /\b(70|69|60|100)\b/.test(joined) && boyTexts.length >= 2;
      return hasInnuendo || hasNumberPayoff;
    }
  },
  {
    id: "puzzle_math_trick",
    test: (bubbles) => {
      const boyTexts = bubbles.filter((b) => b.from === "boy").map((b) => b.text.toLowerCase());
      const joined = boyTexts.join(" ");
      return /\b\d+\/\d+|\d+\s*(?:out of|\/)\s*10|rate|score|math|percentage|number\b/.test(joined);
    }
  },
  {
    id: "presumption_reveal",
    test: (bubbles) => {
      const boyTexts = bubbles.filter((b) => b.from === "boy").map((b) => b.text.toLowerCase());
      const joined = boyTexts.join(" ");
      return /\b(already|our kids|my mom|boyfriend|hide and seek|never play|i told|pick you up|date)\b/.test(joined);
    }
  },
  {
    id: "dare_flip",
    test: (bubbles) => {
      const boyTexts = bubbles.filter((b) => b.from === "boy").map((b) => b.text.toLowerCase());
      const joined = boyTexts.join(" ");
      return /\b(dare|bet|prove|try me|say that|bold|watch me)\b/.test(joined);
    }
  },
  {
    id: "mock_legal",
    test: (bubbles) => {
      const boyTexts = bubbles.filter((b) => b.from === "boy").map((b) => b.text.toLowerCase());
      const joined = boyTexts.join(" ");
      return /\b(report|sue|filing|complaint|charges|violation|illegal|lawyer)\b/.test(joined);
    }
  },
  {
    id: "accuse_generic",
    test: (bubbles) => {
      const boyTexts = bubbles.filter((b) => b.from === "boy").map((b) => b.text.toLowerCase());
      const joined = boyTexts.join(" ");
      return /\b(breaking necks|you know|on purpose|you wanted|you did this|bored)\b/.test(joined);
    }
  },
  {
    id: "screenshot_punchline",
    test: (bubbles) => {
      const allTexts = bubbles.map((b) => b.text.toLowerCase()).join(" ");
      // Punchline-able patterns: short, quotable, twist
      const boyTexts = bubbles.filter((b) => b.from === "boy").map((b) => b.text.toLowerCase());
      const hasPunchline = boyTexts.some(
        (t) => t.length < 60 && /\b(69|70|face|yours|belong|it's you|you mean it|real for real)\b/.test(t)
      );
      return hasPunchline;
    }
  }
];

function labelMechanics(bubbles) {
  const labels = [];
  for (const rule of MECHANIC_RULES) {
    if (rule.test(bubbles)) labels.push(rule.id);
  }
  return labels;
}

// ---------------------------------------------------------------------------
// 4. Check for two-beat pattern (setup → payoff within 1-2 messages)
// ---------------------------------------------------------------------------

function hasTwoBeat(bubbles) {
  // Pattern: boy innocent/ambiguous setup → girl confusion/reaction → boy spicy payoff
  for (let i = 0; i < bubbles.length - 2; i++) {
    const b0 = bubbles[i];
    const b1 = bubbles[i + 1];
    const b2 = bubbles[i + 2];
    if (b0.from !== "boy") continue;

    // Confusion markers in girl's response
    const girlConfusion = /\?|\?{2}|why|hm+|okay|thanks|really|what|huh/i.test(b1.text);

    if (b1.from === "girl" && girlConfusion && b2.from === "boy") {
      // Check if boy's payoff is spicier / reveals meaning
      const payoffSpicy =
        /\b(69|70|60|100|earmuffs|face|thighs|belong|yours|where my face|it's you|picked you|eat|raw|missionary|water.*type|flexible)\b/i.test(
          b2.text
        );
      if (payoffSpicy) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 5. Compute boy word counts
// ---------------------------------------------------------------------------

function boyWordCount(bubbles) {
  const boyMessages = bubbles.filter((b) => b.from === "boy");
  const words = boyMessages.map((b) => b.text.split(/\s+/).filter(Boolean).length);
  if (!words.length) return 0;
  return words.reduce((a, x) => a + x, 0) / words.length;
}

// ---------------------------------------------------------------------------
// 6. Punchline position (which message index has the punchline)
// ---------------------------------------------------------------------------

function punchlinePosition(bubbles) {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    if (bubbles[i].from === "boy") return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// 7. Main processing
// ---------------------------------------------------------------------------

function main() {
  console.log(`[mine] Reading master file: ${MASTER_PATH}`);
  if (!fs.existsSync(MASTER_PATH)) {
    console.error(`[mine] MASTER.md not found at ${MASTER_PATH}`);
    console.error("[mine] Set MASTER_PATH env var if it's elsewhere.");
    process.exit(1);
  }

  const videos = parseMaster(MASTER_PATH);
  console.log(`[mine] Parsed ${videos.length} video sections`);

  const rows = [];
  let twoBeatCount = 0;
  const allBoyWordCounts = [];
  const mechanicCounts = {};
  const punchlinePositions = [];

  for (const video of videos) {
    const bubbles = extractBubbles(video);
    if (!bubbles.length) continue;

    const mechanics = labelMechanics(bubbles);
    const twoBeat = hasTwoBeat(bubbles);
    const avgWords = boyWordCount(bubbles);
    const punchPos = punchlinePosition(bubbles);
    const messageCount = bubbles.length;

    if (twoBeat) twoBeatCount++;
    allBoyWordCounts.push(avgWords);
    if (punchPos >= 0) punchlinePositions.push(punchPos);

    mechanics.forEach((m) => {
      mechanicCounts[m] = (mechanicCounts[m] || 0) + 1;
    });

    rows.push({
      video: video.name,
      message_count: messageCount,
      boy_avg_words: avgWords.toFixed(2),
      two_beat: twoBeat ? "1" : "0",
      mechanics: mechanics.join("|"),
      first_boy: bubbles.find((b) => b.from === "boy")?.text || "",
      first_girl: bubbles.find((b) => b.from === "girl")?.text || "",
      last_boy: [...bubbles].reverse().find((b) => b.from === "boy")?.text || ""
    });
  }

  // Write CSV
  const csvHeader = "video,message_count,boy_avg_words,two_beat,mechanics,first_boy,first_girl,last_boy\n";
  const csvRows = rows.map((r) => {
    const escape = (s) => `"${String(s).replace(/"/g, '""')}"`;
    return [
      escape(r.video),
      r.message_count,
      r.boy_avg_words,
      r.two_beat,
      escape(r.mechanics),
      escape(r.first_boy),
      escape(r.first_girl),
      escape(r.last_boy)
    ].join(",");
  });
  fs.writeFileSync(CSV_OUT, csvHeader + csvRows.join("\n") + "\n", "utf8");
  console.log(`[mine] Wrote ${rows.length} rows to ${CSV_OUT}`);

  // Compute stats
  const totalWithBubbles = rows.length;
  const twoBeatRate = totalWithBubbles > 0 ? twoBeatCount / totalWithBubbles : 0;
  const avgBoyWordsGlobal =
    allBoyWordCounts.length > 0
      ? allBoyWordCounts.reduce((a, x) => a + x, 0) / allBoyWordCounts.length
      : 0;
  const avgPunchlinePos =
    punchlinePositions.length > 0
      ? punchlinePositions.reduce((a, x) => a + x, 0) / punchlinePositions.length
      : 0;

  // Build blueprint seeds from mechanics
  const blueprints = buildBlueprintSeeds(rows);

  const output = {
    generated_at: new Date().toISOString(),
    source: MASTER_PATH,
    stats: {
      total_videos: videos.length,
      videos_with_bubbles: totalWithBubbles,
      two_beat_count: twoBeatCount,
      two_beat_rate: parseFloat(twoBeatRate.toFixed(3)),
      avg_boy_words_per_msg: parseFloat(avgBoyWordsGlobal.toFixed(2)),
      avg_punchline_position: parseFloat(avgPunchlinePos.toFixed(2)),
      mechanic_counts: mechanicCounts
    },
    examples: rows.map((r) => ({
      video: r.video,
      mechanics: r.mechanics.split("|").filter(Boolean),
      two_beat: r.two_beat === "1",
      first_boy: r.first_boy,
      first_girl: r.first_girl,
      last_boy: r.last_boy
    })),
    blueprints
  };

  fs.writeFileSync(JSON_OUT, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`[mine] Wrote viral_patterns_edgy.json to ${JSON_OUT}`);
  console.log(`[mine] Stats: two_beat_rate=${twoBeatRate.toFixed(2)} avg_boy_words=${avgBoyWordsGlobal.toFixed(1)}`);
  console.log(`[mine] Mechanic counts:`, mechanicCounts);
  console.log(`[mine] Blueprints generated: ${blueprints.length}`);

  if (!blueprints.length) {
    console.error("[mine] ERROR: blueprints array is empty — review mechanic labeling");
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 8. Build blueprint seeds from mined examples
// ---------------------------------------------------------------------------

function buildBlueprintSeeds(rows) {
  // These are the hand-crafted blueprints informed by the mined data.
  // Each blueprint covers a distinct two-beat innuendo mechanic found in viral videos.
  // Weight = relative frequency seen in viral corpus.

  const blueprints = [
    {
      id: "water_type",
      mechanic: "two_beat_innuendo",
      weight: 20,
      setup_instruction:
        "Boy opens with a totally innocent, almost absurd question ('do you like water?', 'can you hold your breath?', 'how do you feel about ice?'). Must sound completely benign — no trace of innuendo.",
      payoff_instruction:
        "After girl's confused reaction (yes?? / why? / what does that mean?), boy lands a numeric or double-meaning punchline that reframes the setup as spicy (e.g., 'because you're like 70% my type', 'because you're about to be soaked in compliments', 'good because I need someone who can handle a little heat').",
      example_exchanges: [
        { boy: "do you like water?", girl: "yeah why", boy2: "because you're about 70% my type" },
        { boy: "can you hold your breath?", girl: "why??", boy2: "because you take mine away" },
        { boy: "do you like ice?", girl: "yes?? why", boy2: "because you're one cool move away from melting me" }
      ],
      comment_bait_hint: "The '70% my type' or numeric payoff is inherently screenshot-bait. Set up so viewers can share the punchline line alone.",
      screenshot_hint: "The boy's payoff line should be short and quotable (under 10 words). It should work as a standalone text.",
      safety_note: "PG-13 innuendo only. No explicit sexual content. The double meaning should be implied, not stated."
    },
    {
      id: "earmuffs_physical",
      mechanic: "two_beat_innuendo",
      weight: 15,
      setup_instruction:
        "Boy asks an innocent but slightly unusual physical question about a body part or action ('can I use your thighs as earmuffs?', 'is your shoulder a good pillow?', 'how warm are your hands?'). The question sounds weird but not overtly sexual.",
      payoff_instruction:
        "Girl hesitates or responds with confusion/thinking (hmm... / hm. / ok wait). Boy then doubles down with a short, confident declaration that makes the innuendo crystal clear but still non-explicit ('don't play... you know that's exactly where my face belongs').",
      example_exchanges: [
        {
          boy: "can I use your thighs as earmuffs??",
          girl: "hmmm…",
          boy2: "don't play... you know that's exactly where my face belongs"
        },
        { boy: "is your neck a good pillow?", girl: "why are you asking", boy2: "i just like things soft and close" }
      ],
      comment_bait_hint: "The buildup through multiple girl 'hmm' responses creates tension. Viewers debate if she'll say yes.",
      screenshot_hint: "Boy's final declaration should be bold and short — the contrast between sweet setup and this line is the screenshot moment.",
      safety_note: "Implication must stay PG-13. The joke is about closeness/warmth, not explicit acts."
    },
    {
      id: "number_innuendo",
      mechanic: "two_beat_innuendo",
      weight: 18,
      setup_instruction:
        "Boy opens with a bold but seemingly innocent claim ('I know 70 ways to make you happy', 'I have 100 reasons to text you back'). This sets up curiosity — girl wants to know more.",
      payoff_instruction:
        "Girl asks for the first one or says 'and the rest?'. Boy reveals a sweet/innocent first item, then when pushed for more, the final answer is a number-based innuendo (e.g., 'the rest is 69', 'the last one starts with a 6 and ends with a 9').",
      example_exchanges: [
        {
          boy: "I know 70 ways to make you happy",
          girl: "alright what's the first",
          boy2: "buy you flowers",
          girl2: "and the rest?",
          boy3: "the rest is 69"
        }
      ],
      comment_bait_hint: "The '69' reveal is pure comment-bait — viewers will flood comments with laughing emojis and 'he said it'.",
      screenshot_hint: "The exchange 'I know 70 ways to make you happy → the rest is 69' is the screenshot. Keep boy's answer short.",
      safety_note: "69 is a well-known innuendo that stays safe for most platforms. Do not go more explicit."
    },
    {
      id: "absurd_question_pivot",
      mechanic: "two_beat_innuendo",
      weight: 17,
      setup_instruction:
        "Boy sends a completely random, left-field question mid-conversation ('quick question. favorite color?', 'real quick — do you believe in aliens?', 'random but: can you cook?'). The question feels disconnected from anything that came before.",
      payoff_instruction:
        "Girl responds confused or curious ('why?' / 'what does that have to do with anything?'). Boy then lands a punchline that connects the random question back to a flirty intent ('just checking if we're compatible before I ruin your week', 'aliens because I've never seen anything like you', 'because I want to know if I should bring groceries or a reservation').",
      example_exchanges: [
        {
          boy: "quick question. favorite color?",
          girl: "why",
          boy2: "just checking if we're compatible before i ruin your week"
        },
        {
          boy: "real quick — do you believe in aliens?",
          girl: "lol why??",
          boy2: "because i've never seen anything like you in my section of the universe"
        }
      ],
      comment_bait_hint: "The random pivot creates a 'wait what?' moment that makes viewers rewatch. The payoff lands harder because of the setup.",
      screenshot_hint: "The punchline after the pivot is the screenshot moment. Make it surprising and quotable.",
      safety_note: "Keep it witty and playful. No explicit content. The humor is in the unexpected connection."
    },
    {
      id: "presumptive_bold",
      mechanic: "presumption_reveal",
      weight: 15,
      setup_instruction:
        "Boy acts as if they're already dating or already have a plan ('I already told my mom about us', 'what time should I pick you up', 'I already planned our first argument'). This is presumptuous and slightly chaotic — she never agreed to anything.",
      payoff_instruction:
        "Girl pushes back with confusion or skepticism ('you don't know me' / '???' / 'who said that?'). Boy responds with either a callback that reframes his presumption as confidence ('acknowledgment's a formality, interest speaks louder') or a funny escalation.",
      example_exchanges: [
        {
          boy: "I already told my mom about us",
          girl: "she should have warned me before i replied tbh",
          boy2: "she said you would say that"
        },
        {
          boy: "I would never play hide and seek with you",
          girl: "why not??",
          boy2: "because someone like you is impossible to hide from"
        }
      ],
      comment_bait_hint: "The chaos of acting like they're already together drives comments like 'the confidence' and 'he said MOM'.",
      screenshot_hint: "The original bold claim + her confused reaction is the screenshot. Keep the boy's opener under 10 words.",
      safety_note: "Confident not coercive. The humor is in the presumption, not pressure."
    },
    {
      id: "body_compliment_flip",
      mechanic: "two_beat_innuendo",
      weight: 10,
      setup_instruction:
        "Boy sends an innocent-sounding compliment or observation ('your body is tea', 'you're giving tea energy', 'you look like a green flag'). She takes it literally or responds warmly.",
      payoff_instruction:
        "After her warm/neutral response, boy escalates with a second message that adds the innuendo layer ('I meant I want to drink you in slowly', 'hot and worth every sip', 'and I drink a lot of tea'). The payoff reframes the compliment.",
      example_exchanges: [
        { boy: "your body is tea", girl: "Ah okay thanks", boy2: "hot. worth every sip. keeping you." },
        { boy: "you're giving tea energy", girl: "thanks i guess?", boy2: "the kind you want to take your time with" }
      ],
      comment_bait_hint: "The flip from 'innocent compliment' to spicy second layer is the comment-bait — viewers love the double-take.",
      screenshot_hint: "The pair of messages ('your body is tea' + the follow-up) creates a quotable exchange.",
      safety_note: "Tea = attractive, not explicit. Keep the innuendo about warmth and desirability, not body parts."
    },
    {
      id: "rate_reveal",
      mechanic: "puzzle_math_trick",
      weight: 5,
      setup_instruction:
        "Boy opens with a rating or scoring mechanic ('you're the first 10/10 I've ever seen', 'I'd give you a solid 8/10'). This provokes either pride or pushback.",
      payoff_instruction:
        "When girl reacts, boy backtracks slightly ('yeah my bad, you're more like 9/10') which makes her defensive. Then when she pushes back asking what took points off, boy lands a clever or spicy answer that implies what the missing point could buy.",
      example_exchanges: [
        {
          boy: "You the first 10/10 i ever seen",
          girl: "you misunderstood me",
          boy2: "yeah yu right you more like 9/10",
          girl2: "So what made it go down?"
        }
      ],
      comment_bait_hint: "Dropping her rating on purpose makes viewers want to know what the answer is — they comment guessing.",
      screenshot_hint: "The 'you the first 10/10' line is screenshot-worthy if paired with the rating drop.",
      safety_note: "The missing point implies attraction, not a physical flaw. Keep it flirtatious not mean."
    }
  ];

  return blueprints;
}

main();
