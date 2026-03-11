const fs = require('fs');
const path = require('path');
const dir = process.argv[2] || 'scripts/2026-03-10';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
for (const f of files) {
  const s = require(path.resolve(dir, f));
  const m = s.messages || [];
  const total = m.length;
  const hook = (s.hook && s.hook.headline) || (s.meta && s.meta.beat_plan && s.meta.beat_plan.hook) || '?';
  console.log(`=== ${f} ===`);
  console.log(`  Arc: ${s.meta.arc_type} | Punchline: ${s.meta.punchline_style || 'none'} | Msgs: ${total} | Duration: ${s.meta.duration_s}s`);
  console.log(`  Hook: "${hook}"`);
  m.forEach((msg, i) => {
    const pct = Math.round((i + 1) / total * 100);
    console.log(`  ${i+1}/${total} (${pct}%) [${msg.from}] ${msg.text}`);
  });
  console.log();
}
