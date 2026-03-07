const fs = require('fs');

// Fix ClipWithOverlay.tsx — add hasBakedText prop + black bar
let co = fs.readFileSync('remotion/src/components/ClipWithOverlay.tsx', 'utf8');
if (!co.includes('hasBakedText')) {
  // Add prop
  co = co.replace(
    'fit?: "cover" | "contain";\n}> = ({ src, overlayText, fit = "cover" }) => {',
    'fit?: "cover" | "contain";\n  hasBakedText?: boolean;\n}> = ({ src, overlayText, fit = "cover", hasBakedText }) => {\n  const clipHasBakedText = hasBakedText || (src && (src.includes("quote_card") || src.includes("quote_reaction")));'
  );
  // Add black bar before overlay text
  co = co.replace(
    '{overlayText ? (',
    '{/* Black bar to cover baked-in text */}\n      {clipHasBakedText ? (\n        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "22%", background: "linear-gradient(180deg, #0b0d12 0%, #0b0d12 70%, rgba(11,13,18,0) 100%)", zIndex: 1 }} />\n      ) : null}\n      {overlayText ? ('
  );
  fs.writeFileSync('remotion/src/components/ClipWithOverlay.tsx', co);
  console.log('ClipWithOverlay.tsx: black bar + hasBakedText added');
} else console.log('ClipWithOverlay.tsx: already has hasBakedText');

// Fix timing.ts — always add overlay text (remove skip for quote_card)
let ts = fs.readFileSync('remotion/src/utils/timing.ts', 'utf8');
if (ts.includes('clipHasBakedText ? undefined')) {
  ts = ts.replace(
    /const clipHasBakedText[^;]+;\s*const overlayText = clipHasBakedText \? undefined : pickMandatoryOverlayForShot/,
    'const overlayText = pickMandatoryOverlayForShot'
  );
  ts = ts.replace(
    'Add overlay text to clean clips. Skip for clips that already have baked-in text (quote_card).',
    'ALWAYS add overlay text \u2014 ClipWithOverlay renders a black bar over baked-in text'
  );
  fs.writeFileSync('remotion/src/utils/timing.ts', ts);
  console.log('timing.ts: always add overlay (black bar handles baked text)');
} else console.log('timing.ts: already fixed');

console.log('Done.');
