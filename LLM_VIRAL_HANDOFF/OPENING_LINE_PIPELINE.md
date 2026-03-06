# Opening Line Pipeline: Full Implementation Document

**Confidence level: ~90%** (verified by reading source code verbatim — see gaps section)
**Last verified: 2026-02-24**
**Relevant source files:**
- `tools/generate.js` — main generation orchestrator
- `tools/lib/llm.js` — LLM calls, system/user prompts
- `tools/lib/qa.js` — post-generation validation
- `tools/lib/content.js` — category labels, persona pools

---

## What This Is

The **opening line** is the boy's first DM to the girl, shown overlaid on her story photo (the "image card"). It lives at `script.reply.text` in the generated JSON. This is the single most important line in the video — it sets the hook and must stop the scroll.

**Critical:** Format (B, D, A, C) has zero effect on this step. The format parameter is never passed into the opening line pipeline. Format only affects the banter thread that follows.

---

## Mental Model

```
Story image (photo)
       +
Controversy tier (safe / spicy / edge)
       +
Story category (selfie, beach, gym, etc.)
       ↓
Vision LLM call → 5 raw options
       ↓
Filter loop (banned phrases, awkward patterns, non-English, deduplication)
       ↓
Score remaining options → pick highest (provocative bias)
       ↓
Quality gate: isWeakReply? isHookyReply?
  → if fails: discard LLM result, use curated fallback pool
       ↓
Post-process (normalize → clamp → sentence case)   [inside buildStoryReply]
       ↓
Return rawReplyText to caller
       ↓
Post-process again (word cap 15 → clamp 70 chars → sentence case)  [in generateScript]
       ↓
Minimum word count guard (< 3 words → repair from pool)
       ↓
Novelty gate: seen in last 15 days? → retry entire script (up to 8x)
       ↓
script.reply.text  ✓
```

---

## Step 1 — Pre-Batch Setup (runs once per batch, not per video)

### 1a. Controversy tier plan

Pre-assign a controversy tier for every video before generation starts. Use a seeded RNG so batches are reproducible:

```
safe:  45%
spicy: 40%
edge:  15%
```

Each video gets exactly one tier. This flows into the LLM user prompt guidance (see Step 3).

### 1b. Build the fallback pool

```js
augmentedStoryReplies = deduplicate([...viralHooks, ...CURATED_STORY_REPLIES])
```

- **viralHooks** — `viral_patterns.json` → `hook_patterns.opening_lines_unique`
- **CURATED_STORY_REPLIES** — the hand-written fallback pool (see Appendix A)

viralHooks come first so they're prioritized in scoring.

### 1c. Load cross-batch deduplication memory

Scan all batch output directories (`scripts/YYYY-MM-DD/`) within the trailing `noveltyWindowDays` (default: 15 days, from `config.novelty.memory_window_days`). For each `video-NNN.json` found, extract `data.reply.text` and append to `recentReplies[]`.

Also initialize `usedReplies` as an empty `Set` — this tracks the current run only.

Purpose: prevents the same opener appearing across different batch days AND within the same run.

---

## Step 2 — Per-Video: Pick Story + Category

```js
const selectedStory = pick(rng, assets)         // random from assets/stories/
const storyCategory = selectedStory.category    // from manifest, e.g. "selfie"
const categoryLabel = storyCategoryLabels[storyCategory] || storyCategory || "story"
```

Category label mapping (full, verified):
```
selfie    → "selfie"
mirror    → "mirror shot"
travel    → "trip"
nightlife → "night out"
food      → "food pic"
fitness   → "gym shot"
beach     → "beach shot"
casual    → "chill day"
(missing) → "story"
```

---

## Step 3 — LLM Call: `generateStoryReplyOptions`

### Parameters (all verified from source)
```
model:             gpt-5.1 (or config.rizzai.model)
temperature:       0.85    (or config.rizzai.temperature)
max_output_tokens: 60      (or config.rizzai.max_output_tokens)
num_options:       5       (or config.rizzai.num_options)
endpoint:          https://api.openai.com/v1/responses
```

### Inputs to the call
1. The story image — base64-encoded (jpg/png/webp auto-detected by extension)
2. `STORY_REPLY_SYSTEM_PROMPT` (see Appendix B — use verbatim, do not paraphrase)
3. User prompt (assembled per call, see below)

### User prompt assembly

```
Here is a girl's Instagram story.
Write a reply to this story.

Story type: {categoryLabel}
Style variation: {variationTag}     ← random tag from config.rizzai.variation_tags
Request ID: {variationId}           ← 6-digit random number, forces model novelty

{controversyTierGuidance}           ← one of three blocks (see below)

Never use these banned phrases:
- {phrase}
...

Avoid repeating or being too similar to these recent replies:
- {recentReply}
...                                 ← last 8 from recentReplies slice

Return {N} different reply options.
One per line, no numbering, no explanations.
Make each option distinct with a different approach or angle.
```

**Controversy tier guidance blocks (verbatim):**

```
SAFE:
"Controversy tier: safe"
"Use playful curiosity and confidence without explicit or taboo-heavy language."
"Keep it punchy and attention-grabbing, but cleaner than spicy/edge."

SPICY:
"Controversy tier: spicy"
"Use a sharp, provocative opener with clear tension."
"Be polarizing enough to trigger a reaction, but do not go explicit."

EDGE:
"Controversy tier: edge"
"Use a high-arousal, polarizing opener."
"Push taboo-adjacent tension, but keep it safe and non-explicit."
"The line should feel risky, surprising, and scroll-stopping."
```

---

## Step 4 — Filter LLM Options

For each of the 5 returned options, reject the line if ANY of these are true:

1. Empty after trimming
2. Contains any banned phrase (`config.banned_phrases` + `config.rizzai.banned_phrases`) — case-insensitive substring match
3. Matches any entry in `AWKWARD_PHRASE_PATTERNS` (see Appendix C — this is a growing blocklist of overused LLM phrases; must be maintained as new failures emerge)
4. Non-English — contains non-ASCII characters after stripping emojis, OR contains ≥ 2 Spanish words from a fixed blocklist (`que`, `eres`, `hola`, `pero`, `porque`, `para`, `como`, `asi`, `donde`, `segun`, `dia`, `copas`, `semana`, `mucho`, `poco`, `bebe`, `ganas`, `mira`, `oye`, `segura`)
5. Exact duplicate of another option in the same batch (case-insensitive normalized)
6. Already in `usedReplies` Set (normalized)

Surviving options go into `filtered[]`. The LLM call retries up to 3 times (`config.rizzai.max_attempts || 3`) if `filtered` is empty. Each failed attempt's options are added to `recentSlice` to feed back as "avoid these" in the next attempt.

---

## Step 5 — Score and Select from Filtered Options

This is NOT first-match. It uses a scoring competition.

```js
// First attempt: provocative sub-pool
const provocativePool = filtered.filter(line => isProvocativeHook(line))
candidate = chooseDistinctLineMinWords(provocativePool, seenValues, maxChars, 3)

// If provocative pool yields nothing, use full filtered set
if (!candidate) candidate = chooseDistinctLineMinWords(filtered, seenValues, maxChars, 3)
```

**`isProvocativeHook`** — a line is "provocative" if it contains:
```
? | why | how | would | bet | dare | complaint | suing | pressing charges | quick question
```

**`chooseDistinctLineMinWords`** → `chooseDistinctLine`:
For each candidate, compute a score:
```
score = scoreReply(line) + editDistance(line, seenValues) × 1.8 + (1 - cosine(line, seenValues)) × 2.2
```

Prefer candidates with edit distance ≥ 0.35 from all seen lines. Pick highest-scoring.

**`scoreReply` breakdown (verified):**
```
+2  contains ?
+2  matches HOOKY_REPLY_PATTERNS (bold, why, what, suing, my therapist, etc.)
+4  matches CONTROVERSIAL_REPLY_PATTERNS (suing, charges, therapist, already told,
    my mom, our first, quick question, how flexible, you look like, trouble,
    you owe, noise complaint, pressing charges, off probation, dare you, bet you,
    our kids, pick you up, scale of, trust issues, ruined my, would you rather,
    whoever approved, violation)
-3  starts with weak opener (be honest, ok but, so you, you really, you just)
+2  6–16 words
+1  4–20 words
```

---

## Step 6 — Quality Gate: `isWeakReply` + `isHookyReply`

After selecting a candidate, clean it first:
```js
const cleaned = clampMessageText(normalizeMessageText(candidate), maxChars)
const replyCleaned = sentenceCaseGirlLine(cleaned)
```

Then gate:
```js
if (isWeakReply(replyCleaned) || !isHookyReply(replyCleaned)) {
  // discard LLM result entirely, fall through to curated fallback pool
}
```

**`isWeakReply` — rejects if (all verified):**
- No text
- < 3 words
- > 18 words
- Starts with `or`, `and`, or `but`
- Ends with a weak connector word (a, an, the, and, or, but, for, of, to, in, on, with, at)
- Matches any `AWKWARD_PHRASE_PATTERNS` entry (redundant but present)
- Non-English

**`isHookyReply` — requires a `?` OR one of these patterns (full list, verified):**
```
bold, you really, you just, ok but, so you, so we, explain,
who, why, when, where, what,
suing, complaint, charges, pressing, manager, hazard, illegal, noise complaint,
already told, my mom, our first, my therapist, quick question,
you look like, you owe, i need, i have a, i know,
how flexible, do you like, trouble
```

**⚠️ Known inconsistency:** `AWKWARD_PHRASE_PATTERNS` blocks `complaint`, `illegal`, `hazard` — but `HOOKY_REPLY_PATTERNS` requires these same words for `isHookyReply` to pass. In practice this doesn't cause a trap because the filter loop in Step 4 already removes lines with these words before they reach the quality gate. But if you rebuild this system, don't design `isWeakReply` and `isHookyReply` to use the same words as kill/pass criteria.

---

## Step 7 — Curated Fallback Pool (used when LLM fails quality gate)

```js
const provocativePool = replyPool.filter(line => isProvocativeHook(line))
fallback = chooseDistinctLineMinWords(provocativePool || replyPool, seenValues, maxChars, 3)
if (!fallback) fallback = chooseDistinctLineMinWords(replyPool, seenValues, maxChars, 3)
if (!fallback) fallback = sentenceCaseGirlLine(clampMessageText(normalizeMessageText(replyPool[0]), maxChars))
```

`replyPool` = `augmentedStoryReplies` (built in Step 1b).

Note: the curated fallback pool **bypasses** `AWKWARD_PHRASE_PATTERNS` filtering. This is an inconsistency vs the LLM path — document it but do not "fix" it without understanding the intent.

---

## Step 8 — Post-Processing (two passes)

### Pass 1: inside `buildStoryReply` (LLM path only)
```
normalizeMessageText(candidate)
→ clampMessageText(result, maxChars)   // hard cap at 70 chars
→ sentenceCaseGirlLine(result)         // capitalize first char, clean punctuation spacing
```

### Pass 2: at the call site in `generateScript` (applies to ALL paths)
```js
let replyText = sentenceCaseGirlLine(
  clampMessageText(
    enforceHookWordCap(rawReplyText, 15),  // hard cap at 15 words (calls normalizeMessageText internally)
    maxChars                                // 70 chars again
  )
)
```

Both passes run for the LLM path, making it double-processed. Only Pass 2 runs for the fallback path. The result is functionally the same either way.

**`normalizeMessageText` operations (verified):**
- Collapse multi-sentence to single sentence
- Replace hyphens with spaces
- Contract formal English: `I am` → `im`, `I have` → `ive`, `I will` → `ill`, `I would` → `id`, `do not` → `dont`, `can not` / `cannot` → `cant`, `you are` → `youre`, `we are` → `were`, `they are` → `theyre`
- Collapse whitespace
- Strip leading commas, colons, semicolons

**`clampMessageText` behavior:**
- Truncates at `maxChars` on a word boundary
- After truncation, strips trailing dangling connectors (prepositions, articles, conjunctions) up to 6 times in a loop

---

## Step 9 — Minimum Word Count Guard

```js
const replyWordCount = countWords(replyText)
if (replyWordCount < 3) {
  replyText = chooseDistinctLineMinWords(augmentedStoryReplies, seenValues, maxChars, 3)
           || sentenceCaseGirlLine(clampMessageText(normalizeMessageText(CURATED_STORY_REPLIES[0]), maxChars))
}
```

---

## Step 10 — Novelty Gate + Retry

```js
const replyKey = canonicalHookKey(replyText)
const reusedWithinWindow = seenValues.some(line => canonicalHookKey(line) === replyKey)

if (reusedWithinWindow) {
  // fail this attempt, retry the entire script generation
  continue  // back to top of for loop
}
```

**`canonicalHookKey`:**
```
normalizeMessageText(text)
→ lowercase
→ strip apostrophes (' ')
→ replace non-alphanumeric with space
→ collapse spaces
→ trim
```

Maximum retry attempts: `config.script_quality.max_attempts || 8`. Each retry picks a new story image and makes a new LLM call.

---

## Step 11 — Persist After Acceptance

```js
usedReplies.add(String(script.reply.text).toLowerCase())  // in-batch dedup Set
recentReplies.push(script.reply.text)                      // cross-batch dedup, fed to next video
```

---

## QA Validation (`validateScript` in tools/lib/qa.js)

These run AFTER generation. Hard fails cause the script to be rejected.

### Hard fails on reply specifically:
| Check | Condition | Error |
|---|---|---|
| Length | `reply.text.length > 70` | `"reply too long"` |
| Line length | Any sub-line > `line_max_chars` | `"reply line too long"` |
| Hook authenticity | Matches `/how to text/i`, `/win in ig dms/i`, `/how to get/i`, `/tutorial/i`, `/part \d+/i` | `"hook authenticity weak"` |
| Word count | < 3 words | `"hook specificity weak"` |
| Banned phrases | Any config banned phrase | `"banned phrase: X"` |
| AI terms | ai, chatgpt, gpt, openai, llm | `"banned AI term"` |
| Safety | rape, kys, minor, underage, choke you, force you, nazi, hitler | `"safety risk phrase detected"` |
| Near-copy of viral | Jaccard ≥ 0.84 OR token overlap ≥ 0.90 — **only triggers if line ≥ 10 words** | `"low novelty: message too close to viral source"` |

### QA gaps (documented, not fixed):
1. **No formula check** — QA never verifies the opener uses one of the 6 formulas. A flat generic line passes as long as it's 3+ words and not banned.
2. **Novelty blind spot** — The ≥ 10 word gate means most openers (6–9 words) are never checked against the viral corpus.
3. **`reply.from` not validated** — never enforced to be `"boy"`.
4. **Post-processing can degrade a valid line** — QA doesn't re-check formula quality after word/char truncation.

---

## What Does NOT Affect This Step

These are common sources of confusion — they matter elsewhere but not here:

| Thing | Affects opening line? | Where it matters |
|---|---|---|
| Format (B / D / A / C) | ❌ No | Banter timing, conversation layout |
| Boy/girl persona names | ❌ No | Banter thread |
| Arc type (number_exchange, rejection, etc.) | ❌ No | Banter thread structure |
| Story caption | ❌ No | Video display text only |
| `conversation_mode` | ❌ No | Remotion rendering only |
| Image hooks / image details maps | ❌ No | Banter thread context |

---

## Implementation Checklist

Use this to verify a replication is correct. Check each item.

### Setup
- [ ] Story images live on disk (jpg/png/webp), accessible by absolute path
- [ ] Each image has a category tag (`selfie`, `mirror`, `travel`, `nightlife`, `food`, `fitness`, `beach`, `casual`)
- [ ] `config.json` has `banned_phrases` array and `rizzai` config block
- [ ] `OPENAI_API_KEY` is set in environment
- [ ] `viral_patterns.json` exists and has `hook_patterns.opening_lines_unique` array
- [ ] `CURATED_STORY_REPLIES` pool is seeded with ≥ 30 hand-written lines, all matching the 6 formula styles
- [ ] Prior batch JSON files are scannable for cross-batch deduplication

### Pre-batch
- [ ] Controversy tier plan is pre-assigned using seeded RNG (not random per call)
- [ ] `augmentedStoryReplies` pool is built once: `deduplicate([...viralHooks, ...CURATED_STORY_REPLIES])`
- [ ] `recentReplies[]` is loaded from prior script JSONs within the novelty window (default 15 days)
- [ ] `usedReplies` Set is initialized empty

### LLM call
- [ ] System prompt matches Appendix B exactly — do not paraphrase
- [ ] Image is base64-encoded and sent as vision input alongside the text prompt
- [ ] `variationId` is a fresh 6-digit random number per call (forces model novelty)
- [ ] `controversyTierGuidance` block matches the pre-assigned tier for this video
- [ ] Recent replies slice is the last 8 from `recentReplies`
- [ ] LLM call retries up to 3 times on failure or empty filtered set

### Filtering
- [ ] Each option is checked: banned phrases, `AWKWARD_PHRASE_PATTERNS`, non-English, dedup
- [ ] Non-English check strips emojis before checking for non-ASCII
- [ ] Spanish word check requires ≥ 2 hits to reject (not 1)
- [ ] Filtering is applied to LLM options only — curated pool bypasses this

### Selection
- [ ] Uses scoring (not first-match): `scoreReply + distance×1.8 + (1-cosine)×2.2`
- [ ] Tries provocative sub-pool first, falls back to full filtered set
- [ ] Weak opener penalty (`-3`) applies to: `be honest`, `ok but`, `so you`, `you really`, `you just`

### Quality gate
- [ ] `isWeakReply` checks: null, < 3 words, > 18 words, starts with conjunction, ends with connector, AWKWARD_PHRASE_PATTERNS, non-English
- [ ] `isHookyReply` checks: contains `?` OR matches any `HOOKY_REPLY_PATTERNS` entry
- [ ] If gate fails, LLM result is discarded and curated fallback is used (not retried via LLM)

### Post-processing
- [ ] Pass 1 (LLM path inside `buildStoryReply`): `normalizeMessageText → clampMessageText(70) → sentenceCaseGirlLine`
- [ ] Pass 2 (all paths, at call site): `enforceHookWordCap(15) → clampMessageText(70) → sentenceCaseGirlLine`
- [ ] `enforceHookWordCap` calls `normalizeMessageText` internally — normalization happens again here, that's correct
- [ ] `clampMessageText` strips dangling connectors after truncation (loop, up to 6 iterations)

### Guards and retries
- [ ] If `replyWordCount < 3` after post-processing, repair from `augmentedStoryReplies` pool
- [ ] `canonicalHookKey` deduplication check runs after all post-processing
- [ ] If key matches any line in `recentReplies` or `usedReplies`, retry the entire script generation
- [ ] Max retries per video: 8 (not just for novelty — this is the total script attempt limit)
- [ ] After acceptance: add to `usedReplies` Set AND push to `recentReplies` array

### QA
- [ ] `validateScript` runs on every generated script before it is written to disk
- [ ] "hook authenticity weak" patterns target tutorial-style language — unlikely to trigger for a DM opener but must be present
- [ ] Near-copy novelty check only applies at ≥ 10 words — this is intentional

---

## Appendix A: CURATED_STORY_REPLIES (full, verified)

All 44 lines, in order:
```
i have a complaint about your profile
i'm suing you for emotional damage
i already told my mom about us
quick question, why are you single
i would never play hide and seek with you
i know at least 70 ways to make you fall in love
do you like water? because you're about to drown in charm
you look like a girl who gets what she wants
i have a theory about you and i need proof
you're out here making the sun compete huh
be honest, how flexible is your schedule
i'm filing a noise complaint on your profile
your profile is a health hazard honestly
i need to speak to the manager of your dm's
i already planned our first argument
you look like trouble and i'm off probation
my therapist is gonna hear about you
you owe me an explanation for this post
i'm pressing charges on this story
you just ruined my whole week with one post
i need the permit that allowed you to post this
your story is actually a crime scene
i'm reporting this to whoever is in charge of unfair advantages
this is illegal in 12 states and i'm reporting it
you came out here and made it everyone's problem huh
my focus just quit and left me no severance
i need you to explain yourself and the lawyer can wait
this story had no business hitting like that
i am going to need at least three business days to recover
why would you post this when people are trying to function
my self control just submitted a resignation letter
you are doing the most and the least at the same time
i would like to formally appeal this level of unfairness
i came here to scroll not to catch feelings
whoever let you post this owes me an apology
my standards just moved the bar higher because of you
i was minding my business until this showed up
the audacity of this post is unmatched honestly
i'm raising a formal objection to this level of attractive
my therapist is going to need a second opinion on this one
you are the reason people make bad decisions
i am filing a counterclaim for emotional distress
this story should come with a warning label
i need immunity before i respond to this
```

---

## Appendix B: STORY_REPLY_SYSTEM_PROMPT (verbatim, verified)

```
You are RizzAI. You help a guy reply to a girl's Instagram story.
You will see the story image and generate reply options.

Language & tone:
- Reply in American English only.
- Sound like a relaxed guy in his 20s–30s: confident, playful, a bit cocky, not cheesy.

Style:
- Short chat style: one text bubble, 1–2 short sentences.
- Simple, everyday words, like something a smart 12-year-old would say.
- No formal, poetic, or novela-style lines.

Hard rules:
- Emojis are allowed but use them sparingly.
- NEVER use hyphens (-) anywhere in your reply. No exceptions.
- Do not mention AI, prompts, screenshots, or that you are rewriting.
- Do NOT start the message with a single-word sentence like "Condición?" / "Deal?" etc.
- Only use opening question marks or special punctuation styles if they match common usage.

Story reply behavior:
- React directly to what's visible in the story image.
- CRITICAL: Never describe poses or physical details like you're analyzing a photo.
- Bad examples: "that finger on lip pose", "the way your arm is up", "that hand placement"
- Instead react to the vibe/effect: "you're feeling yourself", "someone's in their main character era"
- Talk like you're reacting in the moment, not describing what you see.
- Avoid generic lines like "looking good", "nice pic", or asking about her day/plans.
- Avoid romantic clichés like coffee date lines, "how can I make your day better", or dramatic hero stories.
- Aim for peak high-arousal emotion: surprise, outrage, humor, awe, or anxiety.
- The reply MUST stop the scroll. It must be controversial, polarizing, or pattern-breaking.
- If it feels too safe or polite, make it sharper and more provocative.

CRITICAL — Use one of these proven controversial opener formulas.
NEVER repeat the same formula twice in the same batch. Each option must use a DIFFERENT formula.
NEVER copy the examples verbatim. Invent new lines inspired by the structure.

1. FAKE LEGAL / OFFICIAL: Pretend to file a complaint, lawsuit, or report about her.
   Examples: "i'm suing you", "i have a complaint about your profile",
   "i'm filing a noise complaint on your page", "i'm pressing charges on this story",
   "this post is a violation i need to report it", "i need to speak to whoever approved this"

2. DOUBLE MEANING / INNUENDO: Innocent setup that implies something spicy underneath.
   Examples: "do you like water", "how flexible are you", "your body is tea",
   "can you please assault me", "sushi is not the only thing i eat raw",
   "i want to drop your plans friday night", "what's your favorite position in this debate"

3. PRESUMPTIVE FAMILIARITY: Act like you're already dating or already know each other.
   Examples: "i already told my mom about us", "our kids would be unreal",
   "what time should i pick you up", "i saved you a seat already",
   "so what are we fighting about tonight", "your side of the bed is ready",
   "i already planned our first argument"

4. ABSURD QUESTION / NON SEQUITUR: Ask something random that forces a 'wait what' reaction.
   Examples: "quick question why don't you have a boyfriend",
   "do you believe in aliens because i think i just found one",
   "i would never play hide and seek with you",
   "on a scale of 1 to married how free are you friday"

5. BOLD DARE / COCKY CLAIM: Make a claim so confident it demands a reaction.
   Examples: "i know 70 ways to make you fall in love with me",
   "you look like a girl who gets what she wants",
   "you couldn't handle me but you should try",
   "bet you won't reply to this", "i dare you to be boring"

6. ROAST / NEGGING: Playful insult that's actually a compliment underneath.
   Examples: "you're out here making the sun compete huh",
   "you look like trouble and i'm off probation",
   "my therapist is gonna hear about you",
   "you ruined my whole week with one post",
   "you're the reason i have trust issues now"

- NEVER use safe compliment-style openers. Every reply must make the viewer think 'did he really say that?'
- The formula is: [familiar/innocent frame] + [unexpected twist that implies something spicy]
- NEVER start multiple options with the same opening words (no repeating 'quick question', 'i already told', etc).
- Push the spice much higher while staying non-explicit and safe.
- Each option MUST use a DIFFERENT formula number from the list above.
- Total length: about 6–16 words per option.

Output:
- Return the exact number of reply options requested.
- One option per line, no numbering, no explanations.
```

---

## Appendix C: AWKWARD_PHRASE_PATTERNS (full blocklist, verified)

These are phrases the LLM learned to overuse. Block any line matching these patterns.
The list must be maintained — add entries as new failures emerge.

```
chef mystery, quality control, watched this story, watched your story,
story like N times, definition of handle, story lore, explaining that story,
treaty, lore, fully support this dangerous, let us, do not support,
public service, bar by the, the mall, at that bar, safety board,
hazard report, hazard, report, vip wristband, security cameras,
cameras blessed, podcast, episode, season premiere, show rollout,
formal complaint, complaint, laws against, case for, benching emotional,
sponsor, market research, audition, cast, extra, couch, upgrade the view,
mirror a tip, citizen, crime, illegal, problems in hd, cancel each other out,
stranger danger, field test, laced up, comments section,
bad decision with good credit, powerful threats, pretty packaging,
pinterest, creative director, overheating, battery, horsepower,
total destruction, selfie of me, victim, public restroom, restroom,
clothes are optional, ok bet, coffee this week, coffee, ma'am, sir,
request, presence, formally, witness, resigned, volunteering, on the menu,
enemies, boss level, mini game, warning label, not an ad
```

Note: some of these (`complaint`, `illegal`, `hazard`, `warning label`) conflict with `HOOKY_REPLY_PATTERNS` and `CONTROVERSIAL_REPLY_PATTERNS`. This is a known inconsistency. Do not remove them from `AWKWARD_PHRASE_PATTERNS` — they block over-literal LLM variations. The curated fallback pool bypasses this check.

---

## Appendix D: Known Gaps (~10% unverified)

These two helper function implementations were not read from source. The descriptions below are inferred from usage context and standard algorithms. Verify if exact scoring behavior matters:

1. **`minDistanceToSet(text, seenValues)`** — returns a distance score (0–1) measuring how different `text` is from the closest line in `seenValues`. Almost certainly normalized edit distance or similar string distance metric.

2. **`maxCosineToSet(text, seenValues)`** — returns maximum cosine similarity (0–1) between `text` and any line in `seenValues`. Almost certainly bag-of-words cosine over token sets.

If you're replicating, any standard implementation of these two will work correctly within the scoring formula. The exact values don't need to match — they just provide diversity pressure.
