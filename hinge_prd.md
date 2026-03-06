# Texmi Hinge Match DM Video Generator (MVP/V1) PRD

Owner: TBD
Date: TBD
Status: Draft

## 1) Summary
Ship a minimal, reliable pipeline that generates 100 short vertical videos per day that mimic a Hinge first message leading to a match and short back-and-forth. Each video starts on a Hinge profile, shows his first message, then the match happens and the DM thread continues. The goal is to feel native to Hinge, drive retention, and validate creative performance before scaling.

## 2) Goals (MVP)
- Produce 100 unique, realistic Hinge match DM videos per day.
- Consistent quality: readable, natural pacing, native Hinge feel, safe content.
- High variation: profiles, opening lines, and banter arcs avoid repetition.

## 3) Non-Goals (MVP)
- CTA placements on screen (no on-screen selling).
- Full auto-posting, analytics dashboards, or creator marketplace.
- Multi-language support (unless explicitly required).

## 4) Problem Statement
We need a fast, repeatable way to create high-retention Hinge-style match banter videos without heavy production overhead, while keeping content safe and engaging.

## 5) User Personas
- Growth operator: wants daily batch output with minimal manual work.
- Creative lead: wants control over tone, spice tier, and realism.
- Viewer: expects a believable Hinge opener, match moment, and fast, witty banter.

## 6) Key Assumptions (Question Every Assumption)
1) "Hinge openers outperform story replies."
   - Do match-based hooks improve scroll-stop and 3s retention?
2) "Hot-girl persona is broadly appealing."
   - What tone maximizes engagement without policy risk?
3) "Synthetic profile assets can feel real."
   - What QA is needed to keep profiles believable?
4) "No on-screen CTA is better."
   - Does removing CTA improve watch time and rewatch?
5) "Spice tiers can be rotated safely."
   - What level increases engagement without crossing boundaries?

## 7) Success Metrics
- Throughput: 100 videos/day produced without errors.
- Output quality: 90% of videos pass a quick human review.
- Performance: scroll-stop at 2s/3s and median watch time baseline.
- Variation: no repeated profile or opener within a 7-day window.

## 8) Scope (MVP/V1)
### Must Have
- Hinge profile card frame (photo + prompt or caption).
- First message bubble sent by him.
- "Matched" moment or indicator before the thread continues.
- Hinge-style DM UI (bubbles, spacing, timestamps).
- Conversation generator with spice tiers (low/medium/high).
- Batch renderer to output 100 mp4s per day.
- Basic QA checks (length, spice boundaries, line length, duration).

### Should Have
- Profile asset library with tags for themes and vibes.
- Persona variability (names, ages, tone tags) to avoid repetition.
- Profile context generation (prompt/answer + vibe tag).

### Nice to Have (Post-MVP)
- Multiple UI skins (light, dark, custom).
- Auto-posting and A/B testing.
- Dashboard for review/approval.

## 9) Functional Requirements
1) Script Generation
   - Input: spice tier, profile themes, persona templates, brand safety rules.
   - Output: profile context + first message + message list with timestamps.
   - Constraints: max characters per line, max duration, safe content.

2) Data Format
   - JSON per video with profile metadata, personas, and message list.
   - Deterministic, schema-validated format for rendering.

3) Rendering
   - Vertical 1080x1920, 30 fps, 9-15s target duration.
   - Profile card shown first (1.5-2.5s), then match indicator.
   - First message appears, then DM thread continues.
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
- Feels like a real Hinge match flow: profile card, first message, match, banter.
- "Hot girl" voice: confident, teasing, witty, never explicit.
- No CTA or overt selling on screen.

## 12) Content Requirements
- Profile assets: curated + synthetic mix.
  - Curated: high-quality, realistic Hinge-native profile photos.
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
  /profiles
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
  "meta": { "theme": "profile", "duration_s": 12, "spice_tier": "medium" },
  "profile": {
    "name": "Maya",
    "age": 21,
    "prompt": "Typical Sunday",
    "answer": "Coffee, a long walk, and no plans",
    "asset": "assets/profiles/curated/profile-001.jpg"
  },
  "first_message": { "from": "boy", "text": "You and coffee might be my weakness" },
  "match": { "occur_at": 2.3 },
  "persona": {
    "boy": { "name": "Jake", "age": 20 },
    "girl": { "name": "Maya", "age": 21 }
  },
  "messages": [
    { "from": "girl", "text": "Cute. prove it", "type_at": 2.8 },
    { "from": "boy", "text": "Name the time, I will show up", "type_at": 4.0 }
  ]
}
```

### E) Rendering Rules (Required)
- 1080x1920, 30fps, 9-15s duration target.
- Profile card shown 1.5-2.5s before the match moment.
- First message bubble appears before the match indicator.
- Typing animation: variable delay per message; show typing dots for 0.3-0.8s.
- Scroll if messages overflow screen height.

### F) Script Generation Rules (Required)
- Max 24-28 chars per line; split long messages.
- No explicit content; keep flirty but safe.
- Mix message lengths and response times.
- Use 5-8 predefined opener-to-date arcs; rotate daily.
- Enforce spice tier rules (low/medium/high).

### G) QA Rules (Required)
- Reject if duration > 15s or < 8s.
- Reject if any message > 70 chars.
- Reject if banned phrases or explicit content found.
- Reject if missing profile asset or invalid asset path.
- Log each video as PASS/FAIL with reason.
