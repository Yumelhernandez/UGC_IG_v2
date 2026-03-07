const fs=require('fs'),re=require;

// Emoji strip helper
const emojiRe=/[\ud83c-\udbff\udc00-\udfff\u2702-\u27b0\ufe00-\ufe0f\u200d]+/gu;
function strip(s){return s.replace(emojiRe,'').trim()}

// 1. Fix hand-crafted script hooks (teaser, no spoiler, no emoji)
const hookFixes={
  'brainrot-br-001.json':{headline:'Rarest shot of all time',subtitle:'*she wasn\'t ready*'},
  'brainrot-br-002.json':{headline:'He really said that to her',subtitle:'*no fear*'},
  'brainrot-br-003.json':{headline:'This DM either works or I\'m blocked',subtitle:'*we are all in*'},
  'brainrot-br-004.json':{headline:'She pushed back HARD',subtitle:'*watch him recover*'},
  'brainrot-br-005.json':{headline:'NAH he\'s crazy for this one',subtitle:'*take notes*'},
  'brainrot-br-006.json':{headline:'Smoothest recovery of all time',subtitle:'*pay attention*'},
  'brainrot-br-007.json':{headline:'She wasn\'t expecting this one',subtitle:'*take notes*'},
  'brainrot-br-008.json':{headline:'Coldest opener I ever sent',subtitle:'*study this*'},
  'brainrot-br-009.json':{headline:'Left her with no choice',subtitle:'*rizz notes*'},
  'brainrot-br-010.json':{headline:'Bro is absolutely unhinged',subtitle:'*she had no chance*'}
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
console.log(fixed+' script hooks fixed (emoji-free)');

// 2. Strip emojis from hook_lines.md headlines
if(fs.existsSync('hook_lines.md')){
  let md=fs.readFileSync('hook_lines.md','utf8');
  md=md.replace(emojiRe,'');
  fs.writeFileSync('hook_lines.md',md);
  console.log('hook_lines.md: emojis stripped');
}

// 3. Disable hookStrategy in config
let cfg=JSON.parse(fs.readFileSync('config.json','utf8'));
if(cfg.experiments&&cfg.experiments.hookStrategy){
  cfg.experiments.hookStrategy={enabled:false};
  fs.writeFileSync('config.json',JSON.stringify(cfg,null,2)+'\n');
  console.log('Config: hookStrategy disabled');
}

console.log('\nDone. Commit and push.');
