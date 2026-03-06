# Start Here: Viral Pipeline Audit + Continuation

## Status Note (2026-02-20)
- This file is historical context.
- Current source of truth is: `LLM_VIRAL_HANDOFF/CURRENT_STATE.md`.
- Implementation history is: `LLM_VIRAL_HANDOFF/IMPLEMENTATION_PLAN.md`.
- Latest important change after initial implementation: `tests/validate-viral-mechanics.js` now scales `2_arc_integrity` by batch size using `config.json` `arc_distribution`.
- Additional validator update: `10_timing_variance` is now sample-size-aware so tiny test batches (e.g., `count=3`) are not hard-failed for unstable variance.
- Render-timing update: Texmi plug placement is now anchored right after pushback and clamped before reveal (`remotion/src/utils/timing.ts`) to avoid context-mismatch overlays.

You are being pointed to this folder to continue/audit prior work.

## Goal
Do **both**:
1. Understand what was built.
2. Validate whether implementation and outputs match intended spec.

## Files in this folder
- `LLM_HANDOFF_VIRAL_WORK.md` = concise history and architecture progression.
- `LLM_HANDOFF_FILES.json` = authoritative file map and output patterns.

## Required workflow
1. Read `LLM_HANDOFF_VIRAL_WORK.md` first.
2. Read `LLM_HANDOFF_FILES.json` and open the referenced spec + scripts + sample outputs.
3. Run a compliance audit against intended rules in:
   - `Viral_Video_Analysis_Pipeline_PRD_v1.1.md`
   - `viral_breakdown_prompt.md`
4. Report findings in this order:
   - Critical mismatches (spec vs implementation)
   - Output quality failures (e.g., timing provenance, OCR noise, missing assumptions discipline)
   - Data/metadata integrity issues
   - Concrete fixes (file-by-file)
5. If asked to implement fixes, patch scripts and show exact changed files.

## Audit checklist (minimum)
- Are timestamps sourced from ffmpeg `showinfo pts_time` where required?
- Is append/dedupe behavior aligned with Gate 0 intent?
- Are assumption audits present and evidence-bound (`UNVERIFIED` used correctly)?
- Are outputs over-segmented/noisy where they should be consolidated?
- Any incorrect metadata extraction (e.g., `0x0` resolution)?
- Do generated breakdowns reflect the desired structure and rigor?

## Output format expected from you
- `Findings` (severity-ordered)
- `Evidence` (exact file paths + line refs)
- `Fix Plan` (smallest safe changes)
- `Implemented Changes` (if execution requested)
