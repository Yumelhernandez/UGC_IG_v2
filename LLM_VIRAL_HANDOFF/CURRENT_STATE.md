# Current State — Viral Pipeline (as of 2026-02-20)

**Read this first.** The other docs in this folder (`LLM_HANDOFF_VIRAL_WORK.md`, `README_FOR_NEXT_LLM.md`, `LLM_HANDOFF_FILES.json`) describe the system _before_ the implementation in `IMPLEMENTATION_PLAN.md` was executed. They are stale. This document describes what actually exists now.

---

## The Big Picture

Two separate projects are now connected into one pipeline:

| Project | Path | Role |
|---|---|---|
| **UGC_Two_IG** | `/Users/yumelhernandez/UGC_Two_IG` | Script generator + Remotion renderer (production arm) |
| **New project** | `/Users/yumelhernandez/Documents/New project` | Viral video OCR analysis pipeline (research arm) |

The research arm analyzes real viral Instagram DM videos. The production arm generates new ones. They were previously disconnected. They are now connected via `viral_patterns.json`.

---

## End-to-End Data Flow

```
~/Downloads/Viral videos IG/Viral_video_N.mp4
        ↓
  python3 append_viral_28_55.py          (New project/tools/)
  └─ ffmpeg fps=1 + scene detect
  └─ Tesseract OCR per frame
  └─ Segment deduplication
  └─ Writes per-video section.md → .tmp_viral_batch_28_55/Viral_video_N/section.md
  └─ safe_append() → viral_video_breakdowns_consolidated.md   [MASTER FILE]
  └─ auto-runs extract-viral-patterns.py  ←─────────────────────────────────┐
        ↓                                                                     │
  viral_video_breakdowns_consolidated.md                                      │
        ↓                                                                     │
  python3 extract-viral-patterns.py      (UGC_Two_IG/tools/)  ───────────────┘
  └─ parses all 3 breakdown formats (frame / shot / segment)
  └─ OCR garbage filter
  └─ extracts hook_response_pairs, opening_lines, girl_responses
        ↓
  viral_patterns.json                    (UGC_Two_IG/)         [THE BRIDGE]
        ↓
  npm run generate -- --count=N          (UGC_Two_IG/)
  └─ getViralPatterns() loads viral_patterns.json at startup
  └─ augments CURATED_STORY_REPLIES with real viral opening lines
  └─ augments CURATED_GIRL_PUSHBACK with real viral girl responses
  └─ injects hook_response_pairs as few-shot examples into LLM prompt
        ↓
  scripts/YYYY-MM-DD/video-NNN.json      (UGC_Two_IG/)
        ↓
  Remotion render → Video
```

**One command runs the entire research → patterns step:**
```bash
cd "/Users/yumelhernandez/Documents/New project/tools"
python3 append_viral_28_55.py
```

`viral_patterns.json` is updated automatically at the end. The next `npm run generate` picks it up.

---

## Current State of Every Key File

### Production Arm — UGC_Two_IG

| File | Status | What it does |
|---|---|---|
| `tools/generate.js` | **Modified** | Main script generator. Loads `viral_patterns.json` via `getViralPatterns()`. Augments curated pools with viral data. Passes `hookExamples` (few-shot pairs) into the LLM banter prompt. |
| `tools/extract-viral-patterns.py` | **Modified** | Parses consolidated markdown → JSON. Now handles 3 formats: frame (`t=N.000000s`), shot (`N. Shot N`), segment (`N. Segment N`). Has tightened OCR garbage filter. |
| `tools/consolidate_breakdowns.py` | **New** | Merges 3 breakdown sources (priority: batch > .tmp_viral > docs) into one file. Run once to rebuild the consolidated file from scratch. |
| `viral_patterns.json` | **Generated output** | 32 videos parsed, 23 unique hooks, 25 hook-response pairs, 23 girl response patterns. Regenerated automatically after each analysis run. |
| `config.json` | Unchanged | `format_distribution: {"B": 1}`, model: `gpt-5.1`. Config values validated against empirical data — no changes needed. |
| `LLM_VIRAL_HANDOFF/IMPLEMENTATION_PLAN.md` | All `[x]` | Full history of what was built and why. Read this if you need to understand decisions made. |

### Research Arm — New project

| File | Status | What it does |
|---|---|---|
| `tools/append_viral_28_55.py` | **Modified** | Main batch analysis runner. Imports paths from `viral_config.py`. Uses `threading.Lock` for parallel-safe writes. Auto-runs extractor at end. Targets: `Viral_video_27` through `Viral_video_55` (excluding 34). |
| `tools/viral_config.py` | **New** | Single source of truth for all paths. Import this in any script that reads/writes pipeline files. |
| `tools/consolidate_breakdowns.py` | (copy also lives here, canonical is UGC_Two_IG/tools/) | See above. |
| `tools/batch_append_breakdowns.py` | **Retired** | Renamed to `.retired.bak`. Covered overlapping range, made redundant by `append_viral_28_55.py`. Do not use. |
| `viral_video_breakdowns_consolidated.md` | **Generated output** | 32 unique `## Video:` sections. Master input file for the extractor. |
| `.tmp_viral_batch_28_55/Viral_video_*/section.md` | Working cache | Per-video OCR outputs. If a `section.md` exists, the video is skipped on re-run (idempotent). Delete to force reanalysis. |

---

## Paths Reference (`viral_config.py`)

```python
VIDEO_DIR      = ~/Downloads/Viral videos IG/
OUT_MD         = ~/Documents/New project/viral_video_breakdowns_consolidated.md
TMP_ROOT       = ~/Documents/New project/.tmp_viral
TMP_ROOT_BATCH = ~/Documents/New project/.tmp_viral_batch_28_55
PATTERNS_JSON  = ~/UGC_Two_IG/viral_patterns.json
EXTRACTOR      = ~/UGC_Two_IG/tools/extract-viral-patterns.py
```

---

## Adding New Videos (the normal workflow)

1. Download new viral DM video into `~/Downloads/Viral videos IG/`
2. Name it `Viral_video_56.mp4` (or next available number)
3. In `append_viral_28_55.py`, update the range:
   ```python
   TARGETS = [f'Viral_video_{i}.mp4' for i in range(27, 57) if i != 34]
   ```
4. Run:
   ```bash
   cd "/Users/yumelhernandez/Documents/New project/tools"
   python3 append_viral_28_55.py
   ```
5. Done. `viral_patterns.json` updates automatically. Next `npm run generate` uses the new patterns.

**The script is idempotent.** Already-processed videos are skipped. Re-running is always safe.

---

## What `generate.js` Gets From `viral_patterns.json`

```javascript
vp.hook_patterns.opening_lines_unique   // real viral boy opening lines → augments CURATED_STORY_REPLIES
vp.hook_patterns.girl_response_patterns // real viral girl responses → augments CURATED_GIRL_PUSHBACK
vp.hook_patterns.hook_response_pairs    // [{hook, response}, ...] → few-shot examples in LLM prompt
```

The LLM prompt receives up to 4 hook/response pairs as examples (controlled by `config.prompting.targeted_examples.max_per_call`). This is handled in `lib/llm.js` via the `viralExamples` parameter, which was already wired — the implementation just needed to supply data.

---

## Three Breakdown Formats (for the extractor)

The extractor (`extract-viral-patterns.py`) handles all three formats in priority order:

1. **Frame format** (`t=N.000000s`) — older LLM-authored breakdowns in `docs/viral_video_breakdowns.md`
2. **Shot format** (`N. Shot N (Xs–Ys) — type`) — intermediate format
3. **Segment format** (`N. Segment N (Xs–Ys)` + `side=left/right; color=...; text="..."`) — current batch output from `append_viral_28_55.py`

Sender inference for segment format:
- `side=right` → boy (outgoing bubble)
- `side=left` → girl (incoming bubble)
- `side=center` → UI chrome, skip

---

## Guardrails (Permanent — Apply to Any Future Change)

**G1 — One Consolidated File**
`viral_video_breakdowns_consolidated.md` is the only input to the extractor. New analysis always appends here. `.tmp_*` directories are working space only.

**G2 — `viral_patterns.json` Is the Only Bridge**
`generate.js` reads `viral_patterns.json`. It never reads markdown directly. The extractor is the only thing that produces `viral_patterns.json`. This keeps the two projects loosely coupled.

**G3 — Extract After Every Analysis Run**
Any script that appends new video analysis must call the extractor at the end. `viral_patterns.json` must always be fresh.

**G4 — Smoke Test After Any Pattern or Config Change**
`npm run generate -- --count=1` must succeed before committing changes to `viral_patterns.json`, `config.json`, or curated pools in `generate.js`.

**G5 — One Script Per Video Range**
No two scripts cover the same videos. `append_viral_28_55.py` is canonical for its range. To extend the range, update the existing script — don't create a new one.

**G6 — Paths From `viral_config.py`**
No hardcoded absolute paths in any Python script. All paths import from `New project/tools/viral_config.py`.

**G7 — Spec Documents Have Explicit Roles**
- `Viral_Video_Analysis_Pipeline_PRD_v1.1.md` → architecture reference only
- `viral_breakdown_prompt.md` → operational prompt for manual LLM sessions only
- Neither overrides the other's domain.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `[viral] Loaded 0 hook patterns` | `viral_patterns.json` missing or empty | Run `python3 tools/extract-viral-patterns.py` from UGC_Two_IG |
| Generator errors on API call | `gpt-5.1` not available | Change `rizzai.model` in `config.json` to `gpt-4o` |
| Extractor produces 0 hooks | Segment parser not triggering | Check that `parse_segments()` is in the fallback chain in `extract_all()` |
| Extractor produces garbage hooks | Garbage filter too loose | Add patterns to `UI_NOISE` set in `extract-viral-patterns.py`; lower threshold from 30% |
| `append_viral_28_55.py` fails on a video | ffmpeg/tesseract issue | Check that the video file exists in `~/Downloads/Viral videos IG/`. Delete the video's `section.md` cache to force retry. |
| Consolidated file has duplicate `## Video:` headers | `safe_append()` bypassed | Never write to `viral_video_breakdowns_consolidated.md` directly. Always use `safe_append()`. |
| `validate-viral-mechanics` fails only on `2_arc_integrity` for small test batches (e.g., count=7) | Validator using fixed arc count bands tuned for large batches | Use updated validator (`tests/validate-viral-mechanics.js`) that computes arc count pass/warn bands from `config.json` `arc_distribution` and current batch size. |
| `validate-viral-mechanics` fails on `10_timing_variance` for tiny test batches (e.g., count=3) | Variance thresholds were too strict for very small sample sizes | Updated validator now uses sample-size-aware timing variance thresholds (advisory at very small N). |
| Texmi plug appears too late and references already-resolved chat context | Plug placement was delayed by an 8s minimum/late-shareable heuristic | `remotion/src/utils/timing.ts` now anchors Texmi plug right after pushback, clamped before reveal shot. |
| Texmi plug appears too early (shot 0) while preview shows later chat context | Format `B` plug timing used a `C/D` pushback fallback index (`-1`) instead of resolving actual pushback | Superseded — see "Texmi plug fires after a boy message" row below for the final fix. |
| Texmi suggested response appears after the same response is already shown | In `B`, plug was still inserted too late relative to pushback/reply pair timing | Superseded — see "Texmi plug fires after a boy message" row below for the final fix. |
| Texmi preview shows no girl text (only boy's story reply) | `endIndex = pushbackIndex - 1`; with pushback at index 0 that gives -1, so zero messages added | `remotion/src/Video.tsx`: `endIndex = pushbackIndex` — plug fires after pushback is already on screen, so include it in the preview. |
| Girl's pushback line appears twice on screen in Format B | Solo-shot pair and its following regular pair both reference the same message object; cumulative `flat()` includes it twice | `remotion/src/components/ConversationTimeline.tsx`: cumulative visible-messages build now deduplicates by object reference using a `Set<Message>` before returning the list. |
| Texmi plug fires after a boy message (appears before girl's pushback) | Format B skipped solo-pushback shot insertion; plug placed at `pushbackShotIndex - 1` (the previous pair, ending on a boy line) | `remotion/src/utils/timing.ts` now enables `allowSoloPushback` for Format B (same as C/D). A solo girl-only shot is inserted at the pushback pair; the plug fires immediately after that solo shot. All formats now use `afterShotIndex = pushbackShotIndex` with no special-case offset. |
| Repeated lines across scripts ("this weekend. i'll plan everything" 32×, "prove it" 53×, etc.) — within-batch | `generateBanterMessages()` received no context about previously used lines. `usedBoyLines`/`usedGirlLines` were tracked but only used for post-LLM curated-fallback filtering, never fed back to the LLM prompt. | `tools/lib/llm.js`: added `avoidBoyLines`/`avoidGirlLines` params to `buildBanterPrompt` and `generateBanterMessages`. Prompt now includes "do NOT repeat" sections listing last 25 boy lines and last 20 girl lines. `tools/generate.js`: added `recentBanterBoyLines`/`recentBanterGirlLines` rolling arrays in `run()`; accumulated from `script.messages` after every generation; threaded through `buildScript` → `buildBanterMessages` → `generateBanterMessages`. |
| Same/similar lines still appearing across batch runs ("you typed that with a smile…" variants 13×+) | `recentBanterBoyLines`/`recentBanterGirlLines` reset to `[]` on every new run — no cross-batch memory. | `tools/generate.js` `run()`: at startup, scans the last 14 date dirs (oldest→newest) and pre-populates `recentBanterBoyLines`/`recentBanterGirlLines` from their `messages` arrays. Most recent batches land at the tail so `slice(-25)`/`slice(-20)` in the prompt naturally picks the freshest avoid-list entries. |
| Same story card images reused across batch runs | No cross-batch asset tracking — each run shuffled all 228 images with a fresh seed, so the same images kept landing near the front of different shuffles. | `tools/generate.js` `run()`: at startup, scans all existing `scripts/YYYY-MM-DD/*.json` files to build a `usedStoryAssets` Set of `story.asset` paths. `candidateAssets` is then split into `unusedCandidates` (not yet seen in any prior batch) and `prevUsedCandidates` (already used). Each partition is shuffled independently; unused assets come first in `shuffledAssets`, with previously-used assets as a fallback pool once the fresh supply is exhausted. |
| Same girl pushback / fallback lines repeating at 10+/day volume | All fallback pools were tiny hardcoded arrays (8–30 lines) with no cross-batch repeat tracking. `recentPushbacks` also reset to `[]` each run. | Three-part fix: (1) `recentPushbacks` pre-loaded from last 14 batch dirs at startup (same pattern as banter lines). (2) `tools/generate-line-banks.js` — one-time script that calls the LLM to generate 200 viral-quality lines per category (`girl_pushback`, `girl_mid`, `boy_mid`, `girl_close`, `boy_fallback`), saves to `line_banks.json`. (3) `generate.js`: module-level `bankPool(key, hardcoded)` merges bank entries (first) with hardcoded arrays (last-resort); wired into all 12 pool consumption points (`getPushbackPool`, `getCuratedPushbackPool`, all `pickFallbackLine` call sites). Run `node tools/generate-line-banks.js` once to populate the bank. Re-run periodically to refresh. |

---

## Script-Quality Validation State (Updated 2026-02-20)

`tests/validate-viral-mechanics.js` now scales `2_arc_integrity` by batch size.

Before this update:
- A 7-script run could fail `2_arc_integrity` even when arc mix was reasonable.

After this update:
- Arc gate bands are computed from:
  - `config.json` → `arc_distribution`
  - current batch size (`total_scripts`)
- Report now includes:
  - `gate_results["2_arc_integrity"].expected_distribution`
  - `gate_results["2_arc_integrity"].pass_bands`
  - `gate_results["2_arc_integrity"].warn_bands`

Verification run completed (2026-02-20):
- `npm run generate -- --date=2026-02-20 --count=7`
- `npm run qa -- --date=2026-02-20 --count=7` → `7/7` pass
- `npm run validate-viral-mechanics -- --date=2026-02-20 --min-total=7` → pass, `failure_count=0`

Additional verification run completed (2026-02-20):
- `npm run generate -- --date=2026-02-21 --count=3`
- `npm run qa -- --date=2026-02-21 --count=3` → `3/3` pass
- `npm run validate-viral-mechanics -- --date=2026-02-21 --min-total=3` → pass, `failure_count=0`
- `gate_results["10_timing_variance"]` now includes `sample_size`.

---

## Quick Verification Commands

```bash
# Check pipeline is healthy end-to-end
cd /Users/yumelhernandez/UGC_Two_IG
npm run generate -- --count=1
# Expected: "[viral] Loaded 23 hook patterns" → "Generated 1/1 scripts"

# Check viral_patterns.json stats
python3 -c "
import json
d = json.load(open('viral_patterns.json'))
hp = d['hook_patterns']
print('Videos:', d['meta']['total_videos'])
print('Unique hooks:', hp['total_unique_hooks'])
print('Hook-response pairs:', len(hp['hook_response_pairs']))
print('Sample pairs:')
for p in hp['hook_response_pairs'][:3]:
    print(f'  Boy: {p[\"hook\"]}')
    print(f'  Girl: {p[\"response\"]}')
"

# Check consolidated file
grep -c "^## Video:" ~/Documents/New\ project/viral_video_breakdowns_consolidated.md
# Expected: 32 (as of 2026-02-20; grows as new videos are analyzed)

# Re-run extractor only (if patterns.json gets stale)
python3 tools/extract-viral-patterns.py \
  --input ~/Documents/New\ project/viral_video_breakdowns_consolidated.md \
  --output viral_patterns.json
```

---

## What the Old Handoff Docs Were About (and Why They're Stale)

`LLM_HANDOFF_VIRAL_WORK.md` and `README_FOR_NEXT_LLM.md` were written before `IMPLEMENTATION_PLAN.md` was executed. They described:
- Only the `New project` research arm (UGC_Two_IG was not mentioned)
- The pipeline as broken/disconnected
- `batch_append_breakdowns.py` as an active script (it is now retired)
- An audit task as the next step (that audit was superseded by the implementation)

The full implementation history with decision notes is in `IMPLEMENTATION_PLAN.md`. This document (`CURRENT_STATE.md`) describes what exists now.
