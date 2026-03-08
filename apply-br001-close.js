const fs = require('fs');
const s = JSON.parse(fs.readFileSync('scripts/brainrot-br-001.json', 'utf8'));

// Add closing messages if missing
const lastMsg = s.messages[s.messages.length - 1];
if (!lastMsg.text.includes('555')) {
  s.messages.push(
    { from: 'boy', text: "so what's your number", type_at: 24.2 },
    { from: 'girl', text: "you're lucky you're funny \ud83d\ude2d 555 209 4718", type_at: 26.1 }
  );
  s.meta.duration_s = 28.5;
  s.beats.win_index = s.messages.length - 1;
  fs.writeFileSync('scripts/brainrot-br-001.json', JSON.stringify(s, null, 2) + '\n');
  console.log('br-001: Added number exchange close (11 msgs)');
} else {
  console.log('br-001: Already has number close');
}
