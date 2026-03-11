#!/usr/bin/env node
/**
 * enrich-manifest.js — Extract textable_detail + hook_angle from existing manifest descriptions
 * Adds textable_detail (the ONE thing a boy would reference) + hook_angle (category)
 */
const fs = require("fs");
const path = require("path");
const MANIFEST_PATH = path.join(__dirname, "..", "baddies", "manifest.json");

// Priority 1: Named locations (most textable — unique, memorable)
const NAMED_LOCATIONS = [
  /\b(Florence|Paris|Parisian|London|Dubai|Miami|Mykonos|Santorini|Bali|Tokyo|Rome|Barcelona|Ibiza|Cancun|Tulum|Los Cabos|Cabo|Hawaii|Maldives|New York|LA|Vegas|Amsterdam|Capri|Amalfi|Monaco|Saint-Tropez|St\.?\s?Tropez|Positano|Lake Como|Mexico|Italy|Greece|France|Spain|Thailand|Puerto Rico|Target|Trader Joe'?s|Whole Foods)\b/i,
  /\b(SUR Beach|Nobu|Soho House|Catch)\b/i,
];

// Priority 2: Items/props
const ITEM_PATTERNS = [
  { rx: /glass of (red wine|white wine|wine|water|champagne|rosé|whiskey|juice)/i, fmt: (m) => "that glass of " + m[1].trim() },
  { rx: /can of (\w+)/i, fmt: (m) => "that " + m[1] },
  { rx: /\b(coconut drink|fresh coconut drink)\b/i, fmt: () => "the coconut drink" },
  { rx: /\b(matcha|iced coffee|cocktail|red wine|champagne|espresso|smoothie|latte|margarita|mimosa|aperol)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(yoga mat|skateboard|surfboard|guitar|camera|book|books|stack of books)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(pizza|burger|sushi|tacos?|ice cream|donut|cake|ramen|fries|croissant)\b/i, fmt: (m) => "that " + m[1].toLowerCase() },
  { rx: /\b(Louis Vuitton|LV) bag\b/i, fmt: () => "the Louis Vuitton bag" },
  { rx: /\b(Chanel) bag\b/i, fmt: () => "the Chanel bag" },
  { rx: /\b(shopping bag|gift bag|paper bag)/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(mug|cup of (?:coffee|tea|cocoa))\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(suitcase|luggage)\b/i, fmt: () => "the suitcase" },
  { rx: /\btote bag\b.*?"([^"]+)"/i, fmt: (m) => 'the "' + m[1] + '" tote' },
  { rx: /\b(tote bag|canvas tote)\b/i, fmt: () => "the tote" },
  { rx: /\b(flower|rose|bouquet|flowers)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(MacBook|laptop|iPad)\b/i, fmt: (m) => "the " + m[1] },
  { rx: /\b(Stanley cup|Stanley)\b/i, fmt: () => "the Stanley cup" },
  { rx: /\b(teddy bear|plush bear|stuffed animal)\b/i, fmt: () => "the teddy bear" },
  { rx: /\b(iced drink|refreshing iced drink|orange drink|green drink)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(meal prep|bowl filled with|vibrant bowl)\b/i, fmt: () => "the meal prep" },
  { rx: /\b(Fendi|Prada|Dior|Gucci|Hermes|Hermès|Balenciaga|YSL|Celine|Céline|Valentino|Givenchy|Bottega)\b/i, fmt: (m) => "the " + m[1] + " bag" },
  { rx: /\bnext to (?:a |an )?(elephant|giraffe|horse|dolphin|parrot|tiger|lion)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(candle|lit candle|candles)\b/i, fmt: () => "the candle" },
  { rx: /\b(selfie|mirror selfie)\b/i, skip: true },
];

// Priority 3: Specific accessories
const ACCESSORY_PATTERNS = [
  { rx: /\b(statement chain|gold chain|silver chain|chain necklace|pendant|delicate necklace)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(gold bangles?|silver bangles?|bangles?)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(hoop earrings?|gold (?:hoop )?earrings?|diamond earrings?|statement earrings?|dangling earrings?)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(oversized (?:sun)?glasses|stylish sunglasses|aviators?|sunglasses)\b/i, fmt: () => "those sunglasses" },
  { rx: /\b(AirPods?|wireless headphones|headphones)\b/i, fmt: (m) => "the " + m[1] },
  { rx: /\b(sun hat|bucket hat|cap|beanie|fedora|cowboy hat|straw hat)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(quilted (?:hand)?bag|crossbody bag|designer bag|clutch|pink handbag|black handbag|stylish (?:pink |black |brown |white )?(?:hand)?bag|mini bag|shoulder bag)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(bold (?:red )?nails|red nails|acrylic nails|french tips|glossy nails)\b/i, fmt: () => "those nails" },
  { rx: /\b(strappy heels|stilettos|chunky (?:white )?sneakers|knee-high boots|combat boots|platform boots)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(gold necklace|layered necklace|choker|pearl necklace|silver necklace|dainty necklace)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(Rolex|watch)\b/i, fmt: (m) => "the " + m[1] },
  { rx: /\b(bracelet|anklet|belly chain|waist chain)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(fingerless (?:\w+ )?gloves|knitted gloves|gloves)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(keychain|small figure|charm)\b/i, fmt: () => "the keychain" },
  { rx: /\b(flower in her hair|hair flower|floral hair)\b/i, fmt: () => "the flower in her hair" },
  { rx: /\b(faux fur blanket|fur blanket|plush blanket)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(glossy lips|red lips|lipstick)\b/i, fmt: () => "the lips" },
  { rx: /\b(wireless earbuds?|earbuds?)\b/i, fmt: () => "the earbuds" },
  { rx: /\b(silver mini purse|mini purse|metallic (?:hand)?bag)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(pink fuzzy bag|fuzzy bag|furry bag)\b/i, fmt: () => "the fuzzy bag" },
  { rx: /\b(gym bag|duffle bag|duffel bag)\b/i, fmt: () => "the gym bag" },
  { rx: /\b(black handbag|small handbag|chic handbag|white handbag|beige bag|brown bag|stylish bag)\b/i, fmt: () => "the bag" },
  { rx: /\b(noticeable tattoo|tattoos?|ink)\b/i, fmt: () => "the tattoo" },
  { rx: /\b(long nails|nails)\b(?!.*polish)/i, fmt: () => "those nails" },
  { rx: /\b(braided hairstyle|braids?|box braids?|cornrows?)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(hair (?:in a )?(?:sleek |high )?(?:bun|ponytail))\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
];

// Priority 4: Vehicles/transport
const VEHICLE_PATTERNS = [
  { rx: /\b(jet ski)\b/i, fmt: () => "the jet ski" },
  { rx: /\b(Cybertruck|Tesla|BMW|Mercedes|Porsche|Lambo|Lamborghini|Ferrari|Range Rover|G-Wagon|Corvette|Jeep)\b/i, fmt: (m) => "the " + m[1] },
  { rx: /\b(boat|yacht)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /riding a bike|on a bike/i, fmt: () => "the bike" },
  { rx: /\bin (?:a |the )?(?:sleek |stylish )?car\b|driver's seat|passenger seat|back seat|back of a car/i, fmt: () => "the car" },
  { rx: /\b(airplane|plane|first class|airplane bathroom)\b/i, fmt: () => "the plane" },
  { rx: /\b(hammock)\b/i, fmt: () => "the hammock" },
];

// Priority 5: Standout clothing
const CLOTHING_PATTERNS = [
  { rx: /"([^"]{3,20})"\s*(?:T-shirt|tee|shirt|top|sweatshirt)/i, fmt: (m) => 'the "' + m[1] + '" shirt' },
  { rx: /\b(Victoria's Secret|VS|Calvin Klein)\b/i, fmt: (m) => "the " + m[1] + " fit" },
  { rx: /\b(leopard[- ]print|cheetah[- ]print|animal[- ]print)\b/i, fmt: () => "the leopard print" },
  { rx: /\b(crochet|crocheted)\b/i, fmt: () => "the crochet top" },
  { rx: /\b(leather jacket|bomber jacket|denim jacket)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(fur coat|trench coat|oversized coat)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(off-the-shoulder|off shoulder)\b/i, fmt: () => "that off-shoulder fit" },
  { rx: /\b(plaid|flannel|striped|checkered)\b.*?\b(shirt|top|pants|skirt|dress|blazer)\b/i, fmt: (m) => "the " + m[1].toLowerCase() + " " + m[2].toLowerCase() },
  { rx: /\b(graphic (?:tee|details|print))\b/i, fmt: () => "the graphic tee" },
  { rx: /\b(sequin|sparkle|sparkly|glitter)\b/i, fmt: () => "the sparkle fit" },
  { rx: /\b(star pattern|floral pattern|floral print)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(jumpsuit)\b/i, fmt: () => "the jumpsuit" },
  { rx: /\b(robe|hotel robe|white robe|plush robe)\b/i, fmt: () => "the robe" },
  { rx: /\b(lingerie|lace (?:top|bra|set))\b/i, fmt: () => "the lingerie" },
  { rx: /\b(bikini)\b/i, fmt: () => "the bikini" },
  { rx: /\b(corset|bustier)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(bodysuit)\b/i, fmt: () => "the bodysuit" },
  { rx: /\b(polka dot)\b/i, fmt: () => "the polka dots" },
  { rx: /\b(flowing|flowy)\b.*?\b(dress|skirt|gown)\b/i, fmt: (m) => "that " + m[2].toLowerCase() },
  { rx: /\b(mini dress|maxi dress|sundress|sun dress)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
];

// Priority 6: Settings
const SETTING_PATTERNS = [
  { rx: /\bat (?:a |an |the )?(?:stylish |chic |cozy |trendy |modern )?(gym|beach|pool(?:side)?|restaurant|cafe|bookstore|library|boutique|studio|salon|spa|bar|club|lounge|airport|zoo|gas station|convenience store|grocery store|outdoor (?:cafe|restaurant|bar)|lakeside (?:cafe|restaurant)|fitness studio)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\bon (?:a |the )?(?:sandy |tropical )?(beach|rooftop|balcony|terrace|patio|deck|reformer|reformer machine)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\bin (?:a |the )?(?:stylish |chic |cozy |modern |marble )?(bathroom|bedroom|kitchen|dressing room|fitting room|hotel room|living room|hallway|elevator|staircase|restroom|salon chair|parking lot|parking garage|gym|modern gym)\b/i, fmt: (m) => "the " + m[1].toLowerCase().replace("modern ", "") },
  { rx: /\b(marble bathroom)\b/i, fmt: () => "the marble bathroom" },
  { rx: /\bmirror (?:selfie|shot|pic)/i, fmt: () => "the mirror selfie" },
  { rx: /\b(country road|sunlit road|city street|lively street|cobblestone)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(lakeshore|lakeside|tropical pathway|beachside)\b/i, fmt: (m) => "the " + m[1].toLowerCase() },
  { rx: /\b(painting a wall|painting|ladder)\b/i, fmt: () => "the painting setup" },
  { rx: /\byoga (?:pose|mat|session|class)\b/i, fmt: () => "the yoga" },
  { rx: /\b(city lights|evening viewpoint|stunning (?:city )?view)\b/i, fmt: () => "that view" },
  { rx: /\bDisney(?:land|world)?\b/i, fmt: () => "Disneyland" },
];

// Priority 7: Color + clothing fallback (extract the most distinctive color item from hook)
function extractColorClothing(hook, details) {
  const text = hook + " " + details;
  // Match distinctive color + (optional adjective) + garment
  const colorItem = text.match(/\b(red|bright red|hot pink|neon|emerald|cobalt|mustard|lavender|burgundy|coral|teal|olive|rust|sage|maroon|crimson|turquoise|magenta|violet|navy|cream|nude|gold|silver|rose gold|shimmering|bright yellow|pale yellow|light green|light pink|light blue)\s+(?:\w+\s+)?(dress|top|skirt|pants|shorts|jacket|coat|set|bikini|bodysuit|jumpsuit|romper|sweater|hoodie|crop top|tank top|tube top|mini skirt|mini dress|leggings|cardigan|camisole|sports bra|halter dress|two-piece|bra)\b/i);
  if (colorItem) {
    return { textable_detail: "the " + colorItem[0].toLowerCase(), hook_angle: "clothing" };
  }
  // Try lighter colors with direct match (no adjective gap)
  const softColor = text.match(/\b(pink|blue|yellow|green|purple|orange|white)\s+(dress|bikini|set|jumpsuit|romper|sweater|coat|robe|lingerie|crop top|tube top|workout set|gym shorts|cropped sweater|cardigan|camisole|halter dress|sports bra)\b/i);
  if (softColor) {
    return { textable_detail: "the " + softColor[0].toLowerCase(), hook_angle: "clothing" };
  }
  return null;
}

// Filter out subtle/background items from details text
function filterSubtleDetails(details) {
  // Remove sentences describing non-prominent items
  return details
    .replace(/[^.]*\bresting on\b[^.]*/gi, "")
    .replace(/[^.]*\bon the table\b[^.]*/gi, "")
    .replace(/[^.]*\bin the background\b[^.]*/gi, "")
    .replace(/[^.]*\bbarely visible\b[^.]*/gi, "")
    .replace(/[^.]*\bsubtle\b[^.]*/gi, "")
    .replace(/[^.]*\bsmall\b[^.]*/gi, "")
    .replace(/[^.]*\btiny\b[^.]*/gi, "")
    .replace(/[^.]*\bNotable items include\b[^.]*/gi, ""); // AI vision boilerplate for secondary items
}

function runPatterns(text, { locations = true, items = true, accessories = true, vehicles = true, clothing = true, settings = true } = {}) {
  // Priority 1: Named locations
  if (locations) {
    for (const rx of NAMED_LOCATIONS) {
      const m = text.match(rx);
      if (m) return { textable_detail: m[1] || m[0], hook_angle: "location" };
    }
  }
  // Priority 2: Items/props
  if (items) {
    for (const pat of ITEM_PATTERNS) {
      if (pat.skip) continue;
      const m = text.match(pat.rx);
      if (m) {
        const detail = pat.fmt(m);
        if (detail.length >= 5 && detail.length <= 45) return { textable_detail: detail, hook_angle: "item" };
      }
    }
  }
  // Priority 3: Accessories
  if (accessories) {
    for (const pat of ACCESSORY_PATTERNS) {
      const m = text.match(pat.rx);
      if (m) return { textable_detail: pat.fmt(m), hook_angle: "accessory" };
    }
  }
  // Priority 4: Vehicles
  if (vehicles) {
    for (const pat of VEHICLE_PATTERNS) {
      const m = text.match(pat.rx);
      if (m) return { textable_detail: pat.fmt(m), hook_angle: "vehicle" };
    }
  }
  // Priority 5: Standout clothing
  if (clothing) {
    for (const pat of CLOTHING_PATTERNS) {
      const m = text.match(pat.rx);
      if (m) return { textable_detail: pat.fmt(m), hook_angle: "clothing" };
    }
  }
  // Priority 6: Settings
  if (settings) {
    for (const pat of SETTING_PATTERNS) {
      const m = text.match(pat.rx);
      if (m) return { textable_detail: pat.fmt(m), hook_angle: "setting" };
    }
  }
  return null;
}

function extractTextableDetail(details, hook) {
  // === PASS 1: HOOK ONLY (always visually prominent) ===
  const hookResult = runPatterns(hook);
  if (hookResult) return hookResult;

  // === PASS 2: HOOK color+clothing fallback ===
  const hookColor = extractColorClothing(hook, "");
  if (hookColor) return hookColor;

  // === PASS 3: FILTERED DETAILS (remove subtle/background items) ===
  const cleanDetails = filterSubtleDetails(details);
  const detailsResult = runPatterns(cleanDetails);
  if (detailsResult) return detailsResult;

  // === PASS 4: Color + clothing from both hook and details ===
  const colorResult = extractColorClothing(hook, details);
  if (colorResult) return colorResult;

  // Last resort: "the fit" (should be <5% of entries)
  return { textable_detail: "the fit", hook_angle: "clothing" };
}

// --- Main ---
const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
const manifest = JSON.parse(raw);
const stats = { location: 0, item: 0, accessory: 0, vehicle: 0, clothing: 0, setting: 0 };
let fallbackCount = 0;

manifest.forEach((entry) => {
  const result = extractTextableDetail(entry.details || "", entry.hook || "");
  entry.textable_detail = result.textable_detail;
  entry.hook_angle = result.hook_angle;
  stats[result.hook_angle] = (stats[result.hook_angle] || 0) + 1;
  if (result.textable_detail === "the fit") fallbackCount++;
});

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

console.log(`\nEnriched ${manifest.length} entries:`);
Object.entries(stats).forEach(([k, v]) => console.log(`  ${k}: ${v} (${(v / manifest.length * 100).toFixed(1)}%)`));
console.log(`  Generic fallbacks ("the fit"): ${fallbackCount} (${(fallbackCount / manifest.length * 100).toFixed(1)}%)`);
console.log(`\nManifest written to ${MANIFEST_PATH}`);

// Show 10 random samples for quick review
console.log("\n=== RANDOM SAMPLES ===");
const shuffled = [...manifest].sort(() => Math.random() - 0.5);
shuffled.slice(0, 10).forEach((e, i) => {
  console.log(`${i + 1}. "${e.textable_detail}" [${e.hook_angle}] ← ${(e.hook || "").substring(0, 55)}`);
});
