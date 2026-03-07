const fs=require('fs');

// 1. Fix all 10 hand-crafted script hooks (teaser, not spoiler)
const hookFixes={
  'brainrot-br-001.json':{headline:'Rarest shot of all time \ud83d\ude2d',subtitle:'*she wasn\'t ready*'},
  'brainrot-br-002.json':{headline:'He really said that to her \ud83d\udc80',subtitle:'*no fear*'},
  'brainrot-br-003.json':{headline:'This DM either works or I\'m blocked',subtitle:'*we are all in*'},
  'brainrot-br-004.json':{headline:'She pushed back HARD',subtitle:'*watch him recover*'},
  'brainrot-br-005.json':{headline:'NAH he\'s crazy for this one',subtitle:'*take notes*'},
  'brainrot-br-006.json':{headline:'Smoothest recovery of all time \ud83e\udd40',subtitle:'*pay attention*'},
  'brainrot-br-007.json':{headline:'She wasn\'t expecting this one \ud83d\ude2e\u200d\ud83d\udca8',subtitle:'*take notes*'},
  'brainrot-br-008.json':{headline:'Coldest opener I ever sent',subtitle:'*study this*'},
  'brainrot-br-009.json':{headline:'Left her with no choice \ud83d\ude2e\u200d\ud83d\udca8\ud83d\udd25',subtitle:'*rizz notes*'},
  'brainrot-br-010.json':{headline:'Bro is absolutely unhinged \ud83d\udc80',subtitle:'*she had no chance*'}
};
let fixed=0;
Object.entries(hookFixes).forEach(([file,hook])=>{
  const p='scripts/'+file;
  if(!fs.existsSync(p))return;
  const s=JSON.parse(fs.readFileSync(p,'utf8'));
  s.hook.headline=hook.headline;
  s.hook.subtitle=hook.subtitle;
  fs.writeFileSync(p,JSON.stringify(s,null,2)+'\n');
  fixed++;
});
console.log(fixed+' script hooks fixed');

// 2. Disable hookStrategy experiment in config
let cfg=JSON.parse(fs.readFileSync('config.json','utf8'));
if(cfg.experiments&&cfg.experiments.hookStrategy){
  cfg.experiments.hookStrategy={enabled:false};
  fs.writeFileSync('config.json',JSON.stringify(cfg,null,2)+'\n');
  console.log('Config: hookStrategy disabled');
}

console.log('\nDone. Now run:');
console.log('git add -A && git commit -m "fix: teaser hooks + hook metadata + config cleanup" && git push');
console.log('rm apply-all-mar7.js apply-hook-fixes.js 2>/dev/null; git add -A && git commit -m "chore: cleanup" && git push');
