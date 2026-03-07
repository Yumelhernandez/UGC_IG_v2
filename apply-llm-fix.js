// Run: node apply-llm-fix.js
const fs = require('fs');
let llm = fs.readFileSync('tools/lib/llm.js', 'utf8');

// FIX 4a: Add few-shot brainrot examples
if (!llm.includes('WHAT GOOD BRAINROT OUTPUT LOOKS LIKE')) {
  const anchor = 'The conversation should feel like two people who are actually funny and unfiltered';
  const idx = llm.indexOf(anchor);
  if (idx === -1) { console.log('ERROR: anchor not found'); process.exit(1); }
  const styleIdx = llm.indexOf('"Style:', idx);
  const insertPoint = llm.lastIndexOf('\n', styleIdx);
  const examples = [
    '  "CRITICAL \u2014 WHAT GOOD BRAINROT OUTPUT LOOKS LIKE:",',
    '  "Study these hand-crafted examples. YOUR output must match this energy, vocabulary, and line length.",',
    '  "",',
    '  "EXAMPLE 1 (number_exchange arc, confused girl):",',
    '  "boy reply: can I touch your hair?",',
    '  "girl: touch my WHAT \ud83d\udc80",',
    '  "boy: your hair it looks soft",',
    '  "girl: oh \ud83d\ude2d I thought you meant",',
    '  "boy: what did you think I meant \ud83d\udc40",',
    '  "girl: NOTHING forget it \ud83d\udc80\ud83d\udc80",',
    '  "boy: nah now I\'m curious",',
    '  "girl: bro move ON \ud83d\ude2d",',
    '  "boy: I would but you\'re in the way",',
    '  "girl: ok that was smooth I hate you \ud83d\ude2d",',
    '  "",',
    '  "EXAMPLE 2 (comedy arc, hostile girl):",',
    '  "boy reply: I\'m outside your window",',
    '  "girl: bro I\'m calling the cops \ud83d\udc80",',
    '  "boy: tell them to bring snacks I forgot mine",',
    '  "girl: you\'re actually a psychopath",',
    '  "boy: psychopath with great taste apparently",',
    '  "girl: tf does that even mean \ud83d\ude2d",',
    '  "boy: it means I chose your window specifically",',
    '  "girl: I live on the 8th floor HOW",',
    '  "boy: dedication",',
    '  "girl: I\'m scared AND impressed \ud83d\ude2d\ud83d\ude2d",',
    '  "",',
    '  "EXAMPLE 3 (plot_twist arc, hostile girl):",',
    '  "boy reply: I wanna put something inside you",',
    '  "girl: EXCUSE ME \ud83d\ude2d\ud83d\ude2d\ud83d\ude2d",',
    '  "boy: a smile",',
    '  "boy: what did you think I meant",',
    '  "girl: bro DON\'T play with me like that \ud83d\udc80",',
    '  "boy: I also want to put effort into you",',
    '  "girl: ok but the way you started that \ud83d\ude2d",',
    '  "boy: I like watching you panic",',
    '  "girl: you\'re actually terrible \ud83d\ude2d",',
    '  "boy: terrible enough to get saved in your phone?",',
    '  "girl: ...maybe \ud83d\ude2d",',
    '  "",',
    '  "KEY PATTERNS \u2014 your output MUST follow these:",',
    '  "- Lines are SHORT. 2-8 words. Never a full paragraph.",',
    '  "- Vocabulary is dead simple. No pseudo-intellectual words.",',
    '  "- Humor comes from LOGIC and TENSION, not fancy vocabulary.",',
    '  "- Double-entendre / misunderstanding is a proven formula.",',
    '  "- Girl emoji: \ud83d\udc80 for shock, \ud83d\ude2d for dying laughing.",',
    '  "- Boy lines are CONFIDENT and SHORT. One sentence max.",',
    '  "- Escalation is FAST. No filler messages.",',
    '  "- BANNED: pseudo-intellectual words, formal language, any word a 15yo wouldn\'t use.",',
    '  "",',
  ].join('\n') + '\n';
  llm = llm.slice(0, insertPoint) + '\n' + examples + llm.slice(insertPoint);
  console.log('FIX 4a: Few-shot examples added');
} else console.log('FIX 4a: already applied');

// FIX 4b: Vocabulary kill list
if (!llm.includes('VOCABULARY KILL LIST')) {
  const a2 = 'THE #1 MOST COMMON FAILURE';
  const i2 = llm.indexOf(a2);
  if (i2 === -1) { console.log('ERROR: anchor2 not found'); process.exit(1); }
  const ls = llm.lastIndexOf('\n', i2);
  const kl = [
    '  "===============================================================",',
    '  "VOCABULARY KILL LIST \u2014 these patterns ALWAYS produce bad output:",',
    '  "===============================================================",',
    '  "The audience is 15-22 year olds on TikTok. Every noun must pass:",',
    '  "  \'Would a 16yo know what this is without googling?\'",',
    '  "  If no \u2192 DO NOT USE IT.",',
    '  "",',
    '  "BANNED WORD PATTERNS:",',
    '  "  - \'[noun] prevention [noun]\' \u2192 gibberish",',
    '  "  - \'[noun] compliance [noun]\' \u2192 gibberish",',
    '  "  - \'[noun] coefficient\' \u2192 made-up metric",',
    '  "  - \'[noun] velocity\' \u2192 fake jargon",',
    '  "  - \'declination\' or \'recalibration\' \u2192 too formal",',
    '  "",',
    '  "GOOD NOUNS: parking spot, guest list, spare key, coffee order,",',
    '  "  gym membership, lunch break, library card, grocery list, phone number.",',
    '  "",',
    '  "BAD NOUNS: scent threshold, proximity schedule, alignment coefficient,",',
    '  "  reflection rate, camouflage report, onset warning, velocity index.",',
    '  "",',
  ].join('\n') + '\n';
  llm = llm.slice(0, ls + 1) + kl + llm.slice(ls + 1);
  console.log('FIX 4b: Vocabulary kill list added');
} else console.log('FIX 4b: already applied');

fs.writeFileSync('tools/lib/llm.js', llm);
console.log('\nAll done! Run:');
console.log('  git add -A && git commit -m "fix: LLM batch pipeline" && git push origin main');
