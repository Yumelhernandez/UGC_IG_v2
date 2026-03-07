// Run: node apply-round5-fixes.js
// Then: git add -A && git commit -m 'fix: punchline timing + tension pacing + min 8 messages' && git push
// Then: rm apply-round5-fixes.js && git add -A && git commit -m 'chore: remove script' && git push
const fs = require('fs');

// FIX 1: Config — raise min messages for short format B from 5 to 8
let cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
if (cfg.format_b_duration_mix && cfg.format_b_duration_mix.short) {
  cfg.format_b_duration_mix.short.num_messages = { min: 8, max: 10 };
  console.log('Config: short format min messages = 8');
}
if (cfg.banter) {
  cfg.banter.num_messages = 8;
  cfg.banter.num_messages_min = 7;
  cfg.banter.num_messages_max = 10;
  console.log('Config: banter messages = 7-10');
}
fs.writeFileSync('config.json', JSON.stringify(cfg, null, 2) + '\n');

// FIX 2: LLM prompt — add punchline timing rules
let llm = fs.readFileSync('tools/lib/llm.js', 'utf8');
const oldTension = 'The girl must NOT crack before message 5.';
const newTension = 'The girl must NOT crack before message 6.';
if (llm.includes(oldTension)) {
  llm = llm.replace(oldTension, newTension);
  console.log('LLM: crack threshold raised to message 6');
}
if (!llm.includes('PUNCHLINE TIMING')) {
  const anchor = 'The BEST conversations have the girl fighting';
  const idx = llm.indexOf(anchor);
  if (idx > -1) {
    const insertAt = llm.lastIndexOf('\n', idx);
    const block = [
      '  "PUNCHLINE TIMING \u2014 DO NOT DROP THE BEST LINE EARLY:",',
      '  "The boy\'s BEST material (numbered reveals, smooth pivots) must come at 60-80% through.",',
      '  "Messages 1-4: lighter banter. Boy teases, girl pushes back. He\'s WARMING UP.",',
      '  "Messages 5-7: boy escalates. His wit gets sharper. Girl starts losing but won\'t admit it.",',
      '  "Messages 7+: the PUNCHLINE lands. Numbered reveal, smooth closer, killer line goes here.",',
      '  "BAD: message 2 = \'i got 3 things for you\' (too early, nothing left to build to)",',
      '  "GOOD: message 2 = lighter tease. message 6 = the numbered reveal. Girl fights 2 more rounds.",',
      '  "Think of it like a comedian: you don\'t open with your BEST joke. You build to it.",',
      '  "",',
    ].join('\n') + '\n';
    llm = llm.slice(0, insertAt) + '\n' + block + llm.slice(insertAt);
    console.log('LLM: punchline timing rules added');
  }
}
const oldCrack = "If the girl says 'lmao ok that was smooth' before message 5";
const newCrack = "If the girl says 'smooth', 'cute', 'ok that was good', or ANY acceptance language before message 6";
if (llm.includes(oldCrack)) {
  llm = llm.replace(oldCrack, newCrack);
  console.log('LLM: acceptance language ban strengthened');
}
if (!llm.includes('Early girl lines (messages 1-5)')) {
  const patternAnchor = 'Pattern: messages 1-2 = hostile';
  if (llm.includes(patternAnchor)) {
    llm = llm.replace(patternAnchor, 
      'Early girl lines (messages 1-5) can ONLY be: shock, confusion, dismissal, insults, or testing. NEVER acceptance.",\n  "' + patternAnchor.replace('Pattern: m', 'M'));
    console.log('LLM: early-message acceptance ban added');
  }
}
fs.writeFileSync('tools/lib/llm.js', llm);
console.log('\nDone! Commit and push.');
