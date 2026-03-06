#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FONTS_DIR = path.join(__dirname, 'public', 'fonts');
const REQUIRED_FONTS = [
  'SF-Pro-Text-Regular.otf',
  'SF-Pro-Text-Medium.otf',
  'SF-Pro-Text-Semibold.otf',
  'SF-Pro-Display-Regular.otf',
  'SF-Pro-Display-Medium.otf',
  'SF-Pro-Display-Semibold.otf'
];

console.log('🔍 Checking SF Pro font installation...\n');

if (!fs.existsSync(FONTS_DIR)) {
  console.error('❌ Fonts directory not found:', FONTS_DIR);
  console.log('\n📝 Create it with: mkdir -p', FONTS_DIR);
  process.exit(1);
}

const installedFonts = fs.readdirSync(FONTS_DIR)
  .filter(file => file.endsWith('.otf') || file.endsWith('.ttf'));

console.log('📁 Fonts directory:', FONTS_DIR);
console.log('📄 Found font files:', installedFonts.length, '\n');

let allFound = true;
REQUIRED_FONTS.forEach(font => {
  const exists = installedFonts.includes(font);
  const altExists = installedFonts.includes(font.replace('.otf', '.ttf'));

  if (exists || altExists) {
    console.log('✅', font);
  } else {
    console.log('❌', font, '- MISSING');
    allFound = false;
  }
});

console.log('\n');

if (allFound) {
  console.log('🎉 All SF Pro fonts are installed!');
  console.log('✨ Your Instagram messages will render with authentic SF Pro typography.\n');
} else {
  console.log('⚠️  Some fonts are missing.');
  console.log('\n📖 Follow the setup guide:');
  console.log('   cat ../FONT_SETUP.md');
  console.log('\n🔗 Download SF Pro from:');
  console.log('   https://developer.apple.com/fonts/\n');
  process.exit(1);
}

// Show installed fonts
if (installedFonts.length > 0) {
  console.log('📋 All installed fonts:');
  installedFonts.forEach(font => {
    const filePath = path.join(FONTS_DIR, font);
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(1);
    console.log(`   ${font} (${sizeKB} KB)`);
  });
  console.log('');
}
