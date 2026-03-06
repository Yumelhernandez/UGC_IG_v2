# Texmi Instagram Story Reply DM Video Generator (MVP/V1) PRD

Owner: TBD
Date: TBD
Status: Draft

## 1) Summary
We will ship a minimal, reliable pipeline that generates 100 short vertical videos per day that mimic Instagram Story reply DMs. Each video starts with a story card, shows a spicy reply from him, then a playful "hot girl" response and witty banter. The goal is to feel native to IG, drive retention, and validate creative performance before scaling.

## 2) Goals (MVP)
- Produce 100 unique, realistic IG Story reply DM videos per day.
- Consistent quality: readable, natural pacing, native IG feel, and safe content.
- High variation: story assets, reply hooks, and banter arcs avoid repetition.

## 3) Non-Goals (MVP)
- CTA placements on screen (no on-screen selling).
- Full auto-posting, analytics dashboards, or creator marketplace.
- Multi-language support (unless explicitly required).

## 4) Problem Statement
We need a fast, repeatable way to create high-retention IG-style story reply banter videos without heavy production overhead, while keeping content safe and engaging.

## 5) User Personas
- Growth operator: wants daily batch output with minimal manual work.
- Creative lead: wants control over tone, spice tier, and realism.
- Viewer: expects a believable story-reply hook and fast, witty banter.

## 6) Key Assumptions (Question Every Assumption)
1) "Story replies outperform cold texting."
   - Do story hooks improve scroll-stop and 3s retention?
2) "Hot-girl persona is broadly appealing."
   - What tone and attitude maximize engagement without policy risk?
3) "Synthetic story assets can feel real."
   - What QA is needed to keep synthetic assets believable?
4) "No on-screen CTA is better."
   - Does removing CTA improve watch time and rewatch?
5) "Spice tiers can be rotated safely."
   - What level increases engagement without crossing boundaries?

## 7) Success Metrics
- Throughput: 100 videos/day produced without errors.
- Output quality: 90% of videos pass a quick human review.
- Performance: scroll-stop at 2s/3s and median watch time baseline.
- Variation: no repeated story asset or hook within a 7-day window.

## 8) Scope (MVP/V1)
### Must Have
- Story card frame (image/video placeholder) with IG-inspired header.
- Story reply bubble (reply sticker or quoted story snippet).
- IG-style DM UI (bubbles, spacing, timestamps).
- Conversation generator with spice tiers (low/medium/high).
- Batch renderer to output 100 mp4s per day.
- Basic QA checks (length, spice boundaries, line length, duration).

### Should Have
- Story asset library with tags for themes and vibes.
- Persona variability (names, ages, tone tags) to avoid repetition.
- Story context generation (caption + vibe tag).

### Nice to Have (Post-MVP)
- Multiple UI skins (light, dark, custom).
- Auto-posting and A/B testing.
- Dashboard for review/approval.

## 9) Functional Requirements
1) Script Generation
   - Input: spice tier, story themes, persona templates, brand safety rules.
   - Output: story context + reply + message list with timestamps.
   - Constraints: max characters per line, max duration, safe content.

2) Data Format
   - JSON per video with story metadata, personas, and message list.
   - Deterministic, schema-validated format for rendering.

3) Rendering
   - Vertical 1080x1920, 30 fps, 9-15s target duration.
   - Story card shown first (1.5-2.5s), then transition to DM.
   - Typing animation with variable delays.
   - Scroll as needed after message overflow.

4) QA
   - Auto-checks: duration, bad words, explicit phrases, age ambiguity,
     line length, message length, and spice tier compliance.
   - Manual spot-check of 1-2 videos/day.

## 10) Technical Requirements (Simple, Scalable, Cost-Effective)
- Run locally by default; add cloud rendering only when local throughput is insufficient.
- Single command to generate and render a daily batch; configuration via a simple config file or env vars.
- No always-on services for MVP; batch jobs only.
- Flat-file storage first; add a DB later if needed.
- Deterministic renders from JSON input for repeatability and debugging.
- Cost caps for LLM usage; rate limit and reuse prompt templates.
- Resumable runs: each video is independent; failures do not stop the batch.
- Basic logging: per-video status + error reason; daily summary report.
- All assets bundled locally; no runtime remote fetches.
- If cloud rendering is added, prefer serverless with budget guardrails.
- If any cloud provider is required in future phases, standardize on Google Cloud.

## 11) UX / Creative Requirements
- Feels like a real IG story reply chain: story card, reply bubble, banter.
- "Hot girl" voice: confident, teasing, witty, never explicit.
- No CTA or overt selling on screen.

## 12) Content Requirements
- Story assets: curated + synthetic mix.
  - Curated: high-quality, realistic IG-native images.
  - Synthetic: photoreal variations tagged to top-performing themes.
- Spice tiers (rotate daily):
  - Low: playful tease, light flirt, no innuendo.
  - Medium: bolder confidence, mild double-meaning, still safe.
  - High: cheeky/suggestive but non-explicit; no sexual acts, no nudity.
- Always avoid: explicit sexual content, coercion, age ambiguity, fetish content,
  power imbalance, or "send nudes" language.

## 13) Technical Approach (MVP)
- Remotion template (single design).
- Script runner that:
  1) Generates 100 scripts,
  2) Writes JSON files,
  3) Renders 100 videos,
  4) Exports to a /renders folder.
- Storage is local folders at first (scripts/, renders/, assets/).

## 14) V1 Architecture Checklist (LLM-Executable)
### A) Architecture (Minimal)
```
LLM -> JSON scripts -> Remotion renders -> /output mp4s
```
- One batch job per day; no servers required.
- Local rendering first; cloud only if needed for speed.

### B) Tooling (Suggested Defaults)
- LLM: any text-only API capable of JSON output.
- Rendering: Remotion (local CLI).
- Orchestration: a single Node script or a Make/n8n workflow.
- Storage: local filesystem folders.

### C) Folder Structure (Required)
```
/scripts
  /YYYY-MM-DD
    video-001.json
/renders
  /YYYY-MM-DD
    video-001.mp4
/assets
  /stories
    /curated
    /synthetic
  /avatars
  /sfx
  /fonts
/remotion
  (template code)
```

### D) JSON Schema (Required)
```
{
  "video_id": "YYYY-MM-DD-001",
  "meta": { "theme": "spicy", "duration_s": 12, "spice_tier": "medium" },
  "story": {
    "username": "maya",
    "age": 21,
    "caption": "late night drive",
    "asset": "assets/stories/curated/story-001.jpg"
  },
  "reply": { "from": "boy", "text": "so this is where you disappear to?" },
  "persona": {
    "boy": { "name": "Jake", "age": 20 },
    "girl": { "name": "Maya", "age": 21 }
  },
  "messages": [
    { "from": "girl", "text": "maybe. what if i like the quiet", "type_at": 1.2 },
    { "from": "boy", "text": "quiet? you? never", "type_at": 2.6 }
  ]
}
```

### E) Rendering Rules (Required)
- 1080x1920, 30fps, 9-15s duration target.
- Story card shown 1.5-2.5s before DM thread.
- Reply bubble appears under the story card before the DM.
- Typing animation: variable delay per message; show typing dots for 0.3-0.8s.
- Scroll if messages overflow screen height.

### F) Script Generation Rules (Required)
- Max 24-28 chars per line; split long messages.
- No explicit content; keep flirty but safe.
- Mix message lengths and response times.
- Use 5-8 predefined story-reply arcs; rotate daily.
- Enforce spice tier rules (low/medium/high).

### G) QA Rules (Required)
- Reject if duration > 15s or < 8s.
- Reject if any message > 70 chars.
- Reject if banned phrases or explicit content found.
- Reject if missing story asset or invalid asset path.
- Log each video as PASS/FAIL with reason.

### H) Batch Job Steps (Required)
1) Generate 100 scripts (LLM).
2) Validate JSON against schema + QA rules.
3) Render 100 videos via Remotion (config-driven).
4) Export to `/renders/YYYY-MM-DD`.
5) Produce a summary log (count pass/fail).

### I) Cloud Scaling (Optional Later)
- If local rendering exceeds 60 minutes for 100 videos:
  - Move rendering to Remotion Lambda or equivalent on Google Cloud.
  - Keep same JSON input and template; only swap renderer.

### J) Implementation Notes (Remotion)
- Components to build (minimal):
  - StoryCard: story header, username, time, asset background.
  - ReplySticker: reply bubble anchored to story.
  - PhoneFrame: background + status bar.
  - ChatBubble: left/right bubble with text wrapping.
  - TypingIndicator: animated dots.
  - ConversationTimeline: orchestrates messages + typing delays + scroll.
- Composition setup:
  - One composition that reads a JSON file.
  - Duration determined by final message timestamp.

### K) LLM Prompt Template (Script Generation)
Prompt goals:
- Output valid JSON only, no extra text.
- Follow the JSON schema in section D.
- Keep duration 9-15s; max 70 chars per message.
- Use one of the defined story-reply arcs.
- Enforce spice tier rules; avoid explicit content.

Prompt skeleton (example):
```
You are generating short IG story-reply DM videos for Texmi.
Return ONLY JSON that matches this schema:
{ "video_id": "...", "meta": { "theme": "...", "duration_s": 0, "spice_tier": "medium" }, "story": {...}, "reply": {...}, "persona": {...}, "messages": [...] }

Constraints:
- 9-15s total duration
- max 70 chars per message, max 28 chars per line
- no explicit content or profanity
- no CTA or selling on screen

Conversation arc: {STORY HOOK -> TEASE -> HOT GIRL PUSHBACK -> WITTY CLOSE}
Generate 100 scripts.
```

### L) Daily Run Checklist (Operator)
1) Generate 100 scripts (LLM) for today's date.
2) Validate JSON and QA rules; fix or regenerate failures.
3) Render batch with Remotion.
4) Spot-check 1-2 videos for pacing and realism.
5) Move final mp4s to posting queue.

### M) Conversation Arcs Catalog (Starter Set)
1) Story Tease -> Hot Girl Pushback -> Witty Reframe
2) Compliment -> Playful Challenge -> Banter Volley
3) Curious Question -> Mysterious Reply -> Bold Closer
4) "You again?" -> Confident Reply -> Flirty Switch
5) Emoji Reply -> Dry Comeback -> Turn the Tables
6) Late Night Story -> "You up?" -> Funny Deflection
7) Travel Story -> "Take me next time" -> Spicy Twist
8) Mirror Selfie -> "dangerous" -> "you handle it"

### N) Persona Library (Starter Set)
- Boy personas (name, age, tone tag):
  - Jake, 20, playful
  - Ryan, 22, confident
  - Eli, 19, shy-funny
  - Marcus, 23, smooth
  - Noah, 21, awkward-charming
- Girl personas (name, age, tone tag):
  - Maya, 21, teasing
  - Chloe, 22, direct
  - Ava, 20, sarcastic
  - Leah, 21, warm
  - Zoe, 20, blunt

## 15) Workflow (Daily)
1) Generate scripts (AI).
2) Run QA checks.
3) Render batch.
4) Quick human review.
5) Publish or queue for posting.

## 16) Risks & Mitigations
- Risk: story assets feel fake or repetitive.
  - Mitigation: mix curated/synthetic, tag for variation, QA new synthetic sets.
- Risk: spice tier drifts into unsafe content.
  - Mitigation: explicit banned phrase list + spice tier validator.
- Risk: UI feels too close to IG.
  - Mitigation: custom UI inspired by, not copied from, IG.

## 17) Open Questions
- What fidelity should the IG-inspired UI target?
- How many curated story assets are needed to avoid repetition?
- What spice tier distribution is optimal for engagement?
- Do we need sound (typing, notification) in MVP?

## 18) Out of Scope for V1
- Automated A/B testing of captions and hashtags.
- Advanced analytics dashboard.
- Multi-language support.
