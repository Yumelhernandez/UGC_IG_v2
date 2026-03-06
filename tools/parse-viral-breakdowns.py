#!/usr/bin/env python3
"""
parse-viral-breakdowns.py

Parses viral_video_breakdowns_unique_MASTER.md and extracts structured
conversation data from each video into viral_examples.json.

Output format per video:
{
  "video_id": "Viral_video_one",
  "opener": "are u still mad?",        // boy's first message
  "conversation": [                     // full thread, deduplicated in order
    {"from": "boy", "text": "are u still mad?"},
    {"from": "girl", "text": "yes"},
    ...
  ],
  "ai_card_punchline": "the rest is 69",  // AURA AI / PlugAI button text if present
  "hook_text": "How to text huzz",        // intro overlay if present
  "arc_type": "punchline",               // inferred arc type
  "pivot_setup": "Burger or Pizza?",      // if pivot arc detected
  "pivot_punchline": "just collecting information for our first date"
}

Usage:
  python3 tools/parse-viral-breakdowns.py
  python3 tools/parse-viral-breakdowns.py --input viral_video_breakdowns_unique_MASTER.md
  python3 tools/parse-viral-breakdowns.py --out viral_examples.json
"""

import re
import json
import sys
import os
from collections import OrderedDict

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_INPUT = os.path.join(ROOT, "viral_video_breakdowns_unique_MASTER.md")
DEFAULT_OUTPUT = os.path.join(ROOT, "viral_examples.json")

args = sys.argv[1:]
input_file = DEFAULT_INPUT
output_file = DEFAULT_OUTPUT
for i, a in enumerate(args):
    if a == "--input" and i + 1 < len(args):
        input_file = args[i + 1]
    if a == "--out" and i + 1 < len(args):
        output_file = args[i + 1]

# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------
VIDEO_HEADER = re.compile(r'^##\s+Video:\s+(.+?)(?:\.mp4)?$', re.IGNORECASE)

# Quote capture — matches straight ", curly ", or backtick ` as opener/closer
# Note: backtick content with inner " may be truncated; backtick-specific patterns run first
_QA = r'["\u201c`](.+?)["\u201d`]'      # any open → any close (mixed)
_QB = r'`([^`]+)`'                        # backtick-specific (no inner-backtick)
_QD = r'"([^"]+)"'                        # straight-quote-specific

# ── Format A: "Outgoing/Incoming bubble (right, blue): "text"" ──────────────
# Also catches "Outgoing (right, ...): "text"" and "Incoming (left, ...): "text""
BUBBLE_A_OUT = re.compile(
    r'(?:Outgoing)\s+(?:bubble|[^:]*?)\s*(?:\([^)]*\))?\s*:\s*' + _QA, re.IGNORECASE)
BUBBLE_A_IN = re.compile(
    r'(?:Incoming)\s+(?:bubble|response|[^:]*?)\s*(?:\([^)]*\))?\s*:\s*' + _QA, re.IGNORECASE)

# ── Format B: "right bubble (color: purple): "text"" ─────────────────────────
# Uses (?:\([^)]*\))? to handle parenthetical (color: ...) without inner-colon breaking match
# Also handles "Right (purple) bubble: "text"" where parens come before "bubble"
BUBBLE_B_RIGHT = re.compile(
    r'(?<!\w)right\s*(?:\([^)]*\))?\s*bubble[s]?\s*(?:\([^)]*\))?\s*:\s*' + _QA, re.IGNORECASE)
BUBBLE_B_LEFT = re.compile(
    r'(?<!\w)left\s*(?:\([^)]*\))?\s*bubble[s]?\s*(?:\([^)]*\))?\s*:\s*' + _QA, re.IGNORECASE)

# ── Format C: "Right-side purple bubble [stuff]: "text"" (videos 7+) ─────────
# Handles: right-side/left-side, optional "New " prefix, optional bubble keyword,
# various adjectives (purple, dark gray, larger, outgoing, etc.)
# Backtick version runs first so content with inner " is captured fully.

# Right-side patterns (boy)
_C_RIGHT_LABEL = r'(?:new\s+)?right[- ]side\s+[^:]*'
BUBBLE_C_RIGHT_BT = re.compile(_C_RIGHT_LABEL + r':\s*' + _QB, re.IGNORECASE)
BUBBLE_C_RIGHT    = re.compile(_C_RIGHT_LABEL + r':\s*' + _QA, re.IGNORECASE)

# Left-side patterns (girl)
_C_LEFT_LABEL = r'(?:new\s+)?left[- ]side\s+[^:]*'
BUBBLE_C_LEFT_BT = re.compile(_C_LEFT_LABEL + r':\s*' + _QB, re.IGNORECASE)
BUBBLE_C_LEFT    = re.compile(_C_LEFT_LABEL + r':\s*' + _QA, re.IGNORECASE)

# ── Format C shorthand without "bubble" keyword ───────────────────────────────
# e.g. "Right-side purple: "text"" or "Left-side dark gray: "text""
# (These are already caught by BUBBLE_C_RIGHT/LEFT above since [^:]* allows no bubble)

# ── Inline shorthand (no "side"): "Right purple: "text"" or "Right purple bubble: "text"" ──
# Also catches "Right blue bubble: "text"". Makes "bubble" optional.
BUBBLE_INLINE_RIGHT = re.compile(
    r'(?<!\w)right\s+(?:purple|blue)\s*(?:bubble)?\s*[^:"]*:\s*' + _QA, re.IGNORECASE)
BUBBLE_INLINE_LEFT = re.compile(
    r'(?<!\w)left\s+(?:dark\s+gray|dark)\s*(?:bubble)?\s*[^:"]*:\s*' + _QA, re.IGNORECASE)

# ── Second-by-second format: "right purple bubble with/containing "text"" ─────
# Seen in per-second logs: "Bubble layout/colors/sides: Right purple bubble with "text""
BUBBLE_WITH_RIGHT = re.compile(
    r'(?:right|outgoing)\s+(?:purple|blue)\s+bubble\s+(?:with|containing)\s+' + _QA, re.IGNORECASE)
BUBBLE_WITH_LEFT = re.compile(
    r'(?:left|incoming)\s+(?:dark\s+gray|dark)\s+bubble\s+(?:with|containing)\s+' + _QA, re.IGNORECASE)

# ── "One right-side purple bubble containing "text"" ─────────────────────────
BUBBLE_ONE_RIGHT = re.compile(
    r'(?:one\s+)?right[- ]side\s+purple\s+bubble\s+(?:containing|with)\s+' + _QA, re.IGNORECASE)

# ── "Right/Left bubbles:" plural shorthand ───────────────────────────────────
BUBBLE_PLURAL_RIGHT = re.compile(
    r'(?<!\w)right(?:[- ]side)?\s+(?:purple\s+)?bubbles\s*:\s*' + _QA, re.IGNORECASE)
BUBBLE_PLURAL_LEFT = re.compile(
    r'(?<!\w)left(?:[- ]side)?\s+(?:dark\s+gray\s+)?bubbles\s*:\s*' + _QA, re.IGNORECASE)

# ── AURA AI / PlugAI card punchline (big CTA button) ─────────────────────────
AI_BUTTON = re.compile(
    r'(?:CTA\s+pill\s+button[^:]*|Large\s+(?:right[- ]side\s+)?blue\s+bubble[^:]*|Button)\s*:\s*'
    r'["\u201c\u2018`](.+?)["\u201d\u2019`]', re.IGNORECASE)
AI_BUTTON_ALT = re.compile(
    r'(?:CTA\s+pill\s+button|pill\s+button)[^"]*"([^"]+)"', re.IGNORECASE)

# ── Hook/intro overlay text ───────────────────────────────────────────────────
HOOK_OVERLAY = re.compile(
    r'(?:overlay\s+text|centered\s+overlay\s+text|caption)[^:]*:\s*'
    r'["\u201c\u2018`]([^"\u201d\u2018`]+?)["\u201d\u2018`]',
    re.IGNORECASE
)

# ── "Bubble layout/colors/sides:" line handler ───────────────────────────────
# Per-second logs use: "Bubble layout/colors/sides (for each visible bubble): One purple bubble
# on the right reading "text"; two dark gray bubbles on the left reading "a" and "b"."
_BUBBLE_LAYOUT_LINE = re.compile(r'Bubble layout[^:]*:', re.IGNORECASE)

# ── "reading "text"" and "containing "text"" patterns (per-second format) ────
# Used when processing per-part segments split by semicolons
_READING_Q = re.compile(r'(?:reading|containing)\s+' + _QA)
_IS_RIGHT = re.compile(r'\b(?:purple|right)\b', re.IGNORECASE)
_IS_LEFT  = re.compile(r'\b(?:dark\s*gr[ae]y|left)\b', re.IGNORECASE)

# ── Format D: side-context detection for bullet sub-items ────────────────────
# When a line is "- New right-side purple bubbles:" (no text after colon), subsequent
# indented bullet items "  - "text" (pts_time...)" inherit that side.
_D_RIGHT_HEADER = re.compile(r'(?:new\s+)?right[- ]side\s+\w', re.IGNORECASE)
_D_LEFT_HEADER  = re.compile(r'(?:new\s+)?left[- ]side\s+\w', re.IGNORECASE)
_D_INC_HEADER   = re.compile(r'Incoming\s+(?:response\s+)?(?:\([^)]*\))?\s*:', re.IGNORECASE)
_D_OUT_HEADER   = re.compile(r'Outgoing\s+(?:\([^)]*\))?\s*:', re.IGNORECASE)
_D_BULLET_QUOTE = re.compile(r'^-\s+["\u201c`](.+?)["\u201d`]')   # "- "text" ..."
_SECTION_RESET  = re.compile(r'^#{2,}\s+')                          # ## heading

# ── Pivot question detection ──────────────────────────────────────────────────
PIVOT_QUESTION_RE = re.compile(
    r'^((?:do you|are you|quick[,.]?\s+\w+|serious question|random\s+\w+|be honest)[^\n]{0,80}\?|'
    r'(?:burger|pizza|steak|pasta|coffee|tea|water|food|favorite|sushi)[^\n]{0,60}\?)',
    re.IGNORECASE
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def clean_text(t):
    """Normalize extracted text."""
    if not t:
        return ""
    t = t.strip().strip('"\'`').strip('\u201c\u201d\u2018\u2019')
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def _add(seen, text, sender):
    """Add to ordered dict only if not already present."""
    if text and text not in seen:
        seen[text] = sender


# ---------------------------------------------------------------------------
# Parse file into video sections
# ---------------------------------------------------------------------------
def split_sections(text):
    """Split markdown into per-video sections."""
    sections = []
    current_name = None
    current_lines = []
    for line in text.splitlines():
        m = VIDEO_HEADER.match(line.strip())
        if m:
            if current_name:
                sections.append((current_name, "\n".join(current_lines)))
            current_name = m.group(1).strip()
            current_lines = [line]
        elif current_name:
            current_lines.append(line)
    if current_name:
        sections.append((current_name, "\n".join(current_lines)))
    return sections


# ---------------------------------------------------------------------------
# Bubble extraction — handles all 4 formats
# ---------------------------------------------------------------------------
def extract_bubbles(section_text):
    """
    Extract ordered conversation from a video section.
    Returns list of {"from": "boy"|"girl", "text": str} dicts.
    Deduplicates while preserving first-appearance order.
    """
    seen = OrderedDict()
    current_side = None   # for Format D bullet sub-items

    for line in section_text.splitlines():
        stripped = line.strip()

        # Reset side context at new section/segment headers
        if _SECTION_RESET.match(stripped):
            current_side = None

        # ── Direct-match passes (text on same line as label) ──────────────
        found = False

        # Format C (backtick-first to avoid inner-quote truncation)
        for m in BUBBLE_C_RIGHT_BT.finditer(stripped):
            txt = clean_text(m.group(1))
            _add(seen, txt, "boy")
            if txt:
                found = True; current_side = "boy"
        for m in BUBBLE_C_LEFT_BT.finditer(stripped):
            txt = clean_text(m.group(1))
            _add(seen, txt, "girl")
            if txt:
                found = True; current_side = "girl"

        # Format A (Outgoing/Incoming)
        for m in BUBBLE_A_OUT.finditer(stripped):
            txt = clean_text(m.group(1))
            _add(seen, txt, "boy")
            if txt:
                found = True; current_side = "boy"
        for m in BUBBLE_A_IN.finditer(stripped):
            txt = clean_text(m.group(1))
            _add(seen, txt, "girl")
            if txt:
                found = True; current_side = "girl"

        # Format B (right/left bubble with optional parens)
        for m in BUBBLE_B_RIGHT.finditer(stripped):
            txt = clean_text(m.group(1))
            _add(seen, txt, "boy")
            if txt:
                found = True; current_side = "boy"
        for m in BUBBLE_B_LEFT.finditer(stripped):
            txt = clean_text(m.group(1))
            _add(seen, txt, "girl")
            if txt:
                found = True; current_side = "girl"

        # Format C (general — after backtick pass)
        for m in BUBBLE_C_RIGHT.finditer(stripped):
            txt = clean_text(m.group(1))
            _add(seen, txt, "boy")
            if txt:
                found = True; current_side = "boy"
        for m in BUBBLE_C_LEFT.finditer(stripped):
            txt = clean_text(m.group(1))
            _add(seen, txt, "girl")
            if txt:
                found = True; current_side = "girl"

        # Inline (PlugAI screen short labels)
        for m in BUBBLE_INLINE_RIGHT.finditer(stripped):
            txt = clean_text(m.group(1))
            _add(seen, txt, "boy")
            if txt:
                found = True; current_side = "boy"
        for m in BUBBLE_INLINE_LEFT.finditer(stripped):
            txt = clean_text(m.group(1))
            _add(seen, txt, "girl")
            if txt:
                found = True; current_side = "girl"

        # Plural "bubbles:" forms
        for m in BUBBLE_PLURAL_RIGHT.finditer(stripped):
            txt = clean_text(m.group(1))
            _add(seen, txt, "boy")
            if txt:
                found = True; current_side = "boy"
        for m in BUBBLE_PLURAL_LEFT.finditer(stripped):
            txt = clean_text(m.group(1))
            _add(seen, txt, "girl")
            if txt:
                found = True; current_side = "girl"

        # "bubble with/containing "text"" format (per-second logs)
        for m in BUBBLE_WITH_RIGHT.finditer(stripped):
            txt = clean_text(m.group(1))
            _add(seen, txt, "boy")
            if txt:
                found = True; current_side = "boy"
        for m in BUBBLE_WITH_LEFT.finditer(stripped):
            txt = clean_text(m.group(1))
            _add(seen, txt, "girl")
            if txt:
                found = True; current_side = "girl"
        for m in BUBBLE_ONE_RIGHT.finditer(stripped):
            txt = clean_text(m.group(1))
            _add(seen, txt, "boy")
            if txt:
                found = True; current_side = "boy"

        # ── "Bubble layout/colors/sides:" lines (per-second log format) ─────
        # e.g. "One purple bubble on the right reading "text"; two dark gray on left reading "a" and "b""
        # Uses positional logic: assign each quoted text to the nearest preceding side marker.
        if _BUBBLE_LAYOUT_LINE.search(stripped):
            after_colon = stripped.split(':', 1)[-1]
            # Collect side markers (purple/right = boy, dark gray/left = girl) with positions
            side_pos = []
            for sm in re.finditer(r'\b(purple|right|dark\s*gr[ae]y|left|gray|grey)\b', after_colon, re.IGNORECASE):
                lbl = sm.group(1).lower()
                side_pos.append((sm.start(), "boy" if lbl in ("purple", "right") else "girl"))
            # Collect all quoted texts with positions (double-quotes and backticks)
            for q_m in re.finditer(_QA, after_colon):
                txt = clean_text(q_m.group(1))
                if not txt:
                    continue
                pos = q_m.start()
                # Find nearest preceding side marker
                prev = [(mp, s) for mp, s in side_pos if mp <= pos]
                if prev:
                    _, side = max(prev)
                    _add(seen, txt, side)
                    found = True; current_side = side

        # ── Format D: detect side-header lines (no quoted text on line) ──
        has_quote = bool(re.search(r'["\u201c\u2018`]', stripped))
        if not found:
            if _D_RIGHT_HEADER.search(stripped) and not has_quote:
                current_side = "boy"
            elif _D_LEFT_HEADER.search(stripped) and not has_quote:
                current_side = "girl"
            elif _D_INC_HEADER.search(stripped) and not has_quote:
                current_side = "girl"
            elif _D_OUT_HEADER.search(stripped) and not has_quote:
                current_side = "boy"

        # ── Format D: bullet items inheriting current_side ────────────────
        if current_side:
            m = _D_BULLET_QUOTE.match(stripped)
            if m:
                txt = clean_text(m.group(1))
                _add(seen, txt, current_side)

    # Filter noise
    noise_re = re.compile(
        r'^(you replied to their story|tap to copy|tippe zum kopieren|tap to\s.*|'
        r'a masterpiece|too easy|shooting my shot|someone.s girl)$',
        re.IGNORECASE
    )
    result = []
    for txt, sender in seen.items():
        if noise_re.match(txt):
            continue
        if len(txt) < 2:
            continue
        if re.match(r'^[\W_]{1,2}$', txt):
            continue
        result.append({"from": sender, "text": txt})
    return result


# ---------------------------------------------------------------------------
# Metadata extraction
# ---------------------------------------------------------------------------
def extract_ai_punchline(section_text):
    """Extract the AURA AI / PlugAI card CTA button punchline."""
    for line in section_text.splitlines():
        m = AI_BUTTON.search(line)
        if m:
            return clean_text(m.group(1))
        m = AI_BUTTON_ALT.search(line)
        if m:
            return clean_text(m.group(1))
    return None


def extract_hook_text(section_text):
    """Extract the intro overlay hook text (e.g. 'How to text huzz *take notes')."""
    candidates = []
    for line in section_text.splitlines():
        for m in HOOK_OVERLAY.finditer(line):
            t = clean_text(m.group(1))
            if t and len(t) > 5 and "You replied" not in t and "tap to" not in t.lower():
                candidates.append(t)
    if not candidates:
        return None
    for c in candidates:
        if re.search(r'(text|huzz|shoot|slide|dm|rizz|ig|baddies|shot)', c, re.I):
            return c
    return candidates[0]


def infer_arc_type(conversation, ai_punchline):
    """Classify arc type from the conversation."""
    texts = [m["text"].lower() for m in conversation]
    full = " ".join(texts) + " " + (ai_punchline or "").lower()

    if re.search(r'\d{3}[\s\-]\d{3,4}[\s\-]\d{4}|\bmy number\b|\bgrab your number\b|\bdrop your number\b', full):
        return "number_exchange"

    boy_texts = [m["text"] for m in conversation if m["from"] == "boy"]
    for bt in boy_texts:
        if PIVOT_QUESTION_RE.match(bt.strip()):
            return "pivot"

    if re.search(r'(missionary|sip|raw|matcha|flexible|position)', full):
        return "double_meaning"

    if re.search(r'\b(69|73%|70%|100%|60 seconds|ways to make)\b', full):
        return "punchline"

    if re.search(r'\b(not gonna happen|hard pass|no thanks|moving on|nope)\b', full):
        return "rejection"

    if re.search(r'\b(friends forever|already know|plot twist|wait what)\b', full):
        return "plot_twist"

    return "number_exchange"


def detect_pivot(conversation):
    """
    Detect if there's a random-pivot pattern in the conversation.
    Returns (setup_text, punchline_text) or (None, None).
    """
    msgs = conversation
    for i, msg in enumerate(msgs):
        if msg["from"] == "boy" and PIVOT_QUESTION_RE.match(msg["text"].strip()):
            if i + 2 < len(msgs) and msgs[i + 1]["from"] == "girl" and msgs[i + 2]["from"] == "boy":
                return msg["text"], msgs[i + 2]["text"]
            elif i + 1 < len(msgs) and msgs[i + 1]["from"] == "girl":
                return msg["text"], None
    return None, None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print(f"Reading: {input_file}")
    with open(input_file, "r", encoding="utf-8") as f:
        text = f.read()

    sections = split_sections(text)
    print(f"Found {len(sections)} video sections")

    examples = []
    skipped = 0
    skipped_names = []

    for video_name, section_text in sections:
        conversation = extract_bubbles(section_text)
        ai_punchline = extract_ai_punchline(section_text)
        hook_text = extract_hook_text(section_text)

        if len(conversation) < 2:
            skipped += 1
            skipped_names.append(video_name)
            continue

        if conversation[0]["from"] != "boy":
            boy_idx = next((i for i, m in enumerate(conversation) if m["from"] == "boy"), -1)
            if boy_idx == -1:
                skipped += 1
                skipped_names.append(video_name)
                continue
            conversation = conversation[boy_idx:]

        opener = conversation[0]["text"]
        arc_type = infer_arc_type(conversation, ai_punchline)
        pivot_setup, pivot_punchline = detect_pivot(conversation)

        entry = {
            "video_id": video_name,
            "opener": opener,
            "conversation": conversation,
            "arc_type": arc_type,
        }
        if ai_punchline:
            entry["ai_card_punchline"] = ai_punchline
        if hook_text:
            entry["hook_text"] = hook_text
        if pivot_setup:
            entry["pivot_setup"] = pivot_setup
        if pivot_punchline:
            entry["pivot_punchline"] = pivot_punchline

        examples.append(entry)

    arc_counts = {}
    for e in examples:
        arc_counts[e["arc_type"]] = arc_counts.get(e["arc_type"], 0) + 1

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(examples, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"\nExtracted {len(examples)} videos  ({skipped} skipped — no conversation found)")
    print("Arc types:", arc_counts)
    print(f"Pivots detected: {sum(1 for e in examples if e.get('pivot_setup'))}")
    print(f"AI punchlines: {sum(1 for e in examples if e.get('ai_card_punchline'))}")
    if skipped_names:
        print(f"\nSkipped videos: {skipped_names[:10]}{'...' if len(skipped_names) > 10 else ''}")
    print(f"\nSample openers:")
    for e in examples[:10]:
        print(f"  [{e['arc_type']}] {e['video_id']}: {e['opener']!r}")
    print(f"\n✓ Written to {output_file}")


if __name__ == "__main__":
    main()
