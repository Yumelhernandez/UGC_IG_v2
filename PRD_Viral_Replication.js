const fs = require("fs");
const path = require("path");
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
        BorderStyle, WidthType, ShadingType, PageNumber, PageBreak } = require("docx");

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true, size: 36, font: "Arial" })] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, size: 28, font: "Arial" })] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, font: "Arial" })] });
}
function p(text, opts = {}) {
  return new Paragraph({ spacing: { after: 120 },
    children: [new TextRun({ text, size: 22, font: "Arial", ...opts })] });
}
function bold(text) { return p(text, { bold: true }); }
function code(text) {
  return new Paragraph({ spacing: { after: 80 },
    children: [new TextRun({ text, size: 20, font: "Courier New" })] });
}
function bullet(text, ref = "bullets") {
  return new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 60 },
    children: [new TextRun({ text, size: 22, font: "Arial" })] });
}
function numberedItem(text, ref = "numbers") {
  return new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 60 },
    children: [new TextRun({ text, size: 22, font: "Arial" })] });
}
function tableRow(cells, headerRow = false) {
  return new TableRow({
    children: cells.map((text, i) => new TableCell({
      borders, width: { size: cells.length === 2 ? (i === 0 ? 3000 : 6360) : Math.floor(9360 / cells.length), type: WidthType.DXA },
      shading: headerRow ? { fill: "2B3A4E", type: ShadingType.CLEAR } : undefined,
      margins: cellMargins,
      children: [new Paragraph({ children: [new TextRun({ text, size: 20, font: "Arial", bold: headerRow, color: headerRow ? "FFFFFF" : "000000" })] })]
    }))
  });
}
function makeTable(headers, rows, colWidths) {
  const widths = colWidths || headers.map(() => Math.floor(9360 / headers.length));
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ children: headers.map((h, i) => new TableCell({
        borders, width: { size: widths[i], type: WidthType.DXA },
        shading: { fill: "2B3A4E", type: ShadingType.CLEAR }, margins: cellMargins,
        children: [new Paragraph({ children: [new TextRun({ text: h, size: 20, font: "Arial", bold: true, color: "FFFFFF" })] })]
      })) }),
      ...rows.map(row => new TableRow({ children: row.map((cell, i) => new TableCell({
        borders, width: { size: widths[i], type: WidthType.DXA }, margins: cellMargins,
        children: [new Paragraph({ children: [new TextRun({ text: cell, size: 20, font: "Arial" })] })]
      })) }))
    ]
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers2", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers3", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers4", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers5", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers6", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "UGC_Two_IG \u2014 Viral Replication PRD", size: 18, font: "Arial", color: "888888", italics: true })] })] })
    },
    footers: {
      default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Page ", size: 18, font: "Arial", color: "888888" }), new TextRun({ children: [PageNumber.CURRENT], size: 18, font: "Arial", color: "888888" })] })] })
    },
    children: [

      // ===== TITLE =====
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
        children: [new TextRun({ text: "VIRAL VIDEO REPLICATION SYSTEM", size: 48, bold: true, font: "Arial" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
        children: [new TextRun({ text: "Product Requirements Document", size: 28, font: "Arial", color: "555555" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 },
        children: [new TextRun({ text: "UGC_Two_IG Project \u2014 February 2026", size: 22, font: "Arial", color: "888888" })] }),

      // ===== LIVE LOG =====
      h1("0. Live Implementation Log (Handoff)"),
      p("Purpose: keep this PRD up to date while implementation is in progress so another LLM can resume immediately after disconnects."),
      bold("Current status as of 2026-02-08"),
      bullet("Phase 1 extraction is complete and viral_patterns.json is present."),
      bullet("Phase 2/3 stabilization work is largely already present in code (timing windows, arc_type, hook checks)."),
      bullet("Recent QA logs are passing (examples: 2026-02-05 through 2026-02-08)."),
      bullet("Phase 4 visual rhythm has been implemented (clip overlays, cadence, spice-aware text overlays)."),
      bullet("Phase 5 audio rotation has been implemented (meta.audio_track + Songs sync + renderer fallback selection)."),
      bold("Changes implemented in this session (2026-02-08)"),
      bullet("Added clip overlay component: remotion/src/components/ClipWithOverlay.tsx"),
      bullet("Updated clip constants and overlay pools in remotion/src/constants.ts"),
      bullet("Updated timing logic for 2-4 in-between clips with 0.8-2.2s durations and spice-aware overlays in remotion/src/utils/timing.ts"),
      bullet("Wired in-between clips to render as ClipWithOverlay in remotion/src/Video.tsx"),
      bullet("Updated generation to inject in_between_assets into script meta in tools/generate.js"),
      bullet("Added generator-side audio track assignment from config/discovered Songs assets in tools/generate.js"),
      bullet("Added renderer-side Songs sync and audio fallback assignment in tools/render.js"),
      bullet("Updated video playback to use script meta.audio_track in remotion/src/Video.tsx"),
      bullet("Added config audio_tracks source of truth in config.json"),
      bullet("Added tests/compare-viral.js for generated-vs-viral alignment checks"),
      bullet("Added tests/validate-arc-distribution.js for required arc coverage"),
      bullet("Added test-generation.sh end-to-end validation runner"),
      bullet("Added npm scripts: compare-viral, validate-arcs, validate-pipeline"),
      bullet("Added novelty QA gate for repeated in-script lines in tools/lib/qa.js"),
      bullet("Added novelty QA gate for near-copy viral hooks in tools/lib/qa.js"),
      bullet("Added safety QA gate for high-risk phrase patterns in tools/lib/qa.js"),
      bullet("Added generator-side arc diversity enforcement and configurable arc_distribution in tools/generate.js + config.json"),
      bullet("Added tests/reliability-check.js for schema, timing, asset, and QA consistency validation"),
      bullet("Updated test-generation.sh to include reliability-check in the default pipeline"),
      bullet("Validation evidence: compare-viral passed on 2026-02-12 with 3/3 QA pass and avg messages 10.0 vs viral 9.7"),
      bullet("Validation evidence: arc-distribution gate failed on 2026-02-12 (missing rejection/cliffhanger), proving the gate blocks weak diversity batches"),
      bullet("Validation evidence: arc-distribution passed on 2026-02-13 with 5/5 QA pass and all 4 arc types present"),
      bullet("Validation evidence: compare-viral and reliability-check both passed on 2026-02-13"),
      bullet("Validation evidence: validate-existing-batch.sh completed all gates on 2026-02-13"),
      bullet("Added updated implementation plan focused on novelty-through-mechanics (not copying lines), strict top-2/3 selection, and weekly single-axis experiments"),
      bullet("Added PRD_UPDATE_PROTOCOL.md to standardize cross-LLM handoff updates after each meaningful change"),
      bullet("Validated audio-track script output with scripts/2026-02-10/video-001.json"),
      bullet("Validated render output with audio+clips: renders/2026-02-10/video-001.mp4"),
      bullet("Added an execution handoff checklist: EXECUTION_CHECKLIST_REVISED.md"),
      bullet("Added message-level viral near-copy novelty gate in tools/lib/qa.js using viral_patterns conversation corpus"),
      bullet("Added configurable novelty thresholds and first-gap threshold in config.json script_quality"),
      bullet("Fixed QA pacing false-fail by separating first message gap from later gap checks in tools/lib/qa.js"),
      bullet("Upgraded tools/select-candidates.js with batch duplicate penalties and arc-diverse top-3 selection"),
      bullet("Updated test-generation.sh to run candidate selection as the final pipeline step"),
      bullet("Validation evidence: qa passed 5/5 on 2026-02-14"),
      bullet("Validation evidence: compare-viral passed on 2026-02-14"),
      bullet("Validation evidence: validate-arc-distribution passed on 2026-02-14"),
      bullet("Validation evidence: reliability-check passed on 2026-02-14"),
      bullet("Selection evidence: top-3 on 2026-02-14 are video-004 (plot_twist), video-006 (cliffhanger), video-001 (number_exchange)"),
      bullet("Manual visual QA evidence generated in renders/2026-02-14/qa_manual and renders/2026-02-14/qa_spot"),
      bullet("Synchronized posting renders in renders/2026-02-08 for immediate publishing workflow"),
      bold("Immediate next tasks"),
      numberedItem("Run daily 10-script generation and post only top 2-3 after full gates + manual visual QA.", "numbers"),
      numberedItem("Run one experiment axis per week (for example clip cadence 2 vs 3 messages) while holding other variables fixed.", "numbers"),
      numberedItem("Update pattern weights weekly from live 3s-hold, completion, and shares/1k outcomes.", "numbers"),
      new Paragraph({ children: [new PageBreak()] }),

      // ===== CONTEXT =====
      h1("1. Context & Problem Statement"),
      p("The UGC_Two_IG pipeline generates Instagram DM conversation videos (story reply + flirty banter format) using LLM-generated dialogue rendered via Remotion. Current output gets 30\u2013100 views per video. 107 analyzed viral videos in the same niche achieve 100K\u2013millions of views."),
      p("The gap is threefold:"),
      numberedItem("The visual layer lacks the clip-every-2-messages rhythm that viral videos use. Current pipeline only inserts 1\u20132 stingers at fixed points.", "numbers"),
      numberedItem("The LLM-generated dialogue is too generic and formulaic. All conversations end the same way (girl gives number). No arc variety, no deliberate imperfection.", "numbers"),
      numberedItem("Execution risk remains high without strict handoff state tracking across sessions; stale assumptions can cause duplicate or conflicting changes.", "numbers"),

      // ===== DATA ASSETS =====
      h1("2. Data Assets"),
      h2("2.1 Viral Video Breakdowns"),
      p("File: ~/Documents/viral_videos_breakdowns_consolidated.md (32,067 lines, 2.5MB)"),
      p("Contains second-by-second frame analysis of 107 viral videos. Each video has: assumption audit, facts-only frame breakdown, timing notes, and 7-point analysis (hook mechanics, pattern+payoff, editing rhythm, cognitive load, rewatch triggers, emotional triggers, platform fit)."),
      p("Two format variants exist: 81 videos use frame-by-frame (t=N.000000s), 26 use shot-based (Shot N (start\u2013end))."),

      h2("2.2 Extracted Patterns (viral_patterns.json)"),
      p("Phase 1 output. Machine-readable JSON extracted from the breakdowns:"),
      bullet("89 of 107 videos with extracted dialogue (83% coverage)"),
      bullet("53 unique hook opening lines with girl responses"),
      bullet("321 clip insertion points with timing, type (sports/meme/motivational), and overlay text"),
      bullet("Average 9.7 messages per video, average clip duration 2.1s"),
      bullet("Arc distribution: 61% number_exchange, 20% rejection, 1% plot_twist, 19% unclassified"),
      bullet("107 analysis sections with hook mechanics and engagement pattern data"),

      h2("2.3 Current Pipeline (UGC_Two_IG)"),
      p("Tech stack: Node.js + Remotion (React video renderer). LLM: OpenAI GPT-5.1 at temperature 1.1."),

      makeTable(
        ["Component", "File Path", "Purpose"],
        [
          ["Script Generation", "tools/generate.js", "Orchestrates daily batch: hook + banter + timing"],
          ["LLM Prompts", "tools/lib/llm.js", "STORY_REPLY_SYSTEM_PROMPT + BANTER_SYSTEM_PROMPT"],
          ["QA Validation", "tools/lib/qa.js", "Timing windows, hook format, content safety checks"],
          ["Video Renderer", "remotion/src/Video.tsx", "Main Remotion composition orchestrator"],
          ["Message Display", "remotion/src/components/ConversationTimeline.tsx", "Chat bubble rendering + pair layout"],
          ["Clip Stingers", "remotion/src/components/GifStinger.tsx", "Full-screen GIF/video between messages"],
          ["Timing Engine", "remotion/src/utils/timing.ts", "Frame calculation, pause insertion, duration"],
          ["Config", "config.json", "Duration, format distribution, spice tiers, model settings"],
        ],
        [2500, 3500, 3360]
      ),

      h2("2.4 Audio Assets"),
      p("6 background tracks in the Songs/ directory:"),
      bullet("Cali man.mp3"),
      bullet("Chris Brown - It Depends (Audio) ft. Bryson Tiller.mp3"),
      bullet("HEATHER MR TAKE THAT RISK.mp3"),
      bullet("old_school.mp3"),
      bullet("ovo.mp3"),
      bullet("what the helly.mp3"),
      p("Currently only one track is used (she_know_she_wants_it.mp4, hardcoded in Video.tsx)."),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== PHASE 1 =====
      h1("3. Phase 1: Extract Viral Patterns (COMPLETE)"),
      p("Status: COMPLETE. Script: tools/extract-viral-patterns.py. Output: viral_patterns.json."),

      h2("3.1 What Was Built"),
      p("A Python script that parses the 32K-line markdown into structured JSON. It handles two format variants (frame-by-frame and shot-based), extracts dialogue with sender attribution (boy=right/purple, girl=left/gray), identifies clip insertion points by detecting background transitions from chat UI to sports/meme content, and classifies conversation arc types."),

      h2("3.2 Output Structure"),
      code("viral_patterns.json contains:"),
      bullet("videos[]: 107 entries with conversation.messages[], clips[], arc_type, analysis{}"),
      bullet("hook_patterns: opening_lines_unique (53), girl_response_patterns, hook_response_pairs"),
      bullet("timing_rhythms: avg 9.7 msgs/video, 2.1s avg clip duration, 3.0 msgs between clips"),
      bullet("arc_distribution: {number_exchange: 0.61, rejection: 0.20, plot_twist: 0.01, unknown: 0.19}"),
      bullet("analysis_synthesis: aggregated hook_mechanics, editing_rhythm, emotional_triggers examples"),

      h2("3.3 Key Findings From Extraction"),
      bullet("Viral videos average 3 clips per video, inserted every 2\u20133 messages"),
      bullet("Clips are predominantly sports-related (basketball memes, NBA footage)"),
      bullet("78% of clips have overlay text (e.g., \"WATCH ME SHOOT MY SHOT\")"),
      bullet("Most viral hooks are sexually provocative or use shock value (not the safe formulas currently in the pipeline)"),
      bullet("Conversations are shorter than expected: 8\u201312 messages typical, not 17+ like Format D"),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== PHASE 2 =====
      h1("4. Phase 2: Fix Broken Pipeline"),
      p("Goal: Restore >80% QA pass rate. Status update (2026-02-08): this phase appears largely complete in the current codebase and logs."),

      h2("4.1 Root Causes"),
      makeTable(
        ["Issue", "Cause", "Frequency"],
        [
          ["win_time out of window", "Format B win window [12,18]s is too tight. Scripts have final messages at 17\u201319s which exceeds the max.", "93% of failures"],
          ["hook not in proven format", "Hook validation checks for exact keyword matches (\"how to\", \"watch this\") but generated hooks like \"How to f*ck her mind\" aren't in hook_lines.md.", "65% of failures"],
        ],
        [2500, 5360, 1500]
      ),

      h2("4.2 Implementation"),
      h3("4.2.1 Fix config.json timing windows"),
      code("File: config.json"),
      p("Widen Format B win window from [12, 18] to [12, 21] to accommodate actual video durations (17\u201324s). Widen Format D win window from [10, 18] to [10, 22]. Add per-message minimum gap validation of 0.5s."),

      h3("4.2.2 Fix tools/lib/qa.js timing validation"),
      code("File: tools/lib/qa.js (lines 14\u201319: DEFAULT_TIMING_WINDOWS)"),
      p("Change the win_time validation to be relative to the actual meta.duration_s value. If win_time is within 1s of the total video duration, it should pass (the last message is expected near the end). Add strict validation that all message type_at values are monotonically increasing with minimum 0.5s gaps."),

      h3("4.2.3 Fix tools/lib/qa.js hook validation"),
      code("File: tools/lib/qa.js (the usesProvenHookFormat function)"),
      p("Expand the proven format patterns to include more viral hook structures. Match case-insensitively. Allow hooks that match patterns from viral_patterns.json hook_patterns.opening_lines_unique in addition to hook_lines.md. Add patterns: \"when\", \"the way\", \"if you\", \"sliding\", \"rizz\", \"dm\", \"shooting\", \"texting\"."),

      h3("4.2.4 Add tools/lib/qa-debug.js"),
      code("File: tools/lib/qa-debug.js (NEW)"),
      p("Detailed failure reporting module. Each QA failure gets a severity level (critical vs warning), the specific field that failed, the expected vs actual value, and a suggested fix. This helps diagnose issues without digging through logs."),

      h2("4.3 Success Criteria"),
      bullet("Run npm run generate -- --count=50 followed by npm run qa"),
      bullet("QA pass rate must be >80%"),
      bullet("No regression on previously passing scripts"),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== PHASE 3 =====
      h1("5. Phase 3: Upgrade Conversation Generation"),
      p("Goal: Replace generic LLM prompts with few-shot examples from viral patterns. Add arc variety and deliberate imperfection."),

      h2("5.1 Few-Shot Story Reply Prompts"),
      code("File: tools/lib/llm.js (STORY_REPLY_SYSTEM_PROMPT, lines 4\u201387)"),
      p("Load viral_patterns.json at module startup. For each generation call, randomly sample 3\u20135 viral hook examples as few-shot demonstrations. Keep the 6 formula categories (fake legal, double meaning, presumptive, absurd question, bold dare, roast) but populate examples from actual viral hooks instead of hand-written ones. This gives the LLM concrete tone and length targets without being rigid."),
      p("The sampling should be seeded by video_id for reproducibility. Different videos get different example sets, creating natural variety across a daily batch."),

      h2("5.2 Arc Variety in Banter Generation"),
      code("File: tools/lib/llm.js (BANTER_SYSTEM_PROMPT, lines 89\u2013125)"),
      p("Add arc_type field to script JSON metadata. Four arc types with configurable distribution:"),
      makeTable(
        ["Arc Type", "Distribution", "Ending Description"],
        [
          ["number_exchange", "34%", "Boy asks for number/date. Girl gives it with a tease: \"don't blow it\", \"555 XXX XXXX\"."],
          ["rejection", "22%", "Girl firmly declines. Boy takes it gracefully or doubles down with humor: \"solid effort though\"."],
          ["plot_twist", "25%", "Unexpected reveal changes the frame: \"oh wait i know you\", \"that's my sister\"."],
          ["cliffhanger", "19%", "Conversation cuts off unresolved. Typing indicator or ambiguous final line."],
        ],
        [2000, 1500, 5860]
      ),
      p("Each arc type gets its own ending instructions injected into the banter system prompt. Weighted random selection per video, seeded by video_id."),
      code("File: tools/generate.js"),
      p("Modify the generateBanterMessages call to accept arcType parameter. Add weighted random arc selection using config.json distribution weights."),

      h2("5.3 Deliberate Imperfection Module"),
      code("File: tools/lib/llm.js (NEW function: addImperfection)"),
      p("Post-processing function applied to LLM output. Randomly applies: lowercase inconsistency (30% chance), emoji insertion from Gen-Z set (20% chance), punctuation removal (15% chance), slang contractions like \"you're\" to \"youre\" (10% chance). Imperfection level tied to spice tier: low=0.2, medium=0.4, high=0.6. Girl messages get slightly more imperfection than boy messages."),

      h2("5.4 Message Count Alignment"),
      code("File: config.json (banter.num_messages)"),
      p("Change from fixed counts to ranges: Format B: 7\u201311 messages (was fixed at 9). Format D: 15\u201319 (was fixed at 17). Random selection per video within range. This matches viral video data showing 8\u201312 messages typical."),

      h2("5.5 Success Criteria"),
      bullet("Generate 20 test scripts with npm run generate -- --count=20"),
      bullet("QA pass rate remains >80%"),
      bullet("All 4 arc types appear in the 20-script batch"),
      bullet("Spot-check: dialogue feels more natural (imperfection visible)"),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== PHASE 4 =====
      h1("6. Phase 4: Upgrade Visual Layer"),
      p("Goal: Add clip insertions between every 2\u20133 messages with overlay text. This is likely the single biggest gap between current output and viral videos."),

      h2("6.1 New Component: ClipWithOverlay.tsx"),
      code("File: remotion/src/components/ClipWithOverlay.tsx (NEW, ~100 lines)"),
      p("React component that renders a full-screen video or GIF clip with text overlay. Props: src (asset path), overlayText, startFrame, durationInFrames, fit (cover/contain), textColor (white), fontSize (44\u201348px), fontWeight (bold). Supports fade in/out (6 frames each via Remotion interpolate). Text has dark shadow for readability. Auto-detects video vs GIF from file extension."),

      h2("6.2 Expanded Timing System"),
      code("File: remotion/src/utils/timing.ts (MODIFY, +150\u2013200 lines)"),
      p("New function: generateClipInsertionPlan(script, viralPatterns, fps). Inserts clip pauses every 2\u20133 messages (matching viral rhythm from extraction data). Each clip: 0.8\u20132.2s duration, randomized around 1.6s average. 0.2s buffer between message end and clip start to prevent overlap. Clip insertion data stored in script JSON for deterministic rendering."),
      p("Overlay text selected contextually from a pool: \"WATCH THIS\", \"PAY ATTENTION\", \"DID YOU SEE THAT\", \"LOOK AT HIM GO\" (low spice); \"SHUT UP\", \"HE'S UNHINGED\", \"SHE WASN'T READY\" (high spice)."),

      h2("6.3 Wiring Into Video.tsx"),
      code("File: remotion/src/Video.tsx (MODIFY, +50 lines)"),
      p("Map clip insertions into the Remotion Sequence timeline. Clips render as full-screen overlays between message pair displays. Total video duration recalculated to account for clip insertion time. The conversationFrame offset adjusts for accumulated pause durations."),

      h2("6.4 Clip Selection"),
      code("File: tools/lib/clip-selector.js (NEW, ~80 lines)"),
      p("Selects clips from existing assets: frames/video_one/ through frames/video_five/ (105+ PNGs), GIFs (Basketball Shooting, Michael Jordan Dunk, Take That Ronaldo, Watch This), and Viral_video_*.mp4 files. Deterministic selection seeded by video_id to ensure reproducibility."),

      h2("6.5 Updated Types"),
      code("File: remotion/src/types.ts (MODIFY)"),
      p("Add ClipInsertion type: { startTime: number, durationS: number, overlayText: string, messageIndex: number, clipSrc: string }. Add optional clips field to VideoScript type."),
      code("File: remotion/src/constants.ts (MODIFY)"),
      p("Add: CLIP_FREQUENCY_MESSAGES = 2.3, CLIP_MIN_DURATION_S = 0.8, CLIP_MAX_DURATION_S = 2.2, CLIP_FADE_IN_FRAMES = 6, CLIP_FADE_OUT_FRAMES = 6."),

      h2("6.6 Success Criteria"),
      bullet("Render 5 test videos with npm run render -- --count=5"),
      bullet("Each video shows 2\u20134 clip insertions between messages"),
      bullet("Overlay text is readable (white on dark, proper shadow)"),
      bullet("No timing conflicts between clips and message bubbles"),
      bullet("Total duration matches expected value (message time + clip time)"),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== PHASE 5 =====
      h1("7. Phase 5: Audio Rotation"),
      p("Goal: Rotate through 6 Songs/ tracks instead of one hardcoded track."),

      h2("7.1 Implementation"),
      code("File: tools/generate.js"),
      p("Add meta.audio_track field to script JSON. Randomly select from the 6 available tracks, seeded by video_id. Add audio_tracks array to config.json so new tracks can be added without code changes."),
      code("File: remotion/src/Video.tsx (line ~160 where audio is loaded)"),
      p("Read meta.audio_track from script. Load the selected track from Songs/ directory instead of the hardcoded she_know_she_wants_it.mp4. Use Remotion Audio component with volume 0.3."),
      code("File: tools/render.js"),
      p("Ensure Songs/ files are accessible to Remotion during render. Copy or symlink to remotion/public/assets/sfx/ if needed. Verify audio file exists before render."),
      code("File: config.json"),
      p("Add audio_tracks array listing all 6 filenames. This becomes the source of truth for available tracks."),

      h2("7.2 Success Criteria"),
      bullet("Generate 6 test scripts; verify each has a different audio_track value"),
      bullet("Render 2 videos; confirm audio plays correctly and is different per video"),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== PHASE 6 =====
      h1("8. Phase 6: Testing & Validation"),
      p("Goal: End-to-end validation that the upgraded pipeline produces videos matching viral quality."),

      h2("8.1 Automated Tests"),
      code("File: tests/compare-viral.js (NEW)"),
      p("Compares generated scripts against viral_patterns.json. Checks: message count within viral range (8\u201312), timing gaps match viral pacing, arc type distribution across batch, imperfection score > 0.4."),
      code("File: tests/validate-arc-distribution.js (NEW)"),
      p("Verifies all 4 arc types appear in a 10-script batch. Fails if any type is missing."),
      code("File: test-generation.sh (NEW)"),
      p("End-to-end script: generate 10 scripts, run QA, render 2 videos, run compare-viral analysis, validate arc distribution."),

      h2("8.2 Manual QA Checklist"),
      bullet("Clips appear every 2\u20133 messages with readable overlay text"),
      bullet("Audio track varies across videos"),
      bullet("Dialogue feels human (lowercase inconsistency, emoji, fragments visible)"),
      bullet("Arc variety present (not all videos end with number exchange)"),
      bullet("Hook lines are provocative and scroll-stopping"),
      bullet("Video duration matches script metadata"),
      bullet("No rendering glitches, timing overlaps, or audio cutoffs"),

      h2("8.3 Success Metrics"),
      makeTable(
        ["Metric", "Target", "Measurement"],
        [
          ["QA pass rate", ">80%", "npm run qa output"],
          ["Arc diversity", "All 4 types in 10-video batch", "validate-arc-distribution.js"],
          ["Message count", "8\u201312 per video (Format B)", "compare-viral.js"],
          ["Clip rhythm", "2\u20134 clips per video", "Visual inspection of rendered output"],
          ["Dialogue imperfection", "Score > 0.4", "Automated lowercase/emoji/fragment detection"],
          ["View improvement", "3\u20135x over baseline (30\u2013100 views)", "Platform analytics after posting"],
        ],
        [2500, 3000, 3860]
      ),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== RISKS =====
      h1("9. Known Risks & Mitigations"),
      makeTable(
        ["Risk", "Impact", "Mitigation"],
        [
          ["No view count data to weight patterns", "May optimize toward mediocre patterns", "Treat all 107 equally initially, then use own posting data to adjust weights"],
          ["Only first 30s analyzed (many videos 60\u201388s)", "Missing late-video patterns", "Focus on first 30s which determines retention; our videos are 17\u201324s anyway"],
          ["Few-shot examples make LLM output derivative", "Reduces novelty", "Random sampling of 3\u20135 examples per call (not all 107), plus imperfection layer"],
          ["Clip insertions break message timing", "Videos glitch", "0.2s buffer between message end and clip start; extensive render testing"],
          ["Audio sync issues across track lengths", "Audio cuts off or loops", "Use Remotion built-in Audio component which handles looping; volume 0.3"],
          ["Audience detects AI patterns at 10/day", "Views plateau", "4 arc types + imperfection + clip randomization = structural variation"],
          ["Breakdowns have no audio analysis", "Missing ~40% of virality signal", "Curate 20\u201330 trending sounds separately; rotate through Songs/ tracks"],
        ],
        [2800, 2000, 4560]
      ),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== DEPENDENCY GRAPH =====
      h1("10. Implementation Order & Dependencies"),
      p("Phase 1 (Extract) \u2192 Phase 2/3 stabilization (mostly complete) \u2192 Phase 4 (Clips, in progress) \u2192 Phase 5 (Audio) \u2192 Phase 6 (Test)."),
      p("Phase 4 and Phase 5 can proceed in parallel once render timing remains stable."),
      p("Current blocker focus: complete Phase 5 audio rotation and finish render validation for new clip overlays."),

      h2("10.1 File Change Summary"),
      makeTable(
        ["File", "Change Type", "Phase", "Est. Lines"],
        [
          ["tools/extract-viral-patterns.py", "NEW", "1 (DONE)", "~500"],
          ["viral_patterns.json", "GENERATED", "1 (DONE)", "~5000+"],
          ["config.json", "MODIFY", "2, 3, 5", "+30"],
          ["tools/lib/qa.js", "MODIFY", "2", "+150"],
          ["tools/lib/qa-debug.js", "NEW", "2", "~80"],
          ["tools/lib/llm.js", "MODIFY", "3", "+300"],
          ["tools/generate.js", "MODIFY", "3, 5", "+150"],
          ["remotion/src/components/ClipWithOverlay.tsx", "NEW", "4", "~100"],
          ["remotion/src/utils/timing.ts", "MODIFY", "4", "+200"],
          ["remotion/src/Video.tsx", "MODIFY", "4, 5", "+80"],
          ["remotion/src/types.ts", "MODIFY", "4", "+20"],
          ["remotion/src/constants.ts", "MODIFY", "4", "+15"],
          ["tools/lib/clip-selector.js", "NEW", "4", "~80"],
          ["tests/compare-viral.js", "NEW", "6", "~200"],
          ["tests/validate-arc-distribution.js", "NEW", "6", "~80"],
          ["test-generation.sh", "NEW", "6", "~30"],
        ],
        [3500, 1500, 1500, 2860]
      ),
      p("Total new code: ~2,000 lines. Total modified code: ~700 lines."),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== APPENDIX =====
      h1("Appendix A: Viral Patterns Data Summary"),
      p("Extracted from viral_patterns.json (Phase 1 output)."),

      h2("A.1 Sample Viral Hooks (First 15 of 53)"),
      numberedItem("mommy?", "numbers2"),
      numberedItem("not to be dramatic but i think this just reset my standards", "numbers2"),
      numberedItem("whatever spell you're casting, it's working", "numbers2"),
      numberedItem("i just looked at this pic for so long i forgot where i was", "numbers2"),
      numberedItem("if being fine was a crime, you'd be serving back-to-back life sentences", "numbers2"),
      numberedItem("is your reflection single or is she also ignoring me?", "numbers2"),
      numberedItem("i just stared at this like it owed me something", "numbers2"),
      numberedItem("i just know you ruin people's lives and sleep like a baby", "numbers2"),
      numberedItem("you look like you left three hearts broken just walking in", "numbers2"),
      numberedItem("are you trying to break the internet or just test my self-control?", "numbers2"),
      numberedItem("this hallway lucky af", "numbers2"),
      numberedItem("how long does a mirror selfie have to last before it files a restraining order?", "numbers2"),
      numberedItem("are you the girl from that movie?", "numbers2"),
      numberedItem("crazy how i still feel like that belongs to me", "numbers2"),
      numberedItem("do you like books?", "numbers2"),

      h2("A.2 Clip Insertion Timing Pattern"),
      p("Across 107 videos, clips appear at these positions relative to the conversation:"),
      bullet("After message 1 (hook): 78% of videos (the \"WATCH ME SHOOT MY SHOT\" meme)"),
      bullet("After message 3\u20134 (first exchange): 65% of videos (motivational quote or reaction meme)"),
      bullet("After message 6\u20138 (midpoint): 54% of videos (escalation meme)"),
      bullet("After final message (celebration/reaction): 42% of videos"),
      p("Average clip duration: 2.1 seconds. Average gap between clips: 2.3 messages."),

      h2("A.3 Analysis Synthesis (From 107 Videos)"),
      bold("Hook Mechanics:"),
      p("Viral hooks leverage immediate sexual tension, shock value, or absurd boldness in the first 1\u20133 seconds. The most effective pattern is a provocative DM reply to a girl's story paired with an attractive photo, followed by a sports metaphor overlay (\"SHOOT MY SHOT\") at t=3\u20134s."),
      bold("Editing Rhythm:"),
      p("Viral videos alternate between static chat screenshots (2\u20133 seconds each) and reaction clips (1\u20132 seconds), creating a call-and-response rhythm. Each chat section builds tension before cutting to a meme that provides comedic relief. This predictable yet effective pacing maintains engagement throughout."),
      bold("Emotional Triggers:"),
      p("Content triggers curiosity through sexual tension (t=0\u20137), surprise through unexpected vulnerability or boldness (t=10\u201312), anticipation through escalating flirtation (t=13\u201326), and satisfaction through the final punchline or number exchange (t=27+). Sports memes provide emotional release valves that prevent oversaturation."),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  const outPath = path.join(__dirname, "PRD_Viral_Replication.docx");
  fs.writeFileSync(outPath, buffer);
  console.log("PRD written successfully");
});
