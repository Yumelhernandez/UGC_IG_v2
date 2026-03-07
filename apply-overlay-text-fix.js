const fs = require('fs');
let ts = fs.readFileSync('remotion/src/constants.ts', 'utf8');

// Fix CLIP_OVERLAYS_HIGH — remove emojis
ts = ts.replace(
  /export const CLIP_OVERLAYS_HIGH = \[[^\]]+\];/,
  `export const CLIP_OVERLAYS_HIGH = [
  "bro is UNHINGED", "this is chaos", "no way he said that",
  "she just too innocent gng", "bro is wild for this", "she's done",
  "he snapped fr", "nah he's crazy", "this man is bold",
  "she can't handle it", "absolutely unhinged", "he said WHAT"
];`
);

// Fix PUSHBACK overlays — remove lines that sound too positive
ts = ts.replace(
  /export const CLIP_OVERLAYS_BEAT_PUSHBACK = \[[^\]]+\];/,
  `export const CLIP_OVERLAYS_BEAT_PUSHBACK = [
  "let him cook", "bold move gng", "she's not having it",
  "he's not backing down", "she tested him fr", "he didn't flinch",
  "she thought she won", "pressure test", "he held his ground",
  "watch him work", "she's tough gng", "not giving up"
];`
);

// Fix ESCALATION — remove shift-phase lines
ts = ts.replace(
  /export const CLIP_OVERLAYS_BEAT_ESCALATION = \[[^\]]+\];/,
  `export const CLIP_OVERLAYS_BEAT_ESCALATION = [
  "things getting real now", "he turned it up gng",
  "she can't ignore this", "bro is on one fr",
  "nah that's crazy", "he's not stopping", "the energy shifted",
  "she felt that one", "he cooked that", "getting closer",
  "the tension is real", "he's locked in rn"
];`
);

// Fix SHIFT — more accurate for the cracking moment
ts = ts.replace(
  /export const CLIP_OVERLAYS_BEAT_SHIFT = \[[^\]]+\];/,
  `export const CLIP_OVERLAYS_BEAT_SHIFT = [
  "wait for it", "she's cracking", "game just changed",
  "she's switching up now", "he got through to her",
  "the turn", "she actually felt that", "he flipped it on her",
  "something just changed", "she's fighting it but losing",
  "moment of truth gng", "she can't hold it"
];`
);

// Fix CLOSE — emoji-free
ts = ts.replace(
  /export const CLIP_OVERLAYS_BEAT_CLOSE = \[[^\]]+\];/,
  `export const CLIP_OVERLAYS_BEAT_CLOSE = [
  "she's done", "don't fumble this", "he's almost there",
  "she's folding", "finish strong gng", "so close",
  "he sealed it", "she gave in fr", "that's the bag",
  "mission complete gng", "he really did that", "locked in"
];`
);

fs.writeFileSync('remotion/src/constants.ts', ts);
console.log('Overlay text fixed: stage-accurate + emoji-free');
console.log('Commit and push.');
