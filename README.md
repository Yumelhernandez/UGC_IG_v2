# Texmi IG Story Reply Generator (MVP)

This repo implements a local-first pipeline that matches the PRD: generate JSON scripts, QA them, and render a daily batch. Rendering is stubbed unless Remotion is installed.

## Font Setup (Required)
# npm run batch -- --count=7
# "format_distribution": { "B": 0.5, "C": 0.5 } in conifg.json

Instagram messages use **SF Pro** fonts for authentic iOS styling. Download and install fonts first:

```bash
# Check font installation status
cd remotion && node check-fonts.js
```

See [FONT_SETUP.md](FONT_SETUP.md) for detailed instructions on downloading SF Pro from Apple.

## Quick Start
# npm run batch -- --count=1 


- One-time setup (installs Remotion CLI + deps): `npm run setup`
- Generate scripts: `npm run generate -- --date=YYYY-MM-DD`
- QA scripts: `npm run qa -- --date=YYYY-MM-DD`
- Viral mechanics validation: `npm run validate-viral-mechanics -- --date=YYYY-MM-DD`
- Render: `npm run render -- --date=YYYY-MM-DD`
- End-to-end batch: `npm run batch -- --date=YYYY-MM-DD`
- Go-live report artifact: `npm run go-live-report -- --date=YYYY-MM-DD`

## Config

Edit `config.json` to tune counts, duration, format distribution (A/B chat format), random seed behavior, spice distribution, banned phrases, and line length limits.

### Key config knobs

| Setting | Location | What it does |
|---------|----------|--------------|
| `experiments.brainrotStyle.enabled` | `config.json` | Enables the 6 punchline style system. Must be `true` for styles to be assigned. |
| `arc_distribution` | `config.json` | Weights for arc types (`number_exchange`, `rejection`, `plot_twist`, `comedy`, `brainrot`). Must sum to 1.0. `brainrot` arc is implemented but set to `0.00` — leave it unless enabling the brainrot arc type. |
| `format_distribution` | `config.json` | `B` = chat format (short/long), `D` = story format. Currently `B: 0.9, D: 0.1`. |
| `daily_count` | `config.json` | Default count used by the pipeline. `--count=N` on the CLI overrides this. |

### Punchline style system (brainrotStyle)

When `experiments.brainrotStyle.enabled = true`, every Format B slot gets one of 6 structural styles assigned before generation. The style controls the exact conversation arc the LLM must follow, with prescribed "write this EXACT line" directives baked into the prompt (`tools/lib/llm.js`).

**The 6 styles and their key structural moment:**

| Style | Key moment |
|-------|-----------|
| `numeric_reveal` | Boy asks an innocent question → girl answers → "so you already like 73% of me" |
| `list_reveal` | Boy opens: "i got 3 things for you — 1. [X], 2. [Y], 3. ur number" |
| `setup_reframe` | Boy says something alarming → "excuse me??" → reframe to sweet/romantic |
| `persistence_flip` | Boy reframes every rejection ×2+ → girl concedes "omg fine😭" |
| `presumptive_close` | Boy acts like they're already together → "i already told my mom about us" |
| `roast_flip` | "you're mid" → "excuse me??" → "mid as in exactly where i want to be" |

**Style distribution per count** — styles are assigned via `buildBatchPunchlinePlan()` in `tools/batch.js` (hardcoded weights: `numeric_reveal` 20%, `list_reveal` 20%, others 15% each):

| `--count` | Styles assigned |
|-----------|----------------|
| 3 | numeric_reveal, list_reveal, setup_reframe only (other 3 get dropped) |
| 6 | All 6 styles, exactly 1 each |
| 7 | All 6 styles — numeric_reveal gets 2 slots |
| 10 | numeric_reveal ×2, list_reveal ×2, setup_reframe ×2, persistence_flip ×2, presumptive_close ×1, roast_flip ×1 |

**To adjust the style weights:** edit the `distribution` object in `buildBatchPunchlinePlan()` at `tools/batch.js:157`. Weights must sum to 1.0.

**Minimum count for full style coverage: 6.**

## Remotion Template

The Remotion skeleton lives in `remotion/`. To preview and render:

1) `cd remotion`
2) `npm install`
3) `npm run start`

Render a script by passing props with a script JSON payload. Example (from repo root):

```bash
cd remotion
npm run render -- --props='{"script": {"video_id":"2024-01-01-001","meta":{"theme":"tease","duration_s":12,"spice_tier":"medium"},"story":{"username":"maya","age":21,"caption":"late night drive","asset":"baddies/story-001.jpg"},"reply":{"from":"boy","text":"so this is where you disappear to?"},"persona":{"boy":{"name":"Jake","age":20},"girl":{"name":"Maya","age":21}},"messages":[{"from":"girl","text":"maybe. i like the quiet","type_at":2.2},{"from":"boy","text":"quiet? you? never","type_at":3.6},{"from":"girl","text":"keep up then","type_at":5.1},{"from":"boy","text":"that's a challenge","type_at":6.6}]}}'
```

## Notes

- `tools/render.js` requires Remotion. Use `--placeholder` to generate dummy `.mp4` files instead.
- `npm run batch` now strips video metadata after render (best-effort). Requires `ffmpeg` on PATH.
- Render policy: failing QA scripts are never rendered. Batch decisions are logged in `logs/<date>/render-gate.json`.
- QA feedback loop outputs: `logs/<date>/qa-feedback.json` and `logs/<date>/qa-feedback.txt` for top failure reasons + suggested remediation.
- To clean existing renders: `node tools/strip-metadata.js --date=YYYY-MM-DD` (adds `--include-root` to include repo-root `.mp4` files).
- Placeholder assets live in `assets/stories/` as text files with `.jpg` extensions. Replace with real images before production renders.



<!-- Goal

Generate 24 candidates, then pick best 3 for posting.
Commands

Generate batch:
cd /Users/yumelhernandez/UGC_Two_IG

npm run batch -- --count=24 --allow-partial

Rank and select top 3:

npm run select-candidates -- --top=3

How to see top 3
Terminal prints top 3 filenames after step 2.
Also saved at:

Users/yumelhernandez/UGC_Two_IG/logs/YYYY-MM-DD-runname/selected-candidates.json

Read the selected array (ordered #1, #2, #3).
Where rendered videos are

/Users/yumelhernandez/UGC_Two_IG/renders/YYYY-MM-DD-runname/
Match by filename/video ID from selected.
Quick reminder

batch = produce candidates.
select-candidates = tell you which 3 are best. -->