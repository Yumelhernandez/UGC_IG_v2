const fs = require('fs');

// Fix ChatBubble.tsx — add Noto Color Emoji to font family
let cb = fs.readFileSync('remotion/src/components/ChatBubble.tsx', 'utf8');
if (!cb.includes('Noto Color Emoji')) {
  cb = cb.replace(
    '"Avenir Next", sans-serif',
    '"Avenir Next", "Noto Color Emoji", sans-serif'
  );
  fs.writeFileSync('remotion/src/components/ChatBubble.tsx', cb);
  console.log('ChatBubble.tsx: Noto Color Emoji added');
} else console.log('ChatBubble.tsx: already fixed');

// Fix ClipWithOverlay.tsx — add Noto Color Emoji to font family
let co = fs.readFileSync('remotion/src/components/ClipWithOverlay.tsx', 'utf8');
if (!co.includes('Noto Color Emoji')) {
  co = co.replace(
    'BlinkMacSystemFont, sans-serif',
    "BlinkMacSystemFont, 'Noto Color Emoji', sans-serif"
  );
  fs.writeFileSync('remotion/src/components/ClipWithOverlay.tsx', co);
  console.log('ClipWithOverlay.tsx: Noto Color Emoji added');
} else console.log('ClipWithOverlay.tsx: already fixed');

console.log('\nDone. Also run: sudo apt-get install -y fonts-noto-color-emoji');
console.log('Then: git add -A && git commit -m "fix: color emoji in video renders" && git push');
