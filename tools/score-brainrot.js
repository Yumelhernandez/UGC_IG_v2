#!/usr/bin/env node
// Quick brainrot marker scorer for a batch directory
const fs = require("fs");
const path = require("path");

const dir = process.argv[2] || "scripts/2026-04-01";
const files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort();

const genZRx = /\b(lmao|lmfao|omg|tf|rn|bruh|ngl|imo|idk|wtf)\b|LMAO|LMFAO|\bNO\b|\bSTOP\b/;
const emojiRx = /\p{Extended_Pictographic}/gu;
const countE = t => (t.match(emojiRx) || []).length;

const results = [];
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const msgs = d.messages || [];
  const girlMsgs = msgs.filter(m => m.from === "girl");
  const boyMsgs  = msgs.filter(m => m.from === "boy");

  // M1: girl total emojis >= 3
  const girlEmojis = girlMsgs.reduce((a, m) => a + countE(m.text), 0);
  const m1 = girlEmojis >= 3;

  // M2: one of the 6 brainrot reveal patterns in boy messages
  // Patterns cover variant families, not just hardcoded anchor lines
  const revealPatterns = [
    /\d+%\s*(of|like|me|mine|yes|water|locked|left)|your (own )?cells|your body (said|clocked|answered|voted)|majority (rules|likes)|this is.*biology|3 out of 5/i, // numeric_reveal: % variants + unhinged structures
    /i got \d+ things|real quick.*\d+\.|things i need|\d+ requests/i,    // list_reveal: list opener variants
    /ruin your|filing.*complaint|noise complaint|only notification|being the person/i, // setup_reframe: alarming setup variants
    /told my mom|at \d.*work[s]?|cleared.*schedule|booked.*date|added (you|your)|already reserved/i, // presumptive_close variants
    /mid as in|as in.*my type|on the way to a 10|exactly where i want|as in.*what i (need|want)/i,  // roast_flip reframe variants
    /no is a.*(great|good) start|tell me more|here you are still|still typing|yet here you|if you weren.t curious/i  // persistence_flip variants
  ];
  const m2 = boyMsgs.some(m => revealPatterns.some(rx => rx.test(m.text)));

  // M3: girl has Gen Z slang
  const m3 = girlMsgs.some(m => genZRx.test(m.text));

  // M4: last girl close area has emoji
  const lastG = girlMsgs[girlMsgs.length - 1];
  const preLastG = girlMsgs[girlMsgs.length - 2];
  const m4 = !!(lastG && (countE(lastG.text) > 0 || (preLastG && countE(preLastG.text) > 0)));

  // M5: boy never retreats (no sorry/never mind in boy messages)
  const m5 = !boyMsgs.some(m => /\b(sorry|ok fine|okay fine|never mind)\b/i.test(m.text));

  const score = [m1, m2, m3, m4, m5].filter(Boolean).length;
  results.push({ f: f.replace("video-", "").replace(".json", ""), score, m1, m2, m3, m4, m5, girlEmojis, arc: d.meta && d.meta.arc_type, punchlineStyle: d.meta && d.meta.punchline_style });
}

console.log("File               | Score | M1(emj) | M2(rev) | M3(genZ) | M4(close) | M5(pers) | Arc/Style");
console.log("-".repeat(105));
for (const r of results) {
  const flags = [r.m1, r.m2, r.m3, r.m4, r.m5].map(v => v ? "✅" : "❌");
  const meta = (r.arc || "?") + "/" + (r.punchlineStyle || "?");
  console.log(`${r.f.padEnd(18)} | ${r.score}/5   | ${flags[0]}      | ${flags[1]}     | ${flags[2]}      | ${flags[3]}      | ${flags[4]}     | ${meta}`);
}

const passAll5  = results.filter(r => r.score === 5).length;
const pass4plus = results.filter(r => r.score >= 4).length;
const pass3plus = results.filter(r => r.score >= 3).length;
const m1fails   = results.filter(r => !r.m1).length;
const m2fails   = results.filter(r => !r.m2).length;
const m3fails   = results.filter(r => !r.m3).length;
const m4fails   = results.filter(r => !r.m4).length;
const m5fails   = results.filter(r => !r.m5).length;
console.log("");
console.log(`5/5:  ${passAll5}/${results.length} (${Math.round(passAll5 / results.length * 100)}%)`);
console.log(`4+/5: ${pass4plus}/${results.length} (${Math.round(pass4plus / results.length * 100)}%)`);
console.log(`3+/5: ${pass3plus}/${results.length} (${Math.round(pass3plus / results.length * 100)}%)`);
console.log(`\nPer-marker failures:`);
console.log(`  M1 emoji:    ${m1fails}/${results.length}`);
console.log(`  M2 reveal:   ${m2fails}/${results.length}`);
console.log(`  M3 genZ:     ${m3fails}/${results.length}`);
console.log(`  M4 close:    ${m4fails}/${results.length}`);
console.log(`  M5 persist:  ${m5fails}/${results.length}`);
