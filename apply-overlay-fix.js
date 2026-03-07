const fs = require('fs');

// Fix timing.ts — skip overlay text for clips that already have baked-in text
let ts = fs.readFileSync('remotion/src/utils/timing.ts', 'utf8');

// Fix 1: In-between clips
if (!ts.includes('clipHasBakedText')) {
  ts = ts.replace(
    '// ALWAYS add overlay text to in-between clips',
    '// Add overlay text to clean clips. Skip for clips with baked-in text (quote_card).'
  );
  ts = ts.replace(
    'const overlayText = pickMandatoryOverlayForShot({',
    'const clipHasBakedText = asset && (asset.includes("quote_card") || asset.includes("quote_reaction"));\n          const overlayText = clipHasBakedText ? undefined : pickMandatoryOverlayForShot({'
  );
  console.log('timing.ts: in-between clip overlay fix applied');
} else {
  console.log('timing.ts: already fixed');
}

fs.writeFileSync('remotion/src/utils/timing.ts', ts);
console.log('Done. Commit and push.');
