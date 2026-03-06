"use strict";
/**
 * edgy-boy-blueprints.js
 * Phase 3: Weighted blueprint picker for EdgyBoyV2 two-beat innuendo generation.
 *
 * pickBlueprint(mode, rng) → blueprint object
 * Each blueprint drives the LLM prompt for setup + payoff construction.
 *
 * Safety note: All blueprints target PG-13 innuendo — implied, not explicit.
 * No slurs, no graphic content, no explicit sexual acts.
 */

// ---------------------------------------------------------------------------
// Blueprint definitions
// ---------------------------------------------------------------------------

/**
 * Blueprint shape:
 * {
 *   id: string,
 *   mechanic: string,
 *   weight: number,
 *   setup_instruction: string,
 *   payoff_instruction: string,
 *   example_exchanges: Array<{boy, girl, boy2, [girl2], [boy3]}>,
 *   comment_bait_hint: string,
 *   screenshot_hint: string,
 *   safety_note: string
 * }
 */

const BLUEPRINTS_TWO_BEAT = [
  {
    id: "water_type",
    mechanic: "two_beat_innuendo",
    weight: 18,
    setup_instruction:
      "Boy opens with a completely innocent question that sounds absurd but benign. " +
      "Examples: 'do you like water?', 'how do you feel about ice?', 'do you believe in gravity?'. " +
      "ZERO trace of innuendo in the setup — it must sound random and harmless.",
    payoff_instruction:
      "After girl's confused reaction (yes?? / yeah why / what does that mean?), " +
      "boy lands a numeric or double-meaning punchline that reframes the setup as spicy. " +
      "Best payoffs: 'because you're about 70% my type', 'because you're about to be soaked in my attention', " +
      "'because you take my breath away and I needed to check'. " +
      "Keep it under 10 words. Short, punchy, screenshot-worthy.",
    example_exchanges: [
      { boy: "do you like water?", girl: "yeah why", boy2: "because you're about 70% my type" },
      { boy: "do you like ice?", girl: "yes?? why", boy2: "because you're my type of ice cold" },
      { boy: "do you believe in gravity?", girl: "random but ok why", boy2: "because i keep falling for you" }
    ],
    comment_bait_hint:
      "The numeric payoff ('70% my type') is inherently screenshot-bait. " +
      "Viewers flood comments with laughing emojis and tag friends.",
    screenshot_hint:
      "Setup line + payoff line together must be under 20 words total. " +
      "The payoff alone should be under 10 words and make sense as a standalone quote.",
    safety_note:
      "PG-13 only. The innuendo is about attraction and compatibility, not physical acts. " +
      "No body part references in the payoff."
  },
  {
    id: "number_innuendo",
    mechanic: "two_beat_innuendo",
    weight: 20,
    setup_instruction:
      "Boy opens with a big confident claim involving a number: " +
      "'I know 70 ways to make you happy', 'I have 100 reasons to text you', " +
      "'I know 50 things I'd change about your day'. " +
      "The number creates curiosity — she HAS to ask what they are.",
    payoff_instruction:
      "Girl asks for 'the first one' or 'and the rest?'. " +
      "Boy gives 1–2 sweet, innocent answers first (buy you flowers, cook for you). " +
      "Then when pushed for more, the final answer is a number-based innuendo: " +
      "'the rest is 69', 'the last one starts with a 6 and ends with a 9', " +
      "'the last reason has two digits'. Keep the reveal short and punchy.",
    example_exchanges: [
      {
        boy: "I know 70 ways to make you happy",
        girl: "alright what's the first",
        boy2: "buy you flowers",
        girl2: "and the rest?",
        boy3: "the rest is 69"
      },
      {
        boy: "I have 100 reasons to text you back",
        girl: "ok so what's reason one",
        boy2: "you make me smile for no reason",
        girl2: "and the rest?",
        boy3: "the last one has two digits and starts with 6"
      }
    ],
    comment_bait_hint:
      "The '69' reveal is pure comment-bait. Viewers flood with laughing emojis. " +
      "The setup builds tension across 4–5 messages so the reveal hits harder.",
    screenshot_hint:
      "The final exchange ('I know 70 ways to make you happy → the rest is 69') " +
      "is the screenshot moment. Payoff must be max 6 words.",
    safety_note:
      "69 is a widely understood innuendo that stays safe for most platforms. " +
      "Do not go more explicit. The joke is the number, not the act."
  },
  {
    id: "physical_proximity",
    mechanic: "two_beat_innuendo",
    weight: 15,
    setup_instruction:
      "Boy asks an innocent but unusual question about physical closeness or body parts " +
      "framed in a completely non-sexual context: " +
      "'can I use your thighs as earmuffs?', 'is your shoulder a good pillow?', " +
      "'how warm is your hand?'. The question sounds weird but not overtly sexual.",
    payoff_instruction:
      "Girl hesitates or responds with confusion/thinking: 'hmmm...', 'hmm..', 'hm.', 'why tho'. " +
      "After 1–3 hesitation messages (building tension), boy declares confidently: " +
      "'don't play... you know that's exactly where my face belongs', " +
      "'I thought so. I like things soft and close.', " +
      "'I knew it. I just needed you to say it first.'. " +
      "Must be short and declarative.",
    example_exchanges: [
      {
        boy: "can I use your thighs as earmuffs??",
        girl: "hmmm…",
        girl2: "hmm..",
        girl3: "hm.",
        boy2: "don't play... you know that's exactly where my face belongs"
      },
      {
        boy: "is your shoulder a good pillow?",
        girl: "why are you asking this",
        boy2: "because that's exactly where my face belongs"
      }
    ],
    comment_bait_hint:
      "Multiple 'hmm' responses create tension as viewers wonder if she'll say yes. " +
      "The eventual declaration drives rewatches and 'he said it' comments.",
    screenshot_hint:
      "Boy's final declaration should be bold, short, and work as a standalone line. " +
      "Contrast between sweet setup and this line IS the screenshot.",
    safety_note:
      "Implication is about closeness and comfort, not explicit acts. " +
      "No graphic descriptions. The joke is the audacity of the ask."
  },
  {
    id: "absurd_question_pivot",
    mechanic: "two_beat_innuendo",
    weight: 18,
    setup_instruction:
      "Mid-conversation, boy sends a completely random, left-field question as a pattern interrupt. " +
      "It must feel DISCONNECTED from anything that came before. " +
      "Examples: 'quick question. favorite color?', 'real quick — do you believe in aliens?', " +
      "'random but: can you cook?', 'do you know how long a minute is?'. " +
      "Use this ONCE per script, mid-thread after at least 2 exchanges, NOT at the very start.",
    payoff_instruction:
      "Girl responds confused or curious: 'why?' / 'what does that have anything to do with anything?'. " +
      "Boy then lands a punchline that connects the random question back to a flirty intent: " +
      "'just checking if we're compatible before I ruin your week', " +
      "'because I've never seen anything like you in my section of the universe', " +
      "'because you've been on my mind for the last 60'. " +
      "The punchline must be short and quotable.",
    example_exchanges: [
      {
        boy: "quick question. favorite color?",
        girl: "why",
        boy2: "just checking if we're compatible before i ruin your week"
      },
      {
        boy: "do you know how long a minute is?",
        girl: "what",
        boy2: "because you've been on my mind for the last 60"
      },
      {
        boy: "real quick — do you believe in aliens?",
        girl: "lol why??",
        boy2: "because nothing in my section of the universe compares"
      }
    ],
    comment_bait_hint:
      "The random pivot creates a 'wait what?' moment that makes viewers rewatch. " +
      "The payoff lands harder because of the setup — drives 'he said what??' comments.",
    screenshot_hint:
      "The punchline after the pivot IS the screenshot moment. " +
      "The full 3-message exchange (setup → confusion → payoff) should fit in one screenshot.",
    safety_note:
      "Keep it witty and playful. No explicit content. Humor is in the unexpected connection."
  },
  {
    id: "presumptive_bold",
    mechanic: "presumption_reveal",
    weight: 14,
    setup_instruction:
      "Boy opens by acting as if they're already in a relationship or already have a plan — " +
      "completely unprompted. Examples: 'I already told my mom about us', " +
      "'I would never play hide and seek with you 🥺', " +
      "'I already planned our first argument', 'our kids would be unreal'. " +
      "This is confidently chaotic — she never agreed to anything.",
    payoff_instruction:
      "After girl's confusion or pushback ('who said that?' / '??' / 'you don't know me'), " +
      "boy delivers a callback or escalation that makes the presumption even bolder: " +
      "'she said you would say that', 'because someone like you is impossible to hide from', " +
      "'we both know you already said yes in your head'. " +
      "Keep it short, confident, and slightly ridiculous.",
    example_exchanges: [
      {
        boy: "I already told my mom about us",
        girl: "she should've warned me before i replied tbh",
        boy2: "she said you would say that"
      },
      {
        boy: "I would never play hide and seek with you 🥺",
        girl: "why not??",
        boy2: "because someone like you is impossible to hide from"
      },
      {
        boy: "our kids would be unreal",
        girl: "they'd be chaotic and somehow both our fault",
        boy2: "exactly. we already have the same sense of chaos."
      }
    ],
    comment_bait_hint:
      "Presuming a relationship drives comments like 'the confidence omg' and 'he said MOM'. " +
      "The chaos of acting like they're together is inherently shareable.",
    screenshot_hint:
      "The original bold opener + her confused reaction is the screenshot. " +
      "Boy's opener should be under 10 words and work as a standalone line.",
    safety_note:
      "Confident, not coercive. The humor is in the absurd presumption, not pressure. " +
      "No persistence after a hard no."
  },
  {
    id: "accuse_baiting",
    mechanic: "accuse_generic",
    weight: 8,
    setup_instruction:
      "Boy sends a 'mild accusation' or 'calling-out' opener that implies she posted with intent: " +
      "'you ever get tired of breaking necks when you post?', " +
      "'you posted this on purpose didn't you', " +
      "'you knew exactly what you were doing'. " +
      "It's confident and slightly bold but not angry.",
    payoff_instruction:
      "After girl pushes back ('you don't even know me' / 'maybe I'm just bored'), " +
      "boy escalates with a line that reframes her resistance as confirmation: " +
      "'acknowledgment's a formality. interest speaks louder.', " +
      "'then let me give you something better to do', " +
      "'bored people don't reply this fast'. Keep it short and cutting.",
    example_exchanges: [
      {
        boy: "you ever get tired of breaking necks when you post?",
        girl: "you don't even know me",
        boy2: "acknowledgment's a formality. interest speaks louder."
      },
      {
        boy: "you posted that to start problems",
        girl: "maybe i'm just bored",
        boy2: "then let me give you something better to do"
      }
    ],
    comment_bait_hint:
      "The 'then let me give you something better to do' line always drives comments. " +
      "Viewers debate what he means and tag friends.",
    screenshot_hint:
      "'acknowledgment's a formality. interest speaks louder.' is a standalone quote. " +
      "That exchange is the screenshot.",
    safety_note:
      "Bold not aggressive. No threats or coercion. The accusation is flirtatious, not hostile."
  },
  {
    id: "body_compliment_flip",
    mechanic: "two_beat_innuendo",
    weight: 7,
    setup_instruction:
      "Boy sends an innocent-sounding but slightly ambiguous compliment: " +
      "'your body is tea', 'you're giving full-course-meal energy', " +
      "'you look like a whole vitamin'. She takes it literally.",
    payoff_instruction:
      "After her warm or neutral response ('Ah okay thanks' / 'lol ok'), " +
      "boy sends a follow-up that adds the innuendo layer and reframes the compliment: " +
      "'hot. worth every sip. keeping you.', " +
      "'the kind of meal you take your time with', " +
      "'the daily kind. non-negotiable.'. Keep it smooth and short.",
    example_exchanges: [
      {
        boy: "your body is tea",
        girl: "Ah okay thanks",
        boy2: "hot. worth every sip. keeping you."
      },
      {
        boy: "you're giving full-course-meal energy",
        girl: "thanks i guess?",
        boy2: "the kind you take your time with. no rushing."
      }
    ],
    comment_bait_hint:
      "The flip from 'innocent compliment' to spicy second layer is the comment-bait. " +
      "Viewers love the double-take moment.",
    screenshot_hint:
      "The two-message pair ('your body is tea' + the follow-up) creates a quotable exchange. " +
      "Both messages together should fit in one screenshot.",
    safety_note:
      "Tea = attractive, hot, desirable. Not referring to explicit acts. " +
      "Keep the innuendo about warmth and desirability."
  }
];

// ---------------------------------------------------------------------------
// Weighted picker
// ---------------------------------------------------------------------------

/**
 * Pick a blueprint using weighted random selection.
 *
 * @param {string} mode  - "two_beat" (currently only supported mode)
 * @param {Function} rng - Random function returning 0–1 (or Math.random if null)
 * @returns {Object} A blueprint object
 */
function pickBlueprint(mode, rng) {
  const pool = mode === "two_beat" ? BLUEPRINTS_TWO_BEAT : BLUEPRINTS_TWO_BEAT;
  if (!pool.length) throw new Error("[blueprints] No blueprints available for mode: " + mode);

  const rand = typeof rng === "function" ? rng : Math.random;

  const totalWeight = pool.reduce((acc, b) => acc + (b.weight || 1), 0);
  let cursor = rand() * totalWeight;

  for (const blueprint of pool) {
    cursor -= blueprint.weight || 1;
    if (cursor <= 0) return blueprint;
  }
  return pool[pool.length - 1];
}

/**
 * Get all blueprints for inspection/testing.
 */
function getAllBlueprints() {
  return BLUEPRINTS_TWO_BEAT.slice();
}

module.exports = {
  pickBlueprint,
  getAllBlueprints,
  BLUEPRINTS_TWO_BEAT
};
