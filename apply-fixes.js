// Run: node apply-fixes.js
const fs = require('fs');

// FIX 1+2: Hook parser - filter markdown headers
const hookOld = '        .filter(Boolean)\n    )\n    .filter((lines) => lines.length > 0)';
const hookNew = hookOld.replace('.filter(Boolean)', '.filter(Boolean)\n        // Skip markdown headers and comments (lines starting with #)\n        .filter((line) => !line.startsWith("#"))');

let g = fs.readFileSync('tools/generate.js', 'utf8');
if (!g.includes('!line.startsWith')) {
  fs.writeFileSync('tools/generate.js', g.replace(hookOld, hookNew));
  console.log('FIX 1: generate.js patched');
} else console.log('FIX 1: already applied');

let q = fs.readFileSync('tools/lib/qa.js', 'utf8');
if (!q.includes('!line.startsWith')) {
  fs.writeFileSync('tools/lib/qa.js', q.replace(hookOld, hookNew));
  console.log('FIX 2: qa.js patched');
} else console.log('FIX 2: already applied');

// FIX 3: Remove vulgar clips
let c = JSON.parse(fs.readFileSync('clip_categories.json', 'utf8'));
const rm = new Set([
  'turtle_character_scene_reaction_she_gonna_peg_guys_meme_clip.mp4',
  'turtle_character_scene_reaction_im_getting_pegged_tonight_meme_clip.mp4',
  'Fuck Yeah Yes GIF by BCZalgirisKaunas.mp4',
  'person_quote_card_reaction_shit_im_human_meme_clip.mp4',
  'Sexy Teddy Bear GIF.mp4'
]);
function filterClips(o) {
  if (Array.isArray(o)) return o.filter(function(i) {
    var x = typeof i === 'string' ? i : (i && i.file || '');
    return !rm.has(x.split('/').pop());
  });
  if (o && typeof o === 'object') {
    var r = {};
    Object.entries(o).forEach(function(e) { r[e[0]] = filterClips(e[1]); });
    return r;
  }
  return o;
}
fs.writeFileSync('clip_categories.json', JSON.stringify(filterClips(c), null, 2) + '\n');
console.log('FIX 3: 5 vulgar clips removed');

console.log('\nFixes 1-3 done. Now run: node apply-llm-fix.js');
