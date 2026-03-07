// Run: node apply-round10-fixes.js
// Then: git add -A && git commit -m 'fix: punchline timing, tension pacing, image refs, opener length' && git push
// Then: rm apply-round10-fixes.js apply-round5-fixes.js 2>/dev/null; git add -A && git commit -m 'chore: cleanup' && git push
const fs = require('fs');

// === CONFIG FIXES ===
let cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
if (cfg.format_b_duration_mix && cfg.format_b_duration_mix.short) {
  cfg.format_b_duration_mix.short.num_messages = { min: 8, max: 10 };
}
if (cfg.banter) {
  cfg.banter.num_messages = 8;
  cfg.banter.num_messages_min = 7;
  cfg.banter.num_messages_max = 10;
}
fs.writeFileSync('config.json', JSON.stringify(cfg, null, 2) + '\n');
console.log('1. Config: min 8 messages for short format');

// === LLM.JS FIXES ===
let llm = fs.readFileSync('tools/lib/llm.js', 'utf8');

// Fix: Tension pacing
if (llm.includes('must NOT crack before message 5')) {
  llm = llm.replace('must NOT crack before message 5', 'must NOT crack before message 6');
}
if (!llm.includes('PUNCHLINE TIMING')) {
  const anchor = 'The BEST conversations have the girl fighting';
  const idx = llm.indexOf(anchor);
  if (idx > -1) {
    const ins = llm.lastIndexOf('\n', idx);
    llm = llm.slice(0, ins) + '\n' +
      '  "PUNCHLINE TIMING \u2014 DO NOT DROP THE BEST LINE EARLY:",\n' +
      '  "The boy\'s BEST material must come at 60-80% through.",\n' +
      '  "Messages 1-4: lighter banter. Messages 5-7: boy escalates. Messages 7+: PUNCHLINE.",\n' +
      '  "BAD: message 2 = \'i got 3 things\' (too early). GOOD: message 6 = the reveal.",\n' +
      '  "",\n' +
      llm.slice(ins);
    console.log('2. LLM: punchline timing rules added');
  }
}
if (llm.includes("'lmao ok that was smooth' before message 5")) {
  llm = llm.replace(
    "'lmao ok that was smooth' before message 5",
    "'smooth', 'cute', or ANY acceptance language before message 6"
  );
}

// Fix: list_reveal outline
if (llm.includes('VERY FIRST BANTER LINE')) {
  llm = llm.replace(
    /RULE: The list_reveal is the BOY'S VERY FIRST BANTER LINE[^"]+/,
    "RULE: The list_reveal comes AFTER 2-3 rounds of banter, NOT as the first boy line."
  );
  console.log('3. LLM: list_reveal timing fixed in outline');
}
if (llm.includes('OVERRIDE for list_reveal')) {
  llm = llm.replace(
    /OVERRIDE for list_reveal[^"]+/,
    "For list_reveal: The boy builds tension with lighter banter FIRST, THEN drops the list."
  );
  console.log('4. LLM: list_reveal override removed');
}

// Fix: Format D image references
if (!llm.includes('IMAGE REFERENCE RULE')) {
  const dAnchor = 'Do not describe precise body poses or anatomy.';
  if (llm.includes(dAnchor)) {
    llm = llm.replace(dAnchor, dAnchor + '\n    lines.push("IMAGE REFERENCE RULE: Never list clothing like a catalog. Pick ONE detail and build a joke around it.");');
    console.log('5. LLM: image reference rule added');
  }
}

// Fix: Opener length
if (!llm.includes('MAXIMUM 10 words')) {
  const styleAnchor = '"- Short chat style: one text bubble';
  if (llm.includes(styleAnchor)) {
    llm = llm.replace(styleAnchor, styleAnchor + ',\n  "- MAXIMUM 10 words. Shorter = better. Best openers are 4-8 words."');
    console.log('6. LLM: opener max 10 words');
  }
}

fs.writeFileSync('tools/lib/llm.js', llm);

// === GENERATE.JS FIX ===
let gen = fs.readFileSync('tools/generate.js', 'utf8');

// Fix: list_reveal post-processing inserts at 60% not first boy msg
if (gen.includes('const _firstBoyIdx = resolvedMessages.findIndex')) {
  gen = gen.replace(
    /const _firstBoyIdx = resolvedMessages\.findIndex\([^)]+\);\s*if \(_firstBoyIdx > 0\)/,
    'const _boyIdxs = resolvedMessages.map((m, i) => (m.from === "boy" ? i : -1)).filter((i) => i >= 0);\n          const _targetBoyIdx = _boyIdxs.length >= 3 ? _boyIdxs[Math.floor(_boyIdxs.length * 0.6)] : _boyIdxs[_boyIdxs.length - 1] || 1;\n          if (_targetBoyIdx > 0)'
  );
  gen = gen.replace(
    /resolvedMessages\[_firstBoyIdx\]/g,
    'resolvedMessages[_targetBoyIdx]'
  );
  gen = gen.replace(
    /\+ 1 < resolvedMessages\.length && resolvedMessages\[_firstBoyIdx/,
    '+ 1 < resolvedMessages.length && resolvedMessages[_targetBoyIdx'
  );
  console.log('7. Generate: list_reveal placed at 60% not first boy msg');
} else if (gen.includes('_targetBoyIdx')) {
  console.log('7. Generate: already fixed');
}

fs.writeFileSync('tools/generate.js', gen);
console.log('\nAll fixes applied! Commit and push.');
