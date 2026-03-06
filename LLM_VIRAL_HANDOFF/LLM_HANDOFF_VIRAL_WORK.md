# Viral Video Work Handoff (for another LLM)

## Repository state
- Repo path: `/Users/yumelhernandez/Documents/New project`
- Git state: branch `main` with **no commits yet**; history must be inferred from files/artifacts.

## What changed (high-level progression)
1. Early pass: shot-level OCR segmentation from frame hash changes.
- Implemented in `tools/video_breakdown.py`.
- Produces very granular segment-level outputs (`breakdown.md` + `segments.json`) per video.
- Uses `ffmpeg` + `framemd5` + OCR (`pytesseract`) + heuristic UI/text detection.

2. Prompt/spec hardening for viral-analysis quality.
- `viral_breakdown_prompt.md` defines strict gates: scope dedupe, assumption audit, showinfo-based timing, spot checks.
- `Viral_Video_Analysis_Pipeline_PRD_v1.1.md` formalizes architecture: Gate 0, 1fps extraction, optional targeted refine (6-12 fps on flagged seconds), JSON-first validation, append-safe writing.

3. Migration to append-oriented, higher-precision operational batch runs.
- `tools/append_viral_28_55.py` and `tools/batch_append_breakdowns.py` create markdown sections for batches using:
  - `fps=1,showinfo` timeline coverage
  - `select='gt(scene,0.12)',showinfo` scene-change boundaries
  - OCR-based text state merging
  - Assumption audit + facts + timing notes + analysis
- `tools/precompute_30_55.sh` precomputes ffprobe/showinfo/keyframes in parallel for speed.

4. Concrete output accumulation.
- `breakdowns/` contains per-video machine + markdown outputs.
- `.tmp_viral*` and related dirs contain intermediate/generated section drafts and precompute artifacts.
- `docs/viral_video_breakdowns.md` shows an earlier aggregate style (approx shot timing), before stricter gate/timing conventions.

## Current output landscape
- `breakdowns/index.json` currently tracks 54 processed videos/entries.
- Representative newer-style section artifacts are in:
  - `.tmp_viral_batch_28_55/Viral_video_*/section.md`
  - `.tmp_viral/Viral_video_*.section.md`
  - `.tmp_viral26/section26_redo.md`

## Important quality/behavior notes
- Not all generated outputs are equally clean:
  - Some older/generated `breakdown.md` files are ultra-granular and OCR-noisy.
  - Some metadata in older outputs shows `Resolution: 0x0`, indicating ffprobe extraction inconsistency in that run.
- Newer docs/prompt/spec push toward stricter evidence discipline:
  - explicit assumption audit
  - timing provenance from `showinfo pts_time`
  - bounded claims with `UNVERIFIED` where evidence is weak

## Key files and what they do
- Strategy/spec:
  - `/Users/yumelhernandez/Documents/New project/Viral_Video_Analysis_Pipeline_PRD_v1.1.md`
  - `/Users/yumelhernandez/Documents/New project/viral_breakdown_prompt.md`
- Core pipeline script (segment-first generator):
  - `/Users/yumelhernandez/Documents/New project/tools/video_breakdown.py`
- Batch append generators (later workflow):
  - `/Users/yumelhernandez/Documents/New project/tools/append_viral_28_55.py`
  - `/Users/yumelhernandez/Documents/New project/tools/batch_append_breakdowns.py`
- Precompute helper:
  - `/Users/yumelhernandez/Documents/New project/tools/precompute_30_55.sh`
- Generated per-video outputs:
  - `/Users/yumelhernandez/Documents/New project/breakdowns/index.json`
  - `/Users/yumelhernandez/Documents/New project/breakdowns/Viral_video_*/breakdown.md`
  - `/Users/yumelhernandez/Documents/New project/breakdowns/Viral_video_*/segments.json`
- Earlier aggregate output snapshot:
  - `/Users/yumelhernandez/Documents/New project/docs/viral_video_breakdowns.md`
- Intermediate/newer section drafts:
  - `/Users/yumelhernandez/Documents/New project/.tmp_viral_batch_28_55/Viral_video_*/section.md`
  - `/Users/yumelhernandez/Documents/New project/.tmp_viral/Viral_video_*.section.md`
  - `/Users/yumelhernandez/Documents/New project/.tmp_viral26/section26_redo.md`

## Suggested entrypoint for a new LLM
1. Read PRD + prompt first to understand intended constraints and gates.
2. Read batch append scripts to see practical implementation of those constraints.
3. Sample both older and newer outputs before making conclusions (quality varies by run).
4. Treat `breakdowns/index.json` as the best quick map of processed artifacts.
