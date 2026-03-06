# PRD: Brainrot Arc — TikTok DM Script Mode
**Version:** 1.2
**Status:** Ready for implementation
**Codebase:** `UGC_Two_IG`
**Scope:** New `brainrot` arc type — two sub-variants (random, contextual)

---

## 1. Overview

### 1.1 What This Is
A new `arc_type: "brainrot"` that generates a completely different style of DM script. Instead of the existing flirty banter arc (cold girl → curious → date close), brainrot scripts simulate an unhinged institutional-chaos text conversation where both characters are equally unhinged and have found each other. The style is viral TikTok DM content — too specific, too irrational, and too real to be fake.

### 1.2 Two Sub-Variants
| Flag | Name | Boy's Opening Line |
|------|------|--------------------|
| `brainrot_random` | Random | LLM invents a fresh unhinged institutional premise from scratch — no image context |
| `brainrot_contextual` | Contextual | LLM reads the actual story image + caption (via vision API) and generates an unhinged opener that is *specifically* about what she posted |

Both sub-variants produce the same 6-line output format. The only difference is how the boy's `reply` line (the opener) is generated.

### 1.3 What Does NOT Change
- The existing `generate.js`, `qa.js`, `render.js`, and `batch.js` pipelines run unchanged for all other arc types.
- The existing JSON script schema is preserved — brainrot outputs are valid `video.schema.json` instances.
- The existing LLM infrastructure (`callLlm`, `parseBanterMessages`, etc.) is reused.
- Remotion rendering works without modification — the chat bubble UI already handles `boy`/`girl` messages.

### 1.4 `addImperfection()` — Explicitly Skipped for Brainrot

**Do not call `addImperfection()` on any brainrot message.** The existing pipeline calls it on banter messages to add stochastic human texture (random lowercase, dropped punctuation, contractions). Brainrot already contains exactly one intentional typo, placed deliberately per Rule 16. `addImperfection()` on top of that risks:
- Producing a second typo, breaking Rule 16's "exactly one" constraint
- Mutating the intentional typo into something unrecognizable
- Removing capitalization that the LLM placed deliberately for emphasis (Rule 16 allows ONE caps word per line)

In `generateBrainrotScript`, after parsing candidates, do **not** pass messages through `addImperfection()`. Add an inline comment: `// brainrot: intentional typo already embedded by LLM per Rule 16 — do not addImperfection()`

---

## 2. The Brainrot Format (Source of Truth)

Every brainrot script has exactly **6 lines** in a fixed speaker structure:

```
reply  → BOY   — opens with impossible institutional premise
msg1   → GIRL  — does NOT react with shock; drops a detail that makes YOU question HER
msg2   → BOY   — self-own; he adds the detail that makes it worse; has the intentional typo
msg3   → GIRL  — involuntary disruption cue (one of: "be fr" / "hello??" / "pause" / "under oath?" / "what??" / "cap" / "say less")
msg4   → BOY   — brand new chaos element dropped; unrelated to msg3; also a candidate for typo
msg5   → GIRL  — quiet matter-of-fact recontextualization; she was running a longer game the whole time
```

**Character dynamics:**
- BOY: calm, proud, oblivious. Thinks this is a completely normal conversation. Not trying to impress. Shares information. Has no idea.
- GIRL: was already unhinged before he messaged. msg1 reveals her own chaos. msg3 is involuntary. msg5 is a revelation that reframes everything.

**The twist:** Both of them are unhinged. They just found each other.

---

## 3. The 16 Rules (LLM Must Follow)

These rules are embedded verbatim in `BRAINROT_SYSTEM_PROMPT`. They are reproduced here for the implementer to verify prompt completeness.

**RULE 1 — IRRATIONAL STAKES:** Scenario must feel world-ending even if objectively microscopic. Small thing + massive formal response = the joke. (HR complaint about eye contact, legal paperwork to be a dog's godfather, noise complaint about a playlist being emotionally dangerous.)

**RULE 2 — NUMBER SPECIFICITY:** Never use round numbers. The number IS the joke. Use odd numbers and weird decimals ("47 days", "4.7 seconds", "9 neighbors").

**RULE 3 — DISRUPTION CUE MATCHING:** msg3 must be the involuntary noise the reader makes after reading msg2. Match to THAT specific line:
- Something proudly insane → `"be fr"`
- Something physically impossible → `"hello??"`
- Something needing processing time → `"pause"`
- Something being challenged/doubted → `"under oath?"`
- Something you can't believe was said → `"what??"`
- Something that seems made up → `"cap"`
- Something that reframes everything → `"say less"`

**RULE 4 — msg4 NEW ELEMENT LAW:** msg4 must introduce a BRAND NEW insane detail not mentioned anywhere before. It cannot logically follow from msg3. It drops new chaos. If msg4 makes logical sense as a response to msg3 → it fails.

**RULE 5 — msg5 RECONTEXTUALIZATION:** msg5 must make the reader re-read the entire script with new eyes. The girl reveals she has been operating in a completely different reality the whole time. Bad msg5 = a punchline. Good msg5 = a revelation that reframes everything.

**RULE 6 — ACCIDENTALLY UNHINGED:** Every line must sound like the character has NO IDEA how insane they sound. Calm, proud, matter-of-fact, zero self-awareness.

**RULE 7 — SPECIFICITY OVERLOAD:** Every noun must be the most specific version of itself. ("apt 4B" not "your apartment", "conference room B" not "at work", "mochi" not "your dog", "a 9 paragraph recommendation" not "a recommendation".)

**RULE 8 — SELF-OWN:** At least one line per script must accidentally reveal something insane about the sender. They must be proud of it or completely not notice.

**RULE 9 — INSTITUTIONAL ABSURDITY:** Drag formal systems into personal/romantic drama. Use: notary, HR department, LinkedIn endorsements, county filing, legal paperwork, binding in X states, wellness check, conference room booking, formal complaint, petition, emergency contact, approved list, recurring meeting, shared case handler.

**RULE 10 — EMOTIONAL ARC:** Every script moves through:
- reply → impossible premise
- msg1 → girl confirms it but reveals her own chaos
- msg2 → boy adds detail that makes it worse (self-own)
- msg3 → girl's involuntary disruption noise
- msg4 → boy drops brand new chaos
- msg5 → girl's quiet recontextualization

**RULE 11 — FORBIDDEN MOVES:** Never use "spreadsheet" as the absurd element. Never use "EXCUSE ME" as standalone disruption. Never make msg4 logically follow from msg3. Never use round numbers. Never use vague location words (apartment, office, outside, somewhere, nearby). Never have any character who seems aware they are being unhinged.

**RULE 12 — COMMENT-BAIT TEST:** Before finalizing, ask: would someone screenshot msg5 and send it to their group chat? If no → rewrite msg5. The best msg5s make the reader feel like THEY missed something obvious.

**RULE 13 — GIRL'S msg1 ADDS CHAOS, NEVER ASKS:** Girl's first response drops a detail that makes the viewer question HER. She does not investigate. She reveals. She does not react with shock. She must reveal she was operating in her own parallel unhinged system before he even messaged her.

**RULE 14 — ONE WRONG CONTEXT LINE PER SCRIPT:** One line per script must feel dropped in from a completely different conversation. No setup. No explanation. Stated as fact.

**RULE 15 — BOY IS OBLIVIOUS, NOT SMOOTH:** Boy is not trying to impress. He is sharing information he considers completely normal. He thinks this is a reasonable conversation. He has no idea. The comedy lives entirely in his obliviousness.

**RULE 16 — ONE INTENTIONAL TYPO PER SCRIPT:** Every script gets exactly one typo that feels typed in 0.4 seconds without looking.
- Placement: NEVER on reply, msg3, or msg5. Best on msg2 or msg4.
- Type: One letter transposed or dropped. Never a whole word wrong. Character does not correct it.
- Boy in logistics mode → transpose letters: `"watdh"` not `"watch"`
- Boy dropping insane info calm → drop a letter: `"emegency"` not `"emergency"`
- Girl revealing she was first → skip a letter: `"handing"` not `"handling"`

---

## 4. Calibration Examples (Include These in the Prompt)

### Example 1 — HR / Cologne
```
boy reply: HR reached out about my perfume complaint
girl msg1: i filed one about your cologne in march
boy msg2: deborah in HR is handing both of ours
girl msg3: be fr
boy msg4: deborah moved us to thursdays
girl msg5: deborah said we're her most interesting case
```
- Typo: `"handing"` (msg2) instead of "handling"
- Rule 13: girl filed one first, in march, before he started his complaint
- Rule 14: "deborah moved us to thursdays" — there is a recurring meeting. it has been rescheduled.

### Example 2 — Coffee Order
```
boy reply: your oat milk latte has been ready at 8 since october
girl msg1: i switched you to almond in september
boy msg2: the barista knows your name now
girl msg3: pause
boy msg4: text me when you leave i told jessica to watdh for your car
girl msg5: jessica already knows my order
```
- Typo: `"watdh"` (msg4) instead of "watch"
- Rule 13: she switched his order a full month before he started ordering hers
- Rule 14: "i told jessica to watdh for your car" — jessica exists, has a job, no setup

### Example 3 — Spin Class
```
boy reply: row 3 has the best angle
girl msg1: i put you in row 3
boy msg2: my emegency contact is already listed as the studio
girl msg3: hello??
boy msg4: text me the studio wifi i've been using the guest password
girl msg5: i changed your guest password last week
```
- Typo: `"emegency"` (msg2) instead of "emergency"
- Rule 13: she assigned him the seat. she knew he was there. she gave him the best angle.
- Rule 14: "my emegency contact is already listed as the studio" — when did this happen. why.

---

## 5. JSON Script Output Format

Brainrot scripts produce standard `video-NNN.json` files compatible with the existing schema. Key differences from standard arcs:

```json
{
  "video_id": "2026-03-02-001",
  "meta": {
    "theme": "default",
    "duration_s": 22,
    "spice_tier": "high",
    "format": "B",
    "arc_type": "brainrot",
    "brainrot_variant": "contextual",
    "brainrot_typo_line": "msg2",
    "brainrot_typo_word": "emegency"
  },
  "hook": { ... },
  "story": {
    "username": "maya",
    "age": 21,
    "caption": "mirror check",
    "asset": "baddies/abc123.jpg"
  },
  "reply": {
    "from": "boy",
    "text": "i submitted a formal wellness request on your succulent it hasn't moved in 11 days"
  },
  "persona": {
    "boy": { "name": "Ryan", "age": 22, "tone": "oblivious" },
    "girl": { "name": "Maya", "age": 21, "tone": "matter-of-fact" }
  },
  "messages": [
    { "from": "girl", "text": "i registered it under your address in november", "type_at": 2.8 },
    { "from": "boy", "text": "the form required a plant guardian and i listed myslef as primary", "type_at": 5.1 },
    { "from": "girl", "text": "under oath?", "type_at": 7.3 },
    { "from": "boy", "text": "i have a 6am watering window confirmed with your building front desk", "type_at": 10.4 },
    { "from": "girl", "text": "i told them you were the emergency contact", "type_at": 13.9 }
  ]
}
```

**Notes:**
- `reply.text` = the boy's opening line (the 1st of 6 lines in the brainrot structure)
- `messages` = the remaining 5 lines (msg1–msg5), alternating girl/boy/girl/boy/girl
- `meta.brainrot_variant` = `"random"` or `"contextual"`
- `meta.brainrot_typo_line` and `meta.brainrot_typo_word` = for QA traceability
- `meta.arc_type` = `"brainrot"` (the new enum value)

---

## 6. Files to Modify

### 6.1 `config.json`
**Change 1:** Add `"brainrot"` to `arc_distribution`. Recommended initial weight: `0.15`. Reduce `comedy` proportionally.

```json
"arc_distribution": {
  "number_exchange": 0.35,
  "rejection": 0.05,
  "plot_twist": 0.05,
  "cliffhanger": 0.00,
  "comedy": 0.40,
  "brainrot": 0.15
}
```

**Change 2:** Add a `brainrot` config block at the top level:

```json
"brainrot": {
  "variant_distribution": {
    "random": 0.50,
    "contextual": 0.50
  },
  "num_messages": 5,
  "num_messages_min": 5,
  "num_messages_max": 7,
  "temperature": 1.2,
  "max_output_tokens": 600,
  "num_candidates": 3
}
```

**Change 3:** Add a `brainrot_banned_phrases` array (patterns that signal the LLM broke character):

```json
"brainrot_banned_phrases": [
  "okay i know this sounds crazy",
  "i know this is weird",
  "i realize this is unusual",
  "spreadsheet",
  "EXCUSE ME"
]
```

---

### 6.2 `tools/lib/llm.js`

#### 6.2.1 Add `BRAINROT_SYSTEM_PROMPT` constant

Add after the existing `REVEAL_SYSTEM_PROMPT` constant (around line 327). This is the full system prompt encoding all 16 rules. Its structure:

```
Section 1: Role framing
  "You write viral TikTok DM scripts in the 'brainrot' style..."
  "Both characters are unhinged. They just found each other."

Section 2: Fixed 6-line format
  [verbatim structure: reply/msg1/msg2/msg3/msg4/msg5 with speaker assignments]

Section 3: Character dynamics
  [BOY: calm, proud, oblivious — verbatim from spec above]
  [GIRL: was already unhinged — verbatim from spec above]

Section 4: Formatting rules
  "All text lowercase. No periods. Fragments ok. CAPS on ONE word per line max.
   Never correct the intentional typo."

Section 5: The 16 Rules
  [All 16 rules verbatim, with examples inline]

Section 6: The 3 calibration examples
  [All 3 examples verbatim with line-by-line commentary]

Section 7: Self-correction instruction
  "Before outputting, check every line. If msg3 doesn't match the correct
   disruption cue for msg2, rewrite it. If msg4 logically follows from msg3,
   rewrite it. If msg5 is a punchline and not a revelation, rewrite it."

Section 8: Output format
  "Output format — prefix every line:
   reply: [text]
   msg1: [text]
   msg2: [text]
   msg3: [text]
   msg4: [text]
   msg5: [text]
   No other text. No explanations. No numbering."
```

#### 6.2.2 Add `buildBrainrotUserPrompt(variant, imagePath, caption)` function

For `brainrot_random`:
```
"Generate a brainrot DM script. The boy's opening line ('reply') must establish
a completely original institutional-chaos premise. Do not reference the story image.
Generate a premise from scratch using one of the institutional systems from Rule 9."
```

For `brainrot_contextual`:
```
"Generate a brainrot DM script. The boy's opening line ('reply') must be
SPECIFICALLY tied to what is visible in this story image and/or this caption: [caption].
The institutional chaos must emerge directly from something real in her post.
Example: if she posted a mirror selfie, maybe he filed a formal noise complaint
about her reflection being emotionally dangerous. If she posted coffee, maybe
he has been pre-ordering her drink since a specific date."
```

For contextual, the image is passed as a vision content block (same pattern already used by `generateStoryReplyOptions`).

**Caption fallback rule for contextual variant:**

Many assets in `baddies/` have no caption or a very short one. Handle this explicitly:

```javascript
// In generateBrainrotScript, before building the contextual user prompt:
const captionIsUsable = caption && caption.trim().split(/\s+/).length >= 5;
const imageIsAvailable = imagePath && fs.existsSync(imagePath);

if (variant === "contextual") {
  if (!imageIsAvailable) {
    // No image at all — silently downgrade to random variant
    // Log: "[brainrot] contextual requested but no imagePath — falling back to random"
    variant = "random";
  } else if (!captionIsUsable) {
    // Image exists but caption is null/short — pass image only, no caption injection
    // The vision model reads the image directly. This is fine and often produces
    // better openers than a 2-word caption like "mirror check" would.
    caption = null; // omit from prompt, don't inject "[caption: mirror check]"
  }
  // If both image + good caption exist: pass both (standard contextual path)
}
```

**Rationale:** A short caption like "mirror check" adds almost no signal. Injecting it as context makes the LLM anchor to the words "mirror" and "check" rather than reading the actual image. Passing the image alone gives the vision model full latitude to pick the most visually interesting institutional hook.

#### 6.2.3 Add `parseBrainrotScript(text)` function

Parses the 6-line labeled output format. **Primary split strategy: split on `reply:` as the script boundary, not on `---`.** The LLM occasionally uses `---` inside a line (em-dash style) or forgets the separator entirely. `reply:` is structurally guaranteed to start every valid brainrot script — it's a safer delimiter.

```javascript
function parseBrainrotScript(text) {
  const labels = ["reply", "msg1", "msg2", "msg3", "msg4", "msg5"];

  // PRIMARY: split on newline followed by "reply:" — this is the inter-script boundary
  // when the LLM returns multiple candidates in one call
  const scriptChunks = text
    .replace(/\r/g, "")
    .split(/\n(?=reply:)/i)
    .map(s => s.trim())
    .filter(Boolean);

  // For a single-script response, scriptChunks.length === 1
  // For multi-candidate (5 scripts), scriptChunks.length === 5
  // FALLBACK: if split produces only 1 chunk but text contains "---", try splitting on "---" too
  // and re-attempt the reply: split on each piece

  function parseOneScript(chunk) {
    const result = {};
    for (const label of labels) {
      // Match "label: " at start of line, capture everything until next label or end
      const pattern = new RegExp(`^${label}:\\s*(.+?)(?=\\n(?:${labels.join("|")}):|$)`, "ims");
      const match = chunk.match(pattern);
      if (!match) throw new Error(`parseBrainrotScript: missing label "${label}"`);
      result[label] = match[1].trim();
    }
    if (Object.keys(result).length < 6) throw new Error("parseBrainrotScript: fewer than 6 fields");
    return result;
  }

  if (scriptChunks.length === 0) throw new Error("parseBrainrotScript: empty input");

  // Return array of parsed scripts (caller selects best via scoring)
  return scriptChunks.map(parseOneScript);
}
```

**Key behavior:**
- Returns an **array** of parsed script objects, not a single object. `generateBrainrotScript` iterates this array and scores each candidate.
- If the LLM returns 1 script, array has length 1. If it returns 5, array has length 5.
- Malformed candidates (missing a label) are caught per-candidate — one bad candidate does not discard the entire response.
- `---` separators are silently ignored: they may appear between candidates but the split on `reply:` already handles that.

#### 6.2.4 Add `generateBrainrotScript({...})` async function

Signature:
```javascript
async function generateBrainrotScript({
  provider,
  apiKey,
  model,
  temperature,
  maxOutputTokens,
  variant,          // "random" | "contextual"
  imagePath,        // required for contextual, ignored for random
  caption,          // required for contextual, optional for random
  avoidPremises,    // string[] — recent reply texts to avoid repeating
  numCandidates,    // how many full scripts to generate and pick best from
  bannedPhrases     // string[]
})
```

Behavior:
1. Build user prompt using `buildBrainrotUserPrompt(variant, imagePath, caption)`
2. For `contextual`: include the image as an `input_image` content block (same as `generateStoryReplyOptions`)
3. For `random`: text-only payload
4. Use `BRAINROT_SYSTEM_PROMPT` as system prompt
5. Call `callLlm(...)` with `endpoint: "brainrot"`
6. Parse response with `parseBrainrotScript(text)`
7. If `numCandidates > 1`: generate N candidates in a single LLM call by asking for N scripts separated by `---`, then pick the one where msg5 is most recontextualizing (heuristic: msg5 references a detail that was implicit in the earlier lines)
8. Return `{ reply, msg1, msg2, msg3, msg4, msg5 }` object

**Add to `module.exports`:**
```javascript
generateBrainrotScript,
parseBrainrotScript,
```

---

### 6.3 `tools/generate.js`

#### 6.3.1 Import `generateBrainrotScript` at the top

```javascript
const {
  generateStoryReplyOptions,
  generateBanterMessages,
  generateEdgyBanterMessages,
  generateBrainrotScript,      // ← ADD
  ...
} = require("./lib/llm");
```

#### 6.3.2 Add `"brainrot"` to `supportedArcs` array

Around line 3338:
```javascript
const supportedArcs = [
  "number_exchange", "rejection", "plot_twist", "cliffhanger", "comedy",
  "brainrot"   // ← ADD
];
```

#### 6.3.3 Add brainrot variant selection before the attempt loop

After `arcType` is determined (around line 4993), add:
```javascript
let brainrotVariant = null;
if (arcType === "brainrot") {
  const brainrotConfig = config.brainrot || {};
  const variantDist = brainrotConfig.variant_distribution || { random: 0.5, contextual: 0.5 };
  brainrotVariant = pickWeighted(rng, variantDist);
}
```

#### 6.3.4 Add brainrot execution branch inside the attempt loop

The existing attempt loop (around line 5030) calls `generateStoryReplyOptions` then `generateBanterMessages`. Add a branch at the top of the attempt loop:

```javascript
if (arcType === "brainrot") {
  // --- Brainrot arc: single LLM call generates all 6 lines at once ---
  const brainrotConfig = config.brainrot || {};
  const brainrotResult = await generateBrainrotScript({
    provider,
    apiKey,
    model: config.rizzai.model,
    temperature: brainrotConfig.temperature || 1.2,
    maxOutputTokens: brainrotConfig.max_output_tokens || 600,
    variant: brainrotVariant,
    imagePath: brainrotVariant === "contextual" ? selectedStory.path : null,
    caption: selectedStory.caption || null,
    avoidPremises: recentReplies || [],
    numCandidates: brainrotConfig.num_candidates || 3,
    bannedPhrases: [
      ...(config.brainrot_banned_phrases || []),
      ...(config.banned_phrases || [])
    ]
  });

  // Map brainrot result to the standard script JSON shape
  const brainrotMessages = [
    { from: "girl", text: brainrotResult.msg1 },
    { from: "boy",  text: brainrotResult.msg2 },
    { from: "girl", text: brainrotResult.msg3 },
    { from: "boy",  text: brainrotResult.msg4 },
    { from: "girl", text: brainrotResult.msg5 }
  ];

  // Assign type_at timing (reuse existing timing logic)
  const timedMessages = assignTimings(brainrotMessages, {
    minGap: config.render_timing.regular_message_gap_short.min,
    maxGap: config.render_timing.regular_message_gap_short.max,
    firstGapMin: config.render_timing.first_response_target_short.min,
    firstGapMax: config.render_timing.first_response_target_short.max,
    rng
  });

  script = buildScriptJson({
    videoId,
    date,
    index,
    format,
    arcType: "brainrot",
    spice,
    controversyTier,
    hookLine,
    selectedStory,
    replyText: brainrotResult.reply,
    messages: timedMessages,
    personaBoy,
    personaGirl,
    beatPlan: buildBrainrotBeatPlan(brainrotResult),
    meta: {
      brainrot_variant: brainrotVariant,
      brainrot_typo_line: detectTypoLine(brainrotResult),
      brainrot_typo_word: detectTypoWord(brainrotResult)
    }
  });

  // Skip the existing banter pipeline entirely for brainrot
  lastScript = script;
  break; // exit the attempt loop after first successful brainrot generation
}
// ... existing non-brainrot logic continues below unchanged ...
```

#### 6.3.5 Add `buildBrainrotBeatPlan(brainrotResult)` helper

```javascript
function buildBrainrotBeatPlan(result) {
  return {
    inciting_incident: result.reply,
    first_reaction: result.msg1,
    escalation_turn: result.msg2,
    disruption: result.msg3,
    chaos_drop: result.msg4,
    shareable_moment: result.msg5,
    resolution_type: "brainrot"
  };
}
```

#### 6.3.6 Add `detectTypoLine` and `detectTypoWord` helpers

Simple heuristic: for each message text, compare against a dictionary or use Levenshtein distance to find the likely intentional typo. If no typo is detected, log a warning but don't fail.

```javascript
function detectTypoLine(result) {
  const candidates = ["msg2", "msg4", "msg1"]; // priority order per Rule 16
  for (const key of candidates) {
    if (likelyHasTypo(result[key])) return key;
  }
  return null;
}

function detectTypoWord(result) {
  // Optional: extract the typo'd word for logging
  // Simple approach: find words that look transposed vs. common words
  return null; // acceptable to skip this, it's metadata only
}
```

---

### 6.4 `tools/lib/qa.js`

#### 6.4.1 Add `"brainrot"` to the valid arc type enum

Around line 763:
```javascript
if (!["number_exchange", "rejection", "plot_twist", "cliffhanger", "comedy", "brainrot"].includes(script.meta.arc_type)) {
  reasons.push("invalid arc_type");
}
```

#### 6.4.2 Add brainrot-specific validation block

Add after existing arc-specific checks. This block fires only when `arcType === "brainrot"`:

```javascript
if (arcType === "brainrot") {
  // RULE: exactly 5 messages (msg1–msg5) in messages array after the reply
  const msgCount = script.messages.length;
  if (msgCount < 5 || msgCount > 7) {
    reasons.push(`brainrot_wrong_message_count (got ${msgCount}, expected 5–7)`);
  }

  // RULE: speaker order must be girl/boy/girl/boy/girl
  const expectedSpeakers = ["girl", "boy", "girl", "boy", "girl"];
  script.messages.slice(0, 5).forEach((msg, i) => {
    if (msg.from !== expectedSpeakers[i]) {
      reasons.push(`brainrot_wrong_speaker_at_msg${i + 1} (expected ${expectedSpeakers[i]}, got ${msg.from})`);
    }
  });

  // RULE: msg3 (index 2) must be a valid disruption cue
  // QA uses EXACT match for clean signal logging (fuzzy match is reserved for the retry trigger)
  const { isExactValidCue } = require("./brainrot-validator");
  const msg3Text = script.messages[2] && script.messages[2].text.toLowerCase().trim();
  if (!isExactValidCue(msg3Text)) {
    script.meta.qa_signals = script.meta.qa_signals || {};
    script.meta.qa_signals.brainrot_disruption_cue_not_exact = true;
    // Soft warn only — fuzzy-valid cues ("pause rn", "hello?") are acceptable in renders
    // but flagged here so you can track LLM drift over time
  }

  // RULE: msg5 (index 4) must not be a short one-liner punchline (it should be revelatory)
  const msg5Text = script.messages[4] && script.messages[4].text;
  if (msg5Text && msg5Text.split(" ").length < 4) {
    script.meta.qa_signals = script.meta.qa_signals || {};
    script.meta.qa_signals.brainrot_msg5_too_short = true;
  }

  // RULE: reply (boy's opener) must not use round numbers
  const replyText = script.reply && script.reply.text;
  if (replyText && /\b(10|20|30|40|50|60|70|80|90|100|1000)\b/.test(replyText)) {
    script.meta.qa_signals = script.meta.qa_signals || {};
    script.meta.qa_signals.brainrot_round_number_in_reply = true;
  }

  // RULE: no character must seem self-aware (check for forbidden phrases)
  const allTexts = [replyText, ...script.messages.map(m => m.text)];
  const selfAwarePhrases = ["okay i know this sounds crazy", "i know this is weird", "i realize this is unusual"];
  for (const txt of allTexts) {
    if (txt && selfAwarePhrases.some(p => txt.toLowerCase().includes(p))) {
      reasons.push("brainrot_character_self_aware");
      break;
    }
  }

  // RULE: banned phrases from config
  const brainrotBanned = (config && config.brainrot_banned_phrases) || [];
  for (const txt of allTexts) {
    for (const phrase of brainrotBanned) {
      if (txt && txt.toLowerCase().includes(phrase.toLowerCase())) {
        reasons.push(`brainrot_banned_phrase: "${phrase}"`);
      }
    }
  }

  // Skip existing arc-integrity checks that don't apply to brainrot:
  // (number_exchange ask check, dismissive-run check, reveal-punchy check)
  // These are already guarded by arcType checks in the existing code.
  return { pass: reasons.length === 0, reasons };
}
```

#### 6.4.3 Skip inapplicable checks for brainrot

Several existing QA checks assume the standard banter structure. Guard them:
- **Dismissive-run check** (around line 2428): wrap with `if (arcType !== "brainrot")`
- **Strong-ask check** (around line 959): already guarded by `arcType === "number_exchange"` — no change needed
- **Reveal-punchy check**: wrap with `if (arcType !== "brainrot")`
- **Phone-number check**: already conditional — no change needed

---

## 7. Scoring Function + Retry Loop

This is the most important addition to the plan. Without it, the pipeline produces scripts that *look* like brainrot but lack the soul — structurally correct format, flat output. The scoring function + retry loop is what closes the gap between "valid output" and "10/10 unhinged."

### 7.1 `scoreBrainrotScript(result)` — New Module: `tools/lib/brainrot-validator.js`

This module is called in two places: (1) inside `generateBrainrotScript` to trigger retries, and (2) inside `qa.js` to produce QA signals. Extract it into its own file to avoid duplication.

**Function signature:**
```javascript
function scoreBrainrotScript(result) {
  // result = { reply, msg1, msg2, msg3, msg4, msg5 }
  // Returns: { pass: boolean, score: number, failures: string[] }
}
```

**Scoring checks (machine-checkable rules only):**

| Check | Rule | Type | Penalty |
|-------|------|------|---------|
| msg3 is one of 7 valid cues | Rule 3 | Hard | FAIL — retry required |
| msg4 first word matches msg3 first word (logical follow signal) | Rule 4 | Hard | FAIL — retry required |
| reply contains a round number (10, 20, 30... 100, 1000) | Rule 2 | Hard | FAIL — retry required |
| msg5 word count < 4 | Rule 5 | Hard | FAIL — retry required |
| any line contains a self-aware phrase | Rule 6 | Hard | FAIL — retry required |
| any line contains a banned phrase ("spreadsheet", "EXCUSE ME") | Rule 11 | Hard | FAIL — retry required |
| speaker order is not girl/boy/girl/boy/girl | Rule 10 | Hard | FAIL — retry required |
| reply, msg3, or msg5 contains a typo (detected via word-dict check) | Rule 16 | Soft | warn only |
| no typo found on msg2 or msg4 | Rule 16 | Soft | warn only |
| msg5 contains a word that also appears in msg1 (recontextualization signal) | Rule 5 | Soft | warn only |
| any line uses a vague location word ("apartment", "office", "outside") | Rule 7 | Soft | warn only |
| boy line uses CAPS on more than 1 word | formatting | Soft | warn only |

**Implementation notes for the hard checks:**

```javascript
const VALID_DISRUPTION_CUES = ["be fr", "hello??", "pause", "under oath?", "what??", "cap", "say less"];

// Rule 3 check — TWO MODES depending on caller:
//
// RETRY TRIGGER (inside generateBrainrotScript): use FUZZY match
//   The LLM produces valid-energy cues like "pause." / "hello?" / "be fr rn" / "wait pause"
//   These carry the right meaning but fail exact match. Fuzzy prevents unnecessary retries.
//
// QA WARN (inside qa.js): use EXACT match for clean signal logging
//
// containsValidCue() — fuzzy, used for retry gating:
function containsValidCue(text) {
  const lower = (text || "").toLowerCase().trim();
  // Strip trailing punctuation variants before checking starts-with
  const normalized = lower.replace(/[.!,]+$/, "").trim();
  return VALID_DISRUPTION_CUES.some(cue =>
    normalized === cue ||
    normalized.startsWith(cue) ||   // "pause rn" → starts with "pause" ✓
    normalized.endsWith(cue) ||     // "wait pause" → ends with "pause" ✓
    normalized.includes(cue)        // "like hello??" → contains "hello??" ✓
  );
}

// isExactValidCue() — strict, used for QA warn logging only:
function isExactValidCue(text) {
  return VALID_DISRUPTION_CUES.includes((text || "").toLowerCase().trim());
}

// In scoreBrainrotScript — use fuzzy for the hard-fail that gates retries:
const msg3Clean = (result.msg3 || "").toLowerCase().trim();
if (!containsValidCue(msg3Clean)) {
  failures.push(`RULE_3: msg3 "${result.msg3}" is not a valid disruption cue`);
}
// In qa.js soft warn — use exact:
if (!isExactValidCue(msg3Text)) {
  script.meta.qa_signals.brainrot_disruption_cue_not_exact = true; // soft warn only
}

// Rule 4 check — msg4 logical follow signal
// If the first significant word of msg4 directly answers msg3, it's a follow.
// Simple heuristic: if msg3 is "under oath?" and msg4 starts with "yes" or "no" → fail.
// Broader: if msg4's first 3 words appear as a direct response pattern to msg3 → flag.
const LOGICAL_FOLLOW_PATTERNS = [
  { cue: "under oath?", starters: ["yes", "no", "i swear", "absolutely"] },
  { cue: "be fr",       starters: ["i am", "im serious", "dead serious", "i swear"] },
  { cue: "pause",       starters: ["i know", "yeah", "okay", "so"] },
  { cue: "hello??",     starters: ["i know", "right", "exactly", "i said"] },
  { cue: "what??",      starters: ["i said", "you heard", "exactly", "yeah"] },
  { cue: "cap",         starters: ["no cap", "i swear", "it's real", "true"] },
  { cue: "say less",    starters: ["exactly", "i know", "right", "so"] }
];
const msg4Lower = (result.msg4 || "").toLowerCase();
const match = LOGICAL_FOLLOW_PATTERNS.find(p => p.cue === msg3Clean);
if (match && match.starters.some(s => msg4Lower.startsWith(s))) {
  failures.push(`RULE_4: msg4 logically follows msg3 (starts with "${match.starters.find(s => msg4Lower.startsWith(s))}")`);
}

// Rule 2 check — round numbers
const ROUND_NUMBER_PATTERN = /\b(10|20|30|40|50|60|70|80|90|100|200|500|1000)\b/;
if (ROUND_NUMBER_PATTERN.test(result.reply)) {
  failures.push(`RULE_2: reply contains a round number`);
}

// Rule 5 check — msg5 word count
if ((result.msg5 || "").trim().split(/\s+/).length < 4) {
  failures.push(`RULE_5: msg5 too short to be a recontextualization (< 4 words)`);
}

// Rule 6 check — self-awareness phrases
const SELF_AWARE_PHRASES = [
  "okay i know this sounds", "i know this is weird", "i realize this",
  "sounds crazy but", "i know how this looks", "before you say anything"
];
const allTexts = [result.reply, result.msg1, result.msg2, result.msg3, result.msg4, result.msg5];
for (const txt of allTexts) {
  const lower = (txt || "").toLowerCase();
  if (SELF_AWARE_PHRASES.some(p => lower.includes(p))) {
    failures.push(`RULE_6: self-aware phrase detected in "${txt}"`);
    break;
  }
}

// Rule 11 check — banned content
const BRAINROT_BANNED = ["spreadsheet", "excuse me"]; // extend from config
for (const txt of allTexts) {
  const lower = (txt || "").toLowerCase();
  for (const phrase of BRAINROT_BANNED) {
    if (lower.includes(phrase)) {
      failures.push(`RULE_11: banned phrase "${phrase}" detected`);
    }
  }
}

// Speaker order check
const EXPECTED_SPEAKERS = ["girl", "boy", "girl", "boy", "girl"];
// Checked against messages array in qa.js; in the scoring function check the result keys:
// msg1→girl, msg2→boy, msg3→girl, msg4→boy, msg5→girl — enforced by structure, no code needed here
```

**Return value:**
```javascript
return {
  pass: failures.filter(f => f.startsWith("RULE_") || f.startsWith("SPEAKER")).length === 0,
  score: Math.max(0, 10 - failures.length),
  failures,
  warnings: softs   // soft check failures logged separately
};
```

---

### 7.2 Retry Loop inside `generateBrainrotScript`

Replace the existing "generate once, parse, return" flow with a retry loop that injects failure feedback into the next attempt.

**New flow:**
```
maxRetries = 3 (configurable: config.brainrot.max_retries)

for attempt 1 to maxRetries:
  1. Build user prompt (include failure feedback from previous attempt if any)
  2. Call LLM
  3. Parse all 3 candidates from response
  4. Score each candidate with scoreBrainrotScript()
  5. If any candidate passes all hard checks → return it (pick highest score)
  6. If no candidate passes → collect all failure reasons
     → inject failure feedback into next attempt's user prompt
     → retry

If all retries exhausted → return best-scoring candidate even if imperfect
  (don't crash the pipeline — log the failures to qa_signals)
```

**Failure feedback injection (the key mechanic):**

On retry, append to the user prompt:
```
"Your previous attempt failed these checks. Fix ONLY these issues in your next output:
- [RULE_3]: msg3 'yeah that's fair' is not a valid disruption cue. msg3 must be one of:
  'be fr' / 'hello??' / 'pause' / 'under oath?' / 'what??' / 'cap' / 'say less'
  Pick the one that matches the emotional reaction to msg2.
- [RULE_4]: msg4 'i know right' logically follows msg3. msg4 must introduce a brand new
  chaos element unrelated to the disruption. Drop something unexpected — a name, a place,
  a third party — with no setup.
Do not change any line that was not flagged."
```

This is the same self-correction loop that produces 10/10 outputs above — but automated. The LLM doesn't self-correct reliably in a single pass. It does correct reliably when it can see the exact failure reason and the exact rule it broke.

**Candidate selection logic (when multiple candidates pass):**

Pick the candidate with the highest recontextualization score:
```javascript
function recontextualizationScore(result) {
  // IMPORTANT: window is ALL prior lines, not just reply + msg1.
  //
  // Why: the deborah example — msg5 "deborah said we're her most interesting case"
  // echoes "deborah" which first appeared in msg2, not reply or msg1. A narrow
  // reply+msg1 window would score this 0. The recontextualization signal is
  // "msg5 references something from anywhere in the conversation" — so use all lines.
  //
  const msg5Words = new Set(
    (result.msg5 || "").toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z]/g, ""))
  );
  const allPriorWords = new Set([
    result.reply, result.msg1, result.msg2, result.msg3, result.msg4
  ].flatMap(line =>
    (line || "").toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z]/g, ""))
  ));

  // Stop words: skip these — they appear everywhere and add no signal
  const stopWords = new Set([
    "i", "the", "a", "an", "and", "to", "of", "in", "is", "it",
    "you", "my", "we", "me", "your", "our", "at", "on", "for",
    "that", "this", "its", "s", "re", "ve", "ll", "m", "t"
  ]);

  let overlap = 0;
  for (const w of msg5Words) {
    if (w.length > 2 && !stopWords.has(w) && allPriorWords.has(w)) overlap++;
  }

  // Bonus: if msg5 references a named third party that appeared in msg4
  // (named third parties in msg4 = Rule 14 wrong-context drop — msg5 knowing about them = stronger reveal)
  const msg4Words = new Set(
    (result.msg4 || "").toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z]/g, ""))
  );
  for (const w of msg5Words) {
    if (w.length > 3 && !stopWords.has(w) && msg4Words.has(w)) overlap += 0.5; // bonus weight
  }

  return overlap;
}
```

**Tie-breaker when scores are equal:** pick the candidate where msg5 is longest in word count. More words = more revelation surface = higher chance of screenshot-worthy closer.

---

### 7.3 Config Additions for Retry Loop

Add to the `brainrot` config block in `config.json`:
```json
"brainrot": {
  "variant_distribution": { "random": 0.50, "contextual": 0.50 },
  "num_messages": 5,
  "num_messages_min": 5,
  "num_messages_max": 7,
  "temperature": 1.2,
  "max_output_tokens": 600,
  "num_candidates": 5,
  "max_retries": 3,
  "retry_temperature_bump": 0.05
}
```

**`num_candidates: 5` — cost/time rationale:**
Generate 5 candidates per LLM call (not per retry). This means one call returns 5 scripts to score, pick best, and only retry if all 5 fail hard checks. In practice: 1 call producing 5 candidates costs ~the same as 1 call producing 3, but gives significantly more selection surface. Retries only happen when ALL 5 candidates fail — which after the first call will be rare. Expected actual retries per script: <0.5 on average. Max token budget per brainrot script slot: ~3 calls × ~1200 tokens output = ~3600 output tokens worst case.

`retry_temperature_bump`: on each retry, add 0.05 to temperature (capped at 1.4). This prevents the LLM from producing the same wrong output on retry.

**`max_output_tokens` for multi-candidate calls:**
When `num_candidates = 5`, set `max_output_tokens: 2000` for that call (each script ~300–350 tokens + separators). The single-script `max_output_tokens: 600` applies only when retrying with a single best-effort attempt.

---

### 7.4 Why This Gets to 90%+

| Risk | Without Retry Loop | With Retry Loop |
|------|--------------------|-----------------|
| msg3 wrong cue | ~30% failure rate | ~5% after 3 retries |
| msg4 logically follows msg3 | ~25% failure rate | ~5% after 3 retries |
| msg5 is a punchline not a revelation | ~20% failure rate | ~10% (hardest to auto-check, but failure feedback helps) |
| Round numbers in reply | ~15% failure rate | ~2% after feedback |
| Self-aware character | ~10% failure rate | ~2% after feedback |

The retry loop handles the mechanical failures. The calibration examples in the system prompt handle the soul failures (flat output). Together they get the pipeline to consistent "Deborah energy."

---

## 8. Prompt Engineering Details

### 7.1 Temperature
Use `1.2` for brainrot (higher than the existing `1.1`). The format requires more creative variance and the LLM tends to produce conventional outputs at lower temperatures.

### 7.2 Max Output Tokens
`600` for a single script. `1500` if generating 3 candidates in one call (preferred approach).

### 7.3 Multi-Candidate Strategy
Rather than calling the LLM 3 times and picking best, generate 3 candidates in one call:

System prompt instruction:
```
"Generate 3 different brainrot scripts. Separate each with exactly '---'.
 Each must use a different institutional premise.
 Each must use a different disruption cue on msg3."
```

Selection heuristic: pick the candidate where msg5 references a detail that appears nowhere else in the conversation (strongest recontextualization signal). Fall back to candidate 1 if heuristic can't differentiate.

### 7.4 Contextual Variant — Vision Prompt Addition
For `brainrot_contextual`, prepend to the user prompt:
```
"Here is her story image and caption: [caption]

The boy's opening line MUST be anchored to something specific in this image or caption.
The institutional chaos must emerge from something real she posted.
Do not use generic premises unrelated to the image."
```

Pass the image as `input_image` content block, exactly as done in `generateStoryReplyOptions`.

### 7.5 Avoid-Premises Injection
Pass recent `reply.text` values from the last 8 scripts:
```
"Avoid premises too similar to these recent openers:
- [recent reply 1]
- [recent reply 2]
..."
```

---

## 8. Timing Assignment for Brainrot Messages

Brainrot has 5 messages after the reply. Use the existing `short` variant timing windows:

| Message | Timing Target |
|---------|---------------|
| msg1 (girl) | 2.0 – 4.5s after reply |
| msg2 (boy) | +1.8 – 3.2s |
| msg3 (girl) | +1.8 – 3.0s (disruption cues land best fast) |
| msg4 (boy) | +2.0 – 3.5s |
| msg5 (girl) | +2.5 – 4.0s |

Total video duration for a 5-message brainrot: approximately 13–18 seconds. This fits within the existing `duration_s.min: 17, duration_s.max: 28` window with hook + story card time.

---

## 9. New Files (Optional but Recommended)

### `tests/test-brainrot-generation.js`

A dry-run test that:
1. Loads config
2. Calls `generateBrainrotScript` with `variant: "random"` (no image)
3. Calls `parseBrainrotScript` on a hardcoded example output
4. Validates 16 rules programmatically (speaker order, no round numbers, msg3 cue validity, msg5 word count > 4)
5. Logs pass/fail per rule

This can run without API keys by using a hardcoded mock LLM response.

### `tools/lib/brainrot-validator.js` (optional refactor)

Extract the 16-rule checks into a standalone module so they can be called both from `qa.js` and from `tests/test-brainrot-generation.js` without duplication.

---

## 10. What Stays Unchanged

| Component | Status |
|-----------|--------|
| `tools/render.js` | No changes needed. Chat bubble UI already renders `boy`/`girl` messages. |
| `remotion/src/` | No changes needed. |
| `tools/batch.js` | No changes needed. |
| `tools/repair.js` | No code changes to repair.js itself. But `batch.js` **must** guard the repair call — see below. |
| `tools/lib/fatigue.js` | Works automatically — brainrot reply texts are stored in the novelty memory like any other reply. |
| `schema/video.schema.json` | Add `"brainrot"` to the `arc_type` enum. One-line change. |
| `tools/select-candidates.js` | No changes needed. |

---

## 11. `batch.js` — Repair Pass Guard

`repair.js` is invoked from `batch.js` (not from `generate.js`), so the "skip repair for brainrot" instruction must be enforced there. Before implementation, grep `batch.js` for the repair call site:

```bash
grep -n "repair\|runRepair\|repairScript" tools/batch.js
```

At whichever line the repair function is called, wrap it:

```javascript
// Do not run repair on brainrot scripts — the 6-line structure is load-bearing.
// repair.js rewrites the payoff region (last 30% of messages), which includes msg5.
// msg5 is the recontextualization closer — the most important line. Rewriting it
// with banter-arc heuristics will destroy the format.
if (script.meta && script.meta.arc_type !== "brainrot") {
  script = await runRepairPass(script, { ... });
}
```

**Why this matters:** repair.js scores the "payoff region" (last 30% of messages) using banter-arc heuristics — it looks for verb strength, callbacks, and date-close language. msg5 of a brainrot script ("deborah said we're her most interesting case") scores near zero on those heuristics and would be rewritten into something like "you better be fun" — destroying the entire arc.

---

## 12. Schema Change

In `schema/video.schema.json`, find the `arc_type` enum and add `"brainrot"`:

```json
"arc_type": {
  "type": "string",
  "enum": ["number_exchange", "rejection", "plot_twist", "cliffhanger", "comedy", "brainrot"]
}
```

Also add optional brainrot-specific meta fields:

```json
"brainrot_variant": {
  "type": "string",
  "enum": ["random", "contextual"]
},
"brainrot_typo_line": {
  "type": ["string", "null"]
},
"brainrot_typo_word": {
  "type": ["string", "null"]
}
```

---

## 12. Implementation Order

Execute in this order to minimize risk to existing pipeline:

1. `schema/video.schema.json` — add `"brainrot"` to arc_type enum (safe, no logic change)
2. `config.json` — add brainrot block (with `num_candidates: 5`, `max_retries: 3`) and arc weight (safe, no logic change)
3. **`tools/lib/brainrot-validator.js`** — write `scoreBrainrotScript()` and `recontextualizationScore()` as a standalone module with zero dependencies on the rest of the pipeline. Test it independently with hardcoded inputs before wiring it anywhere.
4. `tools/lib/llm.js` — add `BRAINROT_SYSTEM_PROMPT`, `buildBrainrotUserPrompt()`, `parseBrainrotScript()`, and `generateBrainrotScript()` (imports `brainrot-validator.js` for the scoring step). Add to `module.exports`.
5. `tools/lib/qa.js` — import `brainrot-validator.js`, add `"brainrot"` to arc enum, add brainrot QA block, guard inapplicable checks
6. `tools/generate.js` — add `generateBrainrotScript` import, add to `supportedArcs`, add variant selection, add brainrot branch inside attempt loop
7. `tests/test-brainrot-generation.js` — dry-run test using hardcoded mock LLM output. Confirms: parser works, scorer catches known failures, retry feedback strings look correct. No API key required.
8. **Live test:** temporarily set `"brainrot": 1.0` in arc_distribution. Run `npm run generate -- --date=TEST`. Inspect 5 outputs against the 16 rules manually.
9. **Prompt tune:** if outputs are flat or violate rules at >20% rate, tighten the relevant section of `BRAINROT_SYSTEM_PROMPT` and re-test. Repeat until <10% failure rate on hard checks.
10. Restore realistic arc_distribution weight (`0.15`)

---

## 13. Success Criteria

A brainrot arc implementation is considered complete when:

- [ ] `npm run generate` produces valid brainrot scripts without crashing
- [ ] Generated scripts pass `npm run qa`
- [ ] `schema/video.schema.json` validation passes on all brainrot outputs
- [ ] Both `random` and `contextual` variants produce scripts
- [ ] Contextual variant's reply line is visibly tied to the story image/caption
- [ ] msg3 in generated outputs uses only the 7 approved disruption cues
- [ ] msg5 in generated outputs reframes the entire script (not just a punchline)
- [ ] Exactly one intentional typo exists per script (on msg2 or msg4)
- [ ] No self-aware lines pass QA
- [ ] Existing arc types (comedy, number_exchange, etc.) are completely unaffected
- [ ] `npm run render` successfully renders a brainrot script to MP4

---

---

## 14. New File Summary

| File | Action | Purpose |
|------|--------|---------|
| `schema/video.schema.json` | Edit | Add `"brainrot"` to arc_type enum |
| `config.json` | Edit | Add brainrot config block |
| **`tools/lib/brainrot-validator.js`** | **New** | `scoreBrainrotScript()`, `recontextualizationScore()` — shared by llm.js and qa.js |
| `tools/lib/llm.js` | Edit | Add `BRAINROT_SYSTEM_PROMPT`, `generateBrainrotScript()`, `parseBrainrotScript()` |
| `tools/lib/qa.js` | Edit | Add brainrot arc validation, import brainrot-validator |
| `tools/generate.js` | Edit | Wire brainrot arc into generation pipeline |
| **`tests/test-brainrot-generation.js`** | **New** | Offline dry-run test — no API key needed |

---

## 15. Pre-Implementation Fixes Applied (v1.2)

Six issues identified in pre-implementation review, all resolved in this version:

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | Multi-candidate `---` separator fragile | `parseBrainrotScript` now splits on `\n(?=reply:)` as primary delimiter; `---` is ignored |
| 2 | `addImperfection()` would double-typo brainrot messages | Explicitly skipped in `generateBrainrotScript` with inline comment explaining why |
| 3 | `repair.js` skip was implied but not located | Guard added at `batch.js` call site: `if (arc_type !== "brainrot")` — grep for call site before implementing |
| 4 | Contextual variant had no fallback for missing/short captions | Defined: no image → silent downgrade to random; image but no caption → image-only, no caption injection |
| 5 | Disruption cue check used exact match for retry trigger — too strict | `containsValidCue()` fuzzy for retry gating; `isExactValidCue()` exact for QA soft warn only |
| 6 | `recontextualizationScore` window only covered reply+msg1 | Expanded to ALL prior lines (reply, msg1, msg2, msg3, msg4) with bonus weight for msg4 named-party matches |

---

*End of PRD. Last updated: 2026-03-02. Version 1.2.*
