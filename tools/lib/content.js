const storyCaptions = [
  "late night drive",
  "rooftop lights",
  "mirror check",
  "coffee run",
  "rainy walk",
  "city glow",
  "airport view",
  "gym mirror",
  "sunset skyline",
  "studio warmup",
  "weekend escape",
  "midnight snack"
];

const storyCaptionsByCategory = {
  selfie: [
    "no filter",
    "soft light",
    "quick selfie",
    "just me",
    "low key",
    "late scroll",
    "mirror light",
    "after hours",
    "quiet flex",
    "close up"
  ],
  mirror: [
    "mirror check",
    "fit check",
    "after hours mirror",
    "late mirror",
    "hallway mirror",
    "elevator mirror",
    "clean fit",
    "all black",
    "casual fit",
    "quick fit"
  ],
  travel: [
    "weekend escape",
    "sunset skyline",
    "airport view",
    "late night drive",
    "rooftop lights",
    "new city",
    "small getaway",
    "open road",
    "postcard view",
    "golden hour"
  ],
  nightlife: [
    "night out",
    "after hours",
    "city glow",
    "rooftop lights",
    "late plans",
    "no sleep",
    "dance floor",
    "neon lights",
    "midnight mood",
    "club night"
  ],
  food: [
    "coffee run",
    "midnight snack",
    "late brunch",
    "sweet tooth",
    "street bite",
    "late plate",
    "breakfast mode",
    "dessert run",
    "quick bite",
    "food mood"
  ],
  fitness: [
    "gym mirror",
    "studio warmup",
    "leg day",
    "post workout",
    "early lift",
    "sweat check",
    "strong day",
    "training mode",
    "weight room",
    "gym flow"
  ],
  beach: [
    "beach day",
    "salt air",
    "ocean mood",
    "sunset swim",
    "coast time",
    "shoreline",
    "waves today",
    "sun glow",
    "sand day",
    "sea breeze"
  ],
  casual: [
    "rainy walk",
    "slow morning",
    "lazy sunday",
    "coffee run",
    "soft day",
    "quiet day",
    "casual day",
    "home mood",
    "day off",
    "low key"
  ]
};

const storyCategoryLabels = {
  selfie: "selfie",
  mirror: "mirror shot",
  travel: "trip",
  nightlife: "night out",
  food: "food pic",
  fitness: "gym shot",
  beach: "beach shot",
  casual: "chill day"
};

const boyPersonas = [
  { name: "Jake", age: 20, tone: "playful" },
  { name: "Ryan", age: 22, tone: "confident" },
  { name: "Eli", age: 19, tone: "shy-funny" },
  { name: "Marcus", age: 23, tone: "smooth" },
  { name: "Noah", age: 21, tone: "awkward-charming" }
];

const girlPersonas = [
  // confused archetype — doesn't get his angle at first (40% of competitor videos)
  { name: "Maya", age: 21, tone: "confused" },
  { name: "Ava", age: 20, tone: "confused" },
  { name: "Sienna", age: 19, tone: "confused" },
  { name: "Nyla", age: 21, tone: "confused" },
  { name: "Priya", age: 20, tone: "confused" },
  { name: "Aaliyah", age: 21, tone: "confused" },
  // hostile archetype — mean from the start, boy must crack her (25%)
  { name: "Zara", age: 20, tone: "hostile" },
  { name: "Raven", age: 21, tone: "hostile" },
  { name: "Jade", age: 19, tone: "hostile" },
  { name: "Iris", age: 22, tone: "hostile" },
  { name: "Naomi", age: 20, tone: "hostile" },
  // warm archetype — into it from message 1 (15%)
  { name: "Leah", age: 21, tone: "warm" },
  { name: "Luna", age: 20, tone: "warm" },
  { name: "Eva", age: 19, tone: "warm" },
  // matching_energy archetype — just as witty, trades barbs (10%)
  { name: "Chloe", age: 22, tone: "matching_energy" },
  { name: "Bella", age: 20, tone: "matching_energy" },
  // playing_hard_to_get — interested but pretends not to be (10%)
  { name: "Destiny", age: 21, tone: "playing_hard_to_get" },
  { name: "Sofia", age: 20, tone: "playing_hard_to_get" },
  { name: "Mia", age: 19, tone: "playing_hard_to_get" },
  // Additional names for variety
  { name: "Amara", age: 20, tone: "hostile" },
  { name: "Jasmine", age: 21, tone: "confused" },
  { name: "Kai", age: 19, tone: "warm" },
  { name: "Naya", age: 20, tone: "matching_energy" },
  { name: "Zoe", age: 20, tone: "playing_hard_to_get" },
  { name: "Aria", age: 21, tone: "hostile" },
  { name: "Layla", age: 19, tone: "confused" },
];

module.exports = {
  boyPersonas,
  girlPersonas,
  storyCaptions,
  storyCaptionsByCategory,
  storyCategoryLabels
};
