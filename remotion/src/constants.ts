export const INTRO_DURATION_S = 2.5;
export const INTRO_GIF = "Michael Jordan Dunk GIF by NBA.gif";
export const INTRO_HEADLINE = "Texting a baddie";
export const INTRO_SUBTITLE = "*take notes*";
export const INTRO_REPLY_HEADLINE = "Texting a baddie";

// Competitor-matched hook line bank — rotated per video via seed
export const HOOK_HEADLINES = [
  "Texting a baddie",
  "Rizzing up huzz",
  "She wasn't ready for this",
  "Watch me cook",
  "This is how you text huzz",
  "Taking notes yet?",
  "Shooting my shot",
  "She had no chance",
  "DM game different",
  "Texting baddies different",
  "Rarest shot of all time",
  "She pushed back hard",
  "He went all in",
  "Bold move incoming",
  "Don't try this at home",
  "She tested him",
  "How to bag a baddie",
  "Texting game unmatched",
  "She wasn't expecting this",
  "The smoothest recovery",
  "He really said that",
  "She can't believe it",
  "Coldest opener ever",
  "Never give up on huzz",
  "Riskiest text I ever sent",
  "She thought I was done",
  "Plot twist incoming",
  "She folded immediately",
  "DM rizz masterclass",
  "This one hit different",
];
export const HOOK_SUBTITLES = [
  "*take notes*",
  "*we are all in*",
  "*watch closely*",
  "*pay attention*",
  "*don't blink*",
  "*she wasn't ready*",
  "*bold moves only*",
  "*no fear*",
  "*study this*",
  "*rizz notes*",
];

export const BEAT_GRID_S = 0.5;

export const FIRST_SHOT_DURATION_S = 0.8;
export const MESSAGE_SHOT_DURATION_S = 2.8;
export const MESSAGE_SHOT_MIN_S = 1.8;
export const MESSAGE_SHOT_MAX_S = 6.0;
export const IN_BETWEEN_MIN_COUNT = 3;
export const IN_BETWEEN_MAX_COUNT = 5;
export const IN_BETWEEN_MIN_S = 0.5;
export const IN_BETWEEN_MAX_S = 0.9;
// Competitor benchmark: 1 visual change every 2.3s = ~4-5 B-roll clips in a 20s video
export const CLIP_TARGET_EVERY_N_MESSAGES = 1.5;
export const CLIP_MIN_COUNT = 3;
export const CLIP_MAX_COUNT = 6;
export const CLIP_MIN_DURATION_S = 1.8;
export const CLIP_MAX_DURATION_S = 2.3;
export const CLIP_FADE_IN_FRAMES = 6;
export const CLIP_FADE_OUT_FRAMES = 6;
// Competitor-matched overlay text — NARRATIVE COMMENTARY style (viewer's inner monologue)
// Sourced from frame-by-frame analysis of @rizzlicious4u (1M views), @rizzingchats (786K), @sir.auraking (561K)
// These sound like what the VIEWER is thinking, not generic hype. Lowercase, Gen Z slang, emojis.
export const CLIP_OVERLAYS_LOW = [
  "watch this", "pay attention gng", "he's different", "she not ready",
  "stay with me", "this about to get crazy", "don't scroll", "trust the process",
  "hold on", "wait for it", "nah fr watch", "he's locked in"
];
export const CLIP_OVERLAYS_MEDIUM = [
  "he's cooking rn", "she wasn't ready for that", "this got spicy", "nah that's wild",
  "bro really said that", "she didn't see that coming", "this is getting good", "he ate that up",
  "no way 💀", "she's intrigued now", "he's not playing around", "the rizz is real"
];
export const CLIP_OVERLAYS_HIGH = [
  "bro is UNHINGED 💀", "this is chaos", "no way he said that 😭",
  "she just too innocent gng", "bro is wild for this", "she's done 😭",
  "he snapped fr", "nah he's crazy", "this man is bold 💀",
  "she can't handle it", "absolutely unhinged", "he said WHAT"
];
export const CLIP_OVERLAYS_BEAT_PUSHBACK = [
  "watch him recover", "let him cook", "he went in 💀", "bold move gng",
  "she pushed back hard", "he's not moving", "nah he held it down",
  "she tested him fr", "he didn't flinch", "she thought she won",
  "pressure test 💀", "wait... one more try"
];
export const CLIP_OVERLAYS_BEAT_ESCALATION = [
  "get ready we spicing things up", "this got spicy real quick",
  "nah that's crazy", "plot twist incoming", "she's warming up to him",
  "he's not stopping", "things getting real now", "she felt that one 😭",
  "he turned it up gng", "she can't ignore this", "bro is on one fr",
  "things just shifted"
];
export const CLIP_OVERLAYS_BEAT_SHIFT = [
  "moment of truth", "wait for it...", "here we go gng", "game just changed",
  "she's switching up now", "he got through to her", "she's different now 😭",
  "the turn", "she actually felt that", "he flipped it on her",
  "something just changed", "pay attention now gng"
];
export const CLIP_OVERLAYS_BEAT_CLOSE = [
  "she's caving 😭", "here it comes gng", "lock in", "don't fumble this",
  "he's almost there", "she's folding", "don't blow it now",
  "finish strong gng", "so close 💀", "he sealed it",
  "she gave in fr", "that's the bag 🏆"
];
export const STINGER_ONE_GIF = "Take That Ronaldo GIF by Lucas.gif";
export const STINGER_ONE_DURATION_S = 2.0;
// Victory celebration stinger — mandatory at end of every video (confirmed in 42% of 104 viral breakdowns)
export const WIN_CELEBRATION_ASSETS = [
  "Hooks/Lebron James Basketball GIF by NBA copy 2.mp4",
  "Hooks/lebron james basketball GIF by NBA.mp4",
  "Hooks/Happy Nba Finals GIF by NBA.mp4",
  "Hooks/Slam Dunk Sport GIF by NBA.mp4",
  "Hooks/Take That Ronaldo GIF by Lucas.mp4",
  "Hooks/North Carolina Dancing GIF by UNC Tar Heels.mp4",
];
export const WIN_CELEBRATION_DURATION_S = 2.0;
export const PAIR_MESSAGE_OFFSET_PX = 120;

export const TEXMI_PLUG_DURATION_S = 2.5;

// Format C (ultra-short): no intro, no stinger, rapid-fire 5 messages
export const FORMAT_C_MESSAGE_SHOT_DURATION_S = 1.1;
export const FORMAT_C_MESSAGE_SHOT_MIN_S = 0.8;
export const FORMAT_C_MESSAGE_SHOT_MAX_S = 1.4;
export const FORMAT_C_MIN_GAP_S = 0.8;

// Format D (extended banter): fullscreen, 17-23 messages, rapid pacing
export const FORMAT_D_MESSAGE_SHOT_DURATION_S = 0.85;
export const FORMAT_D_MESSAGE_SHOT_MIN_S = 0.6;
export const FORMAT_D_MESSAGE_SHOT_MAX_S = 1.1;
export const FORMAT_D_MIN_GAP_S = 0.5;
