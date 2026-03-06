const fs = require("fs");
const path = require("path");

function loadConfig(rootDir) {
  const configPath = path.join(rootDir, "config.json");
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function dateStamp(input) {
  if (input) return input;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function listAssets(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((file) => /\.(jpg|jpeg|png|svg)$/i.test(file))
    .map((file) => path.join(dirPath, file));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randBetween(rng, min, max) {
  return min + (max - min) * rng();
}

function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

function pickWeighted(rng, weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

function wrapText(text, maxChars) {
  const words = text.trim().split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current.length) {
      current = word;
      continue;
    }
    const next = `${current} ${word}`;
    if (next.length <= maxChars) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length) lines.push(current);
  return lines.join("\n");
}

function hashStringToSeed(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function rng() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRng(seedInput) {
  const seed = typeof seedInput === "number" ? seedInput : hashStringToSeed(seedInput);
  return mulberry32(seed);
}

module.exports = {
  clamp,
  createRng,
  dateStamp,
  ensureDir,
  listAssets,
  loadConfig,
  pick,
  pickWeighted,
  randBetween,
  wrapText,
};
