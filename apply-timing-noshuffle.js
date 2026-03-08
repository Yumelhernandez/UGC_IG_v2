const fs = require('fs');
let ts = fs.readFileSync('remotion/src/utils/timing.ts', 'utf8');
if (ts.includes('if (assets.length >= count) shuffleInPlace(assets, rng)')) {
  ts = ts.replace(
    'if (assets.length >= count) shuffleInPlace(assets, rng);',
    '// Don\'t shuffle \u2014 clips are pre-ordered by conversation-aware selection in generate.js'
  );
  fs.writeFileSync('remotion/src/utils/timing.ts', ts);
  console.log('timing.ts: clip shuffle disabled (preserves smart ordering)');
} else {
  console.log('timing.ts: already fixed or pattern not found');
}
