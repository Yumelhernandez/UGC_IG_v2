// Run: node generate-clip-metadata.js
// Generates clip_metadata.json with descriptive info for all 206 clips
const fs = require('fs');
const path = require('path');

const dirs = ['remotion/public/In between messages', 'remotion/public/After 1 message'];
const metadata = [];

dirs.forEach(d => {
  if (!fs.existsSync(d)) return;
  fs.readdirSync(d).sort().forEach(f => {
    if (!/\.(mp4|gif)$/i.test(f)) return;
    const clipPath = d.replace('remotion/public/', '') + '/' + f;
    const lower = f.toLowerCase();
    
    let subject = 'unknown';
    if (lower.includes('lebron')) subject = 'LeBron James';
    else if (lower.includes('stephen_curry') || lower.includes('steph')) subject = 'Steph Curry';
    else if (lower.includes('michael_jordan')) subject = 'Michael Jordan';
    else if (lower.includes('kevin_durant')) subject = 'Kevin Durant';
    else if (lower.includes('damian_lillard')) subject = 'Damian Lillard';
    else if (lower.includes('anthony_edwards')) subject = 'Anthony Edwards';
    else if (lower.includes('scoot_henderson')) subject = 'Scoot Henderson';
    else if (lower.includes('turtle')) subject = 'turtle character';
    else if (lower.includes('basketball_player')) subject = 'NBA player';
    else if (lower.includes('person')) subject = 'person';
    
    let type = 'reaction';
    if (lower.includes('quote_card')) type = 'quote_card';
    else if (lower.includes('quote_reaction')) type = 'quote_reaction';
    else if (f.includes('GIF')) type = 'gif_reaction';
    
    const hasBakedText = type === 'quote_card' || type === 'quote_reaction';
    
    let energy = 'medium';
    if (['celebrate','wow','cracking','slam_dunk','winner','champion','cant_stop'].some(w => lower.includes(w))) energy = 'high';
    else if (['pray','crying','sad','cant_dream','drowning'].some(w => lower.includes(w))) energy = 'low';
    
    metadata.push({ path: clipPath, file: f, subject, type, has_baked_text: hasBakedText, energy, dir: d.includes('After') ? 'After 1 message' : 'In between messages' });
  });
});

fs.writeFileSync('clip_metadata.json', JSON.stringify(metadata, null, 2) + '\n');
console.log(metadata.length + ' clips cataloged in clip_metadata.json');
