const fs = require('fs');
let gen = fs.readFileSync('tools/generate.js', 'utf8');

// 1. Add require for clip-selector at top of file
if (!gen.includes('clip-selector')) {
  gen = gen.replace(
    'const { validateScript }',
    'const { selectClipsForConversation } = require("./lib/clip-selector");\nconst { validateScript }'
  );
  console.log('Added clip-selector require');
}

// 2. Add clipMetadata loading after inBetweenAssets
if (!gen.includes('clipMetadata') && !gen.includes('clipMetaPath')) {
  gen = gen.replace(
    'const inBetweenAssets = resolveMediaAssets(rootDir, "In between messages");',
    'const inBetweenAssets = resolveMediaAssets(rootDir, "In between messages");\n\n  let clipMetadata = null;\n  const clipMetaPath = path.join(rootDir, "clip_metadata.json");\n  if (fs.existsSync(clipMetaPath)) {\n    try { clipMetadata = JSON.parse(fs.readFileSync(clipMetaPath, "utf8")); console.log("[clips] Loaded metadata for " + clipMetadata.length + " clips"); } catch (e) {}\n  }'
  );
  console.log('Added clipMetadata loading');
}

// 3. Fix resolveMediaAssets fallback (check publicDir when no source)
if (!gen.includes('existingFiles = listAllMediaFiles(publicDir)')) {
  gen = gen.replace(
    'if (!sourceDir) return [];\n\n  if (sourceDir !== publicDir) {',
    'if (!sourceDir) {\n    if (fs.existsSync(publicDir)) { try { const existingFiles = listAllMediaFiles(publicDir); if (existingFiles.length) return existingFiles.map((file) => path.join(folderName, file)); } catch (_e) {} }\n    return [];\n  }\n\n  if (sourceDir !== publicDir) {'
  );
  console.log('Added resolveMediaAssets fallback');
}

console.log('\nIMPORTANT: You also need to wire clipMetadata into buildScript calls.');
console.log('Use Claude Code on your Mac to:');
console.log('1. Add clipMetadata to buildScript function params');
console.log('2. Pass clipMetadata when calling buildScript');
console.log('3. Use selectClipsForConversation in the in_between_assets assignment');
console.log('\nOr run this in Claude Code:');
console.log('"Wire the selectClipsForConversation function from tools/lib/clip-selector.js into generate.js. Load clip_metadata.json, pass it to buildScript, and use it for in_between_assets selection instead of random."');

fs.writeFileSync('tools/generate.js', gen);
console.log('\nDone. Commit and push.');
