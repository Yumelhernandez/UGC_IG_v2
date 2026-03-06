#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

// Generate a unique color based on index
function getColor(index) {
  const colors = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8",
    "#F7B731", "#5F27CD", "#00D2D3", "#FF9FF3", "#54A0FF",
    "#48DBFB", "#FF6348", "#1DD1A1", "#FFC312", "#C4E538",
    "#EE5A6F", "#00D8D6", "#0652DD", "#9980FA", "#FDA7DF"
  ];
  return colors[index % colors.length];
}

function getCaption(index) {
  const captions = [
    "late night vibes", "golden hour", "sunset dreams", "city lights",
    "weekend mood", "beach day", "coffee break", "adventure time",
    "just chillin", "feeling cute", "night out", "good vibes only",
    "summer nights", "rooftop views", "ocean breeze", "mountain life",
    "brunch time", "road trip", "downtown", "stargazing"
  ];
  return captions[index % captions.length];
}

function adjustBrightness(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

function createSVG(color, caption, width = 1080, height = 1920) {
  const darkerColor = adjustBrightness(color, -30);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${darkerColor};stop-opacity:1" />
    </linearGradient>
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" />
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="discrete" tableValues="0 0.05"/>
      </feComponentTransfer>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#grad)"/>
  <rect width="${width}" height="${height}" filter="url(#noise)" opacity="0.15"/>
  <text x="${width / 2}" y="${height - 200}" font-family="Arial, sans-serif" font-size="56" font-weight="bold" fill="white" text-anchor="middle" opacity="0.25">${caption}</text>
</svg>`;
}

function main() {
  const rootDir = process.cwd();

  // Create baddies story images
  console.log("Creating baddies story images (SVG)...");
  const curatedDir = path.join(rootDir, "baddies");

  for (let i = 1; i <= 12; i++) {
    const filename = `story-${String(i).padStart(2, "0")}.svg`;
    const outputPath = path.join(curatedDir, filename);
    const color = getColor(i - 1);
    const caption = getCaption(i - 1);
    const svg = createSVG(color, caption);
    fs.writeFileSync(outputPath, svg, "utf8");
    console.log(`✓ Created ${filename}`);
  }

  console.log("\n✓ All placeholder images created!");
}

main();
