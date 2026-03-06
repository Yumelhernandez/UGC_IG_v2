#!/usr/bin/env python3
"""
Extract structured viral patterns from the consolidated breakdowns markdown.
Parses 107 viral video analyses into machine-readable JSON for LLM few-shot prompting.

Usage:
    python3 tools/extract-viral-patterns.py \
        --input ~/Documents/viral_videos_breakdowns_consolidated.md \
        --output viral_patterns.json
"""

import re
import json
import sys
import argparse
from pathlib import Path
from collections import OrderedDict


# ---------------------------------------------------------------------------
# 1. Split the markdown into per-video sections
# ---------------------------------------------------------------------------

def split_into_videos(text: str) -> list[dict]:
    """Split the consolidated markdown on '## Video:' headers."""
    # Split on ## Video: header lines (some have --- before them, some don't)
    # Use lookahead to keep the header with each section
    sections = re.split(r'\n(?=## Video:)', text)
    # First section might start with ## Video: directly
    if not sections[0].strip().startswith('## Video:'):
        idx = sections[0].find('## Video:')
        if idx >= 0:
            sections[0] = sections[0][idx:]
        else:
            sections.pop(0)

    videos = []
    for section in sections:
        section = section.strip()
        # Remove leading --- if present
        section = re.sub(r'^---\s*\n', '', section)
        if not section:
            continue
        # Extract video filename
        m = re.match(r'## Video:\s*(.+\.mp4)', section)
        if not m:
            continue
        videos.append({
            'filename': m.group(1).strip(),
            'raw': section
        })
    return videos


# ---------------------------------------------------------------------------
# 2. Parse metadata from each video section header
# ---------------------------------------------------------------------------

def parse_metadata(raw: str) -> dict:
    meta = {}
    m = re.search(r'Duration:\s*([\d.]+)', raw)
    if m:
        meta['duration_s'] = float(m.group(1))

    m = re.search(r'Format:\s*(\d+x\d+)', raw)
    if m:
        meta['resolution'] = m.group(1)

    m = re.search(r'Video longer\s+than 30 seconds:\s*(True|False)', raw)
    if m:
        meta['longer_than_30s'] = m.group(1) == 'True'

    return meta


# ---------------------------------------------------------------------------
# 3. Parse frame-by-frame breakdown (the core dialogue extraction)
# ---------------------------------------------------------------------------

# Regex for frame headers like "- t=0.000000s" or "- t=3.000000s"
FRAME_RE = re.compile(r'^- t=([\d.]+)s\s*$', re.MULTILINE)

# Two bubble layout field patterns
BUBBLE_FORMAT_1 = re.compile(
    r'Bubble layout/colors/sides\s*\(for each visible bubble\):\s*(.+)',
    re.IGNORECASE
)
BUBBLE_FORMAT_2 = re.compile(
    # The description ends with a backtick then ): — match up to that boundary
    r'Bubble layout/sides/colors\s*\(.+?`\):\s*(.+)',
    re.IGNORECASE
)

VISIBLE_TEXT_RE = re.compile(
    r'Visible text elements\s*\(.+?\):\s*(.+)',
    re.IGNORECASE
)

BACKGROUND_RE = re.compile(
    r'Background:\s*(.+)',
    re.IGNORECASE
)

UI_CONTEXT_RE = re.compile(
    r'UI context\s*\(.+?\):\s*(.+)',
    re.IGNORECASE
)

OVERLAY_RE = re.compile(
    r'Overlays/captions/watermarks:\s*(.+)',
    re.IGNORECASE
)


def parse_frames(raw: str) -> list[dict]:
    """Parse all t=N.000000s frame blocks into structured data."""
    # Find the Facts-Only Breakdown section
    facts_start = raw.find('### Facts-Only Breakdown')
    if facts_start < 0:
        return []

    # Find the next section header after facts
    next_section = re.search(r'\n### (?!Facts-Only)', raw[facts_start + 10:])
    if next_section:
        facts_text = raw[facts_start:facts_start + 10 + next_section.start()]
    else:
        facts_text = raw[facts_start:]

    frames = []
    # Split on frame markers
    frame_splits = FRAME_RE.split(facts_text)
    # frame_splits alternates: [preamble, time1, content1, time2, content2, ...]

    i = 1  # skip preamble
    while i + 1 < len(frame_splits):
        timestamp = float(frame_splits[i])
        content = frame_splits[i + 1]
        i += 2

        frame = {'t': timestamp}

        # Extract background
        m = BACKGROUND_RE.search(content)
        frame['background'] = m.group(1).strip() if m else ''

        # Extract UI context
        m = UI_CONTEXT_RE.search(content)
        frame['ui_context'] = m.group(1).strip() if m else ''

        # Extract visible text
        m = VISIBLE_TEXT_RE.search(content)
        frame['visible_text'] = m.group(1).strip() if m else ''

        # Extract bubble layout (try both formats)
        m = BUBBLE_FORMAT_2.search(content)
        if not m:
            m = BUBBLE_FORMAT_1.search(content)
        frame['bubble_layout'] = m.group(1).strip() if m else ''

        # Extract overlays
        m = OVERLAY_RE.search(content)
        frame['overlay'] = m.group(1).strip() if m else ''

        frames.append(frame)

    return frames


# ---------------------------------------------------------------------------
# 3b. Parse shot-based breakdown (alternative format for some videos)
# ---------------------------------------------------------------------------

SHOT_RE = re.compile(
    r'(\d+)\.\s+Shot\s+\d+\s*\(([0-9.]+)s?\s*[–—-]\s*([0-9.]+)s?\)\s*[–—-]\s*(.+)',
    re.IGNORECASE
)

SEGMENT_RE = re.compile(
    r'(\d+)\.\s+Segment\s+\d+\s*\(([0-9.]+)s?\s*[–—-]\s*([0-9.]+)s?\)',
    re.IGNORECASE
)
SEGMENT_TEXT_RE = re.compile(
    r'side=(left|right|center);\s*color=([^;]+);\s*bbox=\([^)]+\);\s*text="([^"]*)"'
)

SHOT_BUBBLE_RE = re.compile(
    r'(?:Outgoing|Incoming)\s+(?:bubble\s*)?\(([^)]+)\):\s*["""](.+?)["""]',
    re.IGNORECASE
)

SHOT_BUBBLE_ALT_RE = re.compile(
    r'-\s+(?:Outgoing|Incoming)\s+(?:bubble\s*)?\(([^)]+)\):\s*(.+)',
    re.IGNORECASE
)


def parse_shots(raw: str) -> list[dict]:
    """Parse shot-based breakdowns into frame-like structures."""
    facts_start = raw.find('### Facts-Only Breakdown')
    if facts_start < 0:
        return []

    next_section = re.search(r'\n### (?:Timing|Analysis)', raw[facts_start + 10:])
    if next_section:
        facts_text = raw[facts_start:facts_start + 10 + next_section.start()]
    else:
        facts_text = raw[facts_start:]

    frames = []
    # Split on "N. Shot N (" pattern
    shot_parts = re.split(r'\n(?=\d+\.\s+Shot\s+\d+)', facts_text)

    for part in shot_parts:
        part = part.strip()
        m = SHOT_RE.match(part)
        if not m:
            continue

        start_t = float(m.group(2))
        end_t = float(m.group(3))
        shot_type = m.group(4).strip().lower()  # "same background", "cutaway", etc.

        # Determine if this is a chat shot or a cutaway
        is_cutaway = 'cutaway' in shot_type or 'cut away' in shot_type
        is_chat = 'same background' in shot_type or 'cut back' in shot_type or not is_cutaway

        # Extract bubble messages using Unicode-aware quote matching
        # Handles both smart quotes (\u201c\u201d) and straight quotes (\x22)
        messages = []
        bubble_lines = re.findall(
            r'(?:Outgoing|Incoming)\s+(?:bubble\s*)?\(([^)]+)\):\s*[\u201c\u201d""](.+?)[\u201c\u201d""]',
            part
        )

        # Also try indented format: "  - Outgoing (right, blue): "text""
        if not bubble_lines:
            bubble_lines = re.findall(
                r'(?:Outgoing|Incoming)\s*\(([^)]+)\):\s*[\u201c\u201d""](.+?)[\u201c\u201d""]',
                part
            )

        for desc, text in bubble_lines:
            desc_lower = desc.lower()
            if 'right' in desc_lower or 'blue' in desc_lower or 'purple' in desc_lower or 'violet' in desc_lower:
                sender = 'boy'
            elif 'left' in desc_lower or 'gray' in desc_lower or 'grey' in desc_lower:
                sender = 'girl'
            else:
                sender = 'unknown'
            messages.append({'from': sender, 'text': text.strip()})

        # Extract overlay text
        overlay = ''
        overlay_m = re.search(r'overlay\s+text[^:]*:\s*(.+)', part, re.IGNORECASE)
        if overlay_m:
            overlay = overlay_m.group(1).strip()
        else:
            overlay_m = re.search(r'centered\s+overlay\s+text[^:]*:\s*(.+)', part, re.IGNORECASE)
            if overlay_m:
                overlay = overlay_m.group(1).strip()

        # Extract visible text from shot (for CTA text, overlay labels, etc.)
        visible_texts = re.findall(r'["""](.+?)["""]', part)

        # Build background info
        bg_lines = [l.strip('- ') for l in part.split('\n') if 'background' in l.lower() or 'clip' in l.lower() or 'sports' in l.lower()]
        background = ' '.join(bg_lines) if bg_lines else ''

        # Infer UI context
        ui_context = ''
        for line in part.split('\n'):
            if 'ui context' in line.lower():
                ui_context = line.split(':', 1)[-1].strip() if ':' in line else ''
                break
            if 'imessage' in line.lower():
                ui_context = 'iMessage'
                break
            if 'instagram' in line.lower():
                ui_context = 'Instagram'
                break

        frame = {
            't': start_t,
            'end_t': end_t,
            'background': background,
            'ui_context': ui_context if ui_context else ('chat' if is_chat else 'cutaway'),
            'visible_text': ', '.join(f'"{t}"' for t in visible_texts),
            'bubble_layout': '',  # handled via messages directly
            'overlay': overlay,
            'is_shot': True,
            'shot_type': shot_type,
            'shot_messages': messages
        }
        frames.append(frame)

    return frames


# ---------------------------------------------------------------------------
# 3c. Parse segment-based breakdown (batch script format, videos 28–55+)
# ---------------------------------------------------------------------------

UI_NOISE = {
    'you replied to their story', 'type a message', 'tap to copy',
    'plug ai', 'aura ai', 'yesterday', 'today', 'seen', 'delivered',
    '( |', '( )', 'none detected', 'none', 'none.', 'seen on thursday',
    'seen on monday', 'seen on tuesday', 'seen on wednesday',
    'seen on friday', 'seen on saturday', 'seen on sunday',
}

# Characters that strongly signal OCR noise (beyond the simple non-alnum check)
_OCR_JUNK_CHARS = set('|=*^~`<>{}[]\\¢°©®™$€£¥÷×±')


def is_ocr_garbage(text: str) -> bool:
    t = text.strip()
    if len(t) <= 3:
        return True
    if '\\' in t:
        return True
    if t.lower() in UI_NOISE:
        return True
    # Reject if any OCR junk character present
    if any(c in _OCR_JUNK_CHARS for c in t):
        return True
    # Count non-alnum chars (excluding common punctuation in real dialogue)
    non_alnum = sum(1 for c in t if not c.isalnum() and c not in (' ', "'", '?', '!', ',', '.', '-', ':'))
    if len(t) > 0 and non_alnum / len(t) > 0.30:
        return True
    # Require at least one real word (3+ consecutive alphabetic characters)
    if not re.search(r'[A-Za-z]{3,}', t):
        return True
    return False


def parse_segments(raw: str) -> list[dict]:
    """Parse segment-based breakdowns (batch script format) into frame-like structures."""
    facts_start = raw.find('### Facts-Only Breakdown')
    if facts_start < 0:
        return []

    next_section = re.search(r'\n### (?:Timing|Analysis)', raw[facts_start + 10:])
    facts_text = raw[facts_start:facts_start + 10 + next_section.start()] if next_section else raw[facts_start:]

    frames = []
    parts = re.split(r'\n(?=\d+\.\s+Segment\s+\d+)', facts_text)

    for part in parts:
        m = SEGMENT_RE.match(part.strip())
        if not m:
            continue

        start_t = float(m.group(2))
        end_t = float(m.group(3))

        # Determine background type
        bg_line = ''
        bg_match = re.search(r'Background:\s*(.+)', part)
        if bg_match:
            bg_line = bg_match.group(1).strip().lower()
        is_cutaway = 'cutaway' in bg_line

        ui_context = ''
        ui_match = re.search(r'UI context:\s*(.+)', part)
        if ui_match:
            ui_context = ui_match.group(1).strip()

        # Extract text elements
        messages = []
        seen = set()
        for tm in SEGMENT_TEXT_RE.finditer(part):
            side = tm.group(1).lower()
            color = tm.group(2).lower()
            text = tm.group(3).strip()

            if is_ocr_garbage(text):
                continue
            if text.lower() in seen:
                continue
            seen.add(text.lower())

            if side == 'center':
                continue  # UI chrome, skip

            # Infer sender from side + color
            if side == 'right':
                sender = 'boy'
            elif side == 'left':
                sender = 'girl'
            else:
                sender = 'unknown'

            messages.append({'from': sender, 'text': text})

        frames.append({
            't': start_t,
            'end_t': end_t,
            'background': bg_line,
            'ui_context': ui_context,
            'visible_text': '',
            'bubble_layout': '',
            'overlay': '',
            'is_shot': True,
            'shot_type': 'cutaway' if is_cutaway else 'same background',
            'shot_messages': messages
        })

    return frames


def build_conversation_from_shots(frames: list[dict]) -> dict:
    """Build conversation from shot-based data."""
    all_messages = []
    clips = []
    seen_texts = set()

    for frame in frames:
        t = frame['t']
        end_t = frame.get('end_t', t + 1)
        shot_type = frame.get('shot_type', '').lower()
        is_cutaway = 'cutaway' in shot_type or 'cut away' in shot_type

        if is_cutaway:
            # This is a clip/meme/sports insertion
            overlay = frame.get('overlay', '')
            bg = frame.get('background', '').lower()
            clip_type = 'sports' if any(k in bg for k in ['basketball', 'arena', 'sports', 'player', 'jersey']) else 'meme'
            if any(k in (overlay + ' ' + bg).lower() for k in ['quote', 'motivational', 'inspirational']):
                clip_type = 'motivational'
            clips.append({
                'start_t': t,
                'end_t': end_t,
                'duration_s': round(end_t - t, 1),
                'clip_type': clip_type,
                'overlay_text': overlay
            })
        else:
            # Chat frame — extract messages
            msgs = frame.get('shot_messages', [])
            if not msgs:
                # Fallback to visible text
                visible = frame.get('visible_text', '')
                texts = extract_messages_from_visible_text(visible)
                ui_noise = {'you replied to their story', 'yesterday', 'today',
                            'seen', 'delivered', 'none.', 'none', 'tap to copy',
                            'plug ai', 'aura ai', 'type a message'}
                texts = [t for t in texts if t.lower().strip() not in ui_noise and len(t) > 1]
                for text in texts:
                    msgs.append({'from': 'unknown', 'text': text})

            for msg in msgs:
                key = (msg['from'], msg['text'].lower().strip())
                if msg['from'] == 'unknown':
                    key = ('any', msg['text'].lower().strip())
                if key not in seen_texts:
                    seen_texts.add(key)
                    all_messages.append({
                        'from': msg['from'],
                        'text': msg['text'],
                        'first_seen_t': t
                    })

    # Hook line and first response
    hook_line = ''
    first_response = ''
    for msg in all_messages:
        if msg['from'] == 'boy' and not hook_line:
            hook_line = msg['text']
        elif msg['from'] in ('girl', 'unknown') and hook_line and not first_response:
            first_response = msg['text']
            break

    return {
        'messages': all_messages,
        'clips': clips,
        'hook_line': hook_line,
        'first_response': first_response
    }


# ---------------------------------------------------------------------------
# 4. Determine if a frame is chat vs clip
# ---------------------------------------------------------------------------

def is_chat_frame(frame: dict) -> bool:
    """Return True if frame shows a messaging/chat interface."""
    bg = frame.get('background', '').lower()
    ui = frame.get('ui_context', '').lower()
    bubbles = frame.get('bubble_layout', '').lower()

    if 'messaging' in bg or 'chat' in bg:
        return True
    if any(kw in ui for kw in ['messaging', 'chat', 'unverified', 'instagram',
                                'imessage', 'story reply', 'dm']):
        return True
    if 'bubble' in bubbles and bubbles.strip() not in ('none.', 'none', ''):
        return True
    # Black background with visible bubbles = chat
    if 'black background' in bg and bubbles.strip() not in ('none.', 'none', ''):
        return True
    return False


def is_clip_frame(frame: dict) -> bool:
    """Return True if frame shows a meme, sports clip, or non-chat visual."""
    if is_chat_frame(frame):
        return False
    bg = frame.get('background', '').lower()
    ui = frame.get('ui_context', '').lower()

    # UI context is None or empty = not a chat interface
    if ui in ('none.', 'none', ''):
        # And background has meaningful content
        if bg and bg not in ('none.', 'none', ''):
            return True
    # Explicit sports/meme keywords
    keywords = ['basketball', 'nba', 'meme', 'arena', 'player', 'court',
                'lunar', 'space', 'motivational', 'quote', 'jersey',
                'warriors', 'lakers', 'rockets', 'celtics']
    if any(k in bg for k in keywords):
        return True
    return False


# ---------------------------------------------------------------------------
# 5. Extract messages from bubble layout fields
# ---------------------------------------------------------------------------

def parse_bubbles_format2(bubble_text: str) -> list[dict]:
    """Parse pipe-delimited bubble format (videos 62+)."""
    if not bubble_text or bubble_text.lower().strip() in ('none.', 'none'):
        return []

    messages = []
    # Split on pipe delimiter
    parts = bubble_text.split('|')
    for part in parts:
        part = part.strip()
        if not part:
            continue

        # Pattern: left/right bubble (color: X): "text"
        # Quotes can be straight " or smart quotes
        m = re.match(
            r'(left|right)\s+bubble\s*\(color:\s*([^)]+)\):\s*[""\u201c](.+?)[""\u201d]',
            part, re.IGNORECASE
        )
        if m:
            side = m.group(1).lower()
            color = m.group(2).strip().lower()
            text = m.group(3).strip()
            # right/purple/violet = boy, left/gray/dark gray = girl
            sender = 'boy' if side == 'right' or color in ('violet', 'purple', 'blue') else 'girl'
            # Special case: some videos have cyan/light blue for AI suggestions
            if color in ('cyan', 'light blue', 'cyan/light blue'):
                sender = 'boy'
            messages.append({'from': sender, 'text': text})

    return messages


def parse_bubbles_format1(bubble_text: str) -> list[dict]:
    """Parse prose-style bubble format (videos 60-61)."""
    if not bubble_text or bubble_text.lower() in ('none.', 'none'):
        return []

    messages = []
    # Find patterns like "Right side purple bubble with text 'xxx'"
    # or "left side gray bubble with text 'xxx'"
    pattern = re.compile(
        r'(right|left)\s+side\s+(\w+)\s+bubble[s]?\s+with\s+text\s+[\'"](.+?)[\'"]',
        re.IGNORECASE
    )
    for m in pattern.finditer(bubble_text):
        side = m.group(1).lower()
        color = m.group(2).lower()
        text = m.group(3).strip()
        sender = 'boy' if side == 'right' or color in ('purple', 'violet', 'blue') else 'girl'
        messages.append({'from': sender, 'text': text})

    # Also try: "right side purple bubbles with text 'x', 'y', and 'z'"
    if not messages:
        pattern2 = re.compile(
            r'(right|left)\s+side\s+(\w+)\s+bubbles?\s+with\s+text\s+(.+)',
            re.IGNORECASE
        )
        for m in pattern2.finditer(bubble_text):
            side = m.group(1).lower()
            color = m.group(2).lower()
            texts_raw = m.group(3)
            # Extract all quoted strings
            texts = re.findall(r"['\"](.+?)['\"]", texts_raw)
            sender = 'boy' if side == 'right' or color in ('purple', 'violet', 'blue') else 'girl'
            for t in texts:
                messages.append({'from': sender, 'text': t.strip()})

    return messages


def extract_messages_from_visible_text(visible_text: str) -> list[str]:
    """Extract quoted text elements from visible text field."""
    if not visible_text or visible_text.lower() in ('none.', 'none', 'none visible.'):
        return []
    # Find all quoted strings (handle smart quotes and straight quotes)
    texts = re.findall(r'[\u201c""](.+?)[\u201d""]', visible_text)
    if not texts:
        texts = re.findall(r"'(.+?)'", visible_text)
    return [t.strip() for t in texts if t.strip()]


# ---------------------------------------------------------------------------
# 6. Build conversation from frames (deduplicate consecutive identical states)
# ---------------------------------------------------------------------------

def build_conversation(frames: list[dict]) -> dict:
    """
    Walk through frames, extract messages, deduplicate, and track clip insertions.
    Returns: {messages: [...], clips: [...], hook_line: str, first_response: str}
    """
    all_messages = []  # (timestamp, from, text)
    clips = []         # (start_t, end_t, clip_type, overlay_text)
    seen_texts = set()
    last_frame_type = None  # 'chat' or 'clip'
    clip_start = None

    for frame in frames:
        t = frame['t']
        is_chat = is_chat_frame(frame)
        is_clip_f = is_clip_frame(frame)

        # Track clip boundaries
        if is_clip_f and last_frame_type != 'clip':
            clip_start = t
        elif not is_clip_f and last_frame_type == 'clip' and clip_start is not None:
            # Clip just ended
            overlay = ''
            # Look back for overlay text in clip frames
            for f in frames:
                if clip_start <= f['t'] < t and is_clip_frame(f):
                    ov = f.get('overlay', '')
                    if ov and ov.lower() not in ('none.', 'none', ''):
                        overlay = ov
                        break
            clip_type = classify_clip(frames, clip_start, t)
            clips.append({
                'start_t': clip_start,
                'end_t': t,
                'duration_s': round(t - clip_start, 1),
                'clip_type': clip_type,
                'overlay_text': overlay
            })
            clip_start = None

        last_frame_type = 'clip' if is_clip_f else ('chat' if is_chat else last_frame_type)

        # Extract messages from chat frames
        if is_chat:
            # Try bubble layout first (has sender info)
            bubble_text = frame.get('bubble_layout', '')
            msgs = parse_bubbles_format2(bubble_text)
            if not msgs:
                msgs = parse_bubbles_format1(bubble_text)

            # Fallback: extract from visible text if bubbles failed
            # Use visible text to get message texts, try to infer sender
            if not msgs and frame.get('visible_text', ''):
                visible = frame['visible_text']
                texts = extract_messages_from_visible_text(visible)
                # Filter out UI text like "You replied to their story", "YESTERDAY"
                ui_noise = {'you replied to their story', 'yesterday', 'today',
                            'seen', 'delivered', 'none.', 'none', 'tap to copy',
                            'plug ai', 'type a message'}
                texts = [t for t in texts if t.lower().strip() not in ui_noise
                         and len(t) > 1]
                for text in texts:
                    msgs.append({'from': 'unknown', 'text': text})

            for msg in msgs:
                key = (msg['from'], msg['text'].lower().strip())
                # For unknown sender, also dedupe by text alone
                if msg['from'] == 'unknown':
                    key = ('any', msg['text'].lower().strip())
                if key not in seen_texts:
                    seen_texts.add(key)
                    all_messages.append({
                        'from': msg['from'],
                        'text': msg['text'],
                        'first_seen_t': t
                    })

    # Handle trailing clip
    if last_frame_type == 'clip' and clip_start is not None:
        last_t = frames[-1]['t'] if frames else clip_start
        overlay = ''
        for f in frames:
            if f['t'] >= clip_start and is_clip_frame(f):
                ov = f.get('overlay', '')
                if ov and ov.lower() not in ('none.', 'none', ''):
                    overlay = ov
                    break
        clips.append({
            'start_t': clip_start,
            'end_t': last_t + 1,
            'duration_s': round(last_t + 1 - clip_start, 1),
            'clip_type': classify_clip(frames, clip_start, last_t + 1),
            'overlay_text': overlay
        })

    # Identify hook line and first response
    hook_line = ''
    first_response = ''
    for msg in all_messages:
        if msg['from'] == 'boy' and not hook_line:
            hook_line = msg['text']
        elif msg['from'] == 'girl' and hook_line and not first_response:
            first_response = msg['text']
            break

    return {
        'messages': all_messages,
        'clips': clips,
        'hook_line': hook_line,
        'first_response': first_response
    }


def classify_clip(frames: list[dict], start_t: float, end_t: float) -> str:
    """Classify a clip as sports/meme/motivational based on background descriptions."""
    sports_kw = ['basketball', 'nba', 'arena', 'player', 'court', 'dunk',
                 'warriors', 'lakers', 'rockets', 'celtics', 'jersey',
                 'shooting', 'hoop', 'curry', 'lebron', 'jordan']
    motivational_kw = ['quote', 'motivational', 'inspirational', 'afraid to fail',
                       'succeed', 'believe', 'dream']

    for f in frames:
        if start_t <= f['t'] < end_t:
            bg = f.get('background', '').lower()
            overlay = f.get('overlay', '').lower()
            combined = bg + ' ' + overlay

            if any(k in combined for k in motivational_kw):
                return 'motivational'
            if any(k in combined for k in sports_kw):
                return 'sports'

    return 'meme'


# ---------------------------------------------------------------------------
# 7. Extract analysis sections
# ---------------------------------------------------------------------------

ANALYSIS_FIELDS = [
    'Hook mechanics',
    'Pattern + payoff',
    'Editing rhythm',
    'Cognitive load',
    'Rewatch/share triggers',
    'Emotional triggers',
    'Platform fit cues'
]


def extract_analysis(raw: str) -> dict:
    """Extract the 7-point analysis from the video section."""
    analysis_start = raw.find('### Analysis')
    if analysis_start < 0:
        return {}

    analysis_text = raw[analysis_start:]

    result = {}
    for field in ANALYSIS_FIELDS:
        pattern = re.compile(
            re.escape(field) + r'\s*(?:\(.+?\))?\s*:\s*(.+?)(?=\n(?:' +
            '|'.join(re.escape(f) for f in ANALYSIS_FIELDS) +
            r'|\n---|\Z))',
            re.DOTALL | re.IGNORECASE
        )
        m = pattern.search(analysis_text)
        if m:
            text = m.group(1).strip()
            # Truncate to reasonable length for few-shot usage
            if len(text) > 500:
                text = text[:497] + '...'
            key = field.lower().replace(' ', '_').replace('+', 'and').replace('/', '_')
            result[key] = text

    return result


# ---------------------------------------------------------------------------
# 8. Classify arc type from conversation ending
# ---------------------------------------------------------------------------

def classify_arc_type(messages: list[dict]) -> str:
    """Classify the conversation's ending arc type."""
    if not messages or len(messages) < 3:
        return 'unknown'

    # Look at last 3-4 messages
    last_msgs = messages[-4:]
    last_texts = ' '.join(m['text'].lower() for m in last_msgs)

    # Number exchange indicators
    number_kw = ['555', 'text me', 'number', 'here', 'don\'t blow it',
                 'don\'t be late', 'pick me up', 'saturday', 'sunday',
                 'friday', 'tomorrow', 'tonight', 'drinks', 'coffee',
                 'dinner', 'date', 'pm', 'am']
    if any(k in last_texts for k in number_kw):
        return 'number_exchange'

    # Rejection indicators
    rejection_kw = ['no', 'bye', 'blocked', 'try again', 'nice try',
                    'in your dreams', 'not happening', 'pass', 'nah',
                    'funny though', 'solid effort', 'good luck']
    if any(k in last_texts for k in rejection_kw):
        return 'rejection'

    # Plot twist indicators
    twist_kw = ['wait', 'oh my', 'that\'s my', 'i know you', 'hold on',
                'plot twist', 'actually', 'turns out', 'didn\'t expect']
    if any(k in last_texts for k in twist_kw):
        return 'plot_twist'

    # Cliffhanger: conversation just... ends, or ends ambiguously
    last_msg = messages[-1]
    if last_msg['text'] in ('...', '??', '💀', '😭'):
        return 'cliffhanger'

    # If ending is ambiguous or conversation just stops without clear resolution
    # Check if boy asks and girl doesn't clearly accept
    last_girl_msgs = [m for m in last_msgs if m['from'] == 'girl']
    if last_girl_msgs:
        girl_last = last_girl_msgs[-1]['text'].lower()
        if len(girl_last) < 10 and 'maybe' in girl_last:
            return 'cliffhanger'

    # Default: if nothing matches clearly
    return 'number_exchange'


# ---------------------------------------------------------------------------
# 9. Compute aggregate statistics
# ---------------------------------------------------------------------------

def compute_timing_rhythms(videos: list[dict]) -> dict:
    """Compute aggregate timing statistics across all videos."""
    msg_counts = []
    clip_frequencies = []
    clip_durations = []
    overlay_count = 0
    total_clips = 0

    for v in videos:
        conv = v.get('conversation', {})
        msgs = conv.get('messages', [])
        clips = v.get('clips', [])  # clips are at top level, not inside conversation

        if msgs:
            msg_counts.append(len(msgs))
        if clips and msgs:
            clip_frequencies.append(len(msgs) / max(len(clips), 1))
            for c in clips:
                clip_durations.append(c['duration_s'])
                if c.get('overlay_text', '').strip():
                    overlay_count += 1
                total_clips += 1

    return {
        'average_messages_per_video': round(sum(msg_counts) / max(len(msg_counts), 1), 1),
        'median_messages_per_video': sorted(msg_counts)[len(msg_counts) // 2] if msg_counts else 0,
        'min_messages': min(msg_counts) if msg_counts else 0,
        'max_messages': max(msg_counts) if msg_counts else 0,
        'average_clip_frequency_messages': round(
            sum(clip_frequencies) / max(len(clip_frequencies), 1), 1
        ),
        'average_clip_duration_s': round(
            sum(clip_durations) / max(len(clip_durations), 1), 1
        ),
        'text_overlay_frequency': round(
            overlay_count / max(total_clips, 1), 2
        ),
        'total_clips_across_all_videos': total_clips
    }


def compute_arc_distribution(videos: list[dict]) -> dict:
    """Compute distribution of arc types."""
    counts = {}
    for v in videos:
        arc = v.get('arc_type', 'unknown')
        counts[arc] = counts.get(arc, 0) + 1
    total = sum(counts.values())
    return {k: round(v / max(total, 1), 2) for k, v in sorted(counts.items())}


def extract_hook_patterns(videos: list[dict]) -> dict:
    """Build hook pattern database from all videos."""
    hooks = []
    responses = []
    hook_response_pairs = []

    for v in videos:
        conv = v.get('conversation', {})
        hook = conv.get('hook_line', '')
        resp = conv.get('first_response', '')
        if hook:
            hooks.append(hook)
            if resp:
                responses.append(resp)
                hook_response_pairs.append({
                    'hook': hook,
                    'response': resp,
                    'video_id': v['video_id']
                })

    return {
        'opening_lines': hooks,
        'opening_lines_unique': list(OrderedDict.fromkeys(hooks)),
        'girl_response_patterns': list(OrderedDict.fromkeys(responses)),
        'hook_response_pairs': hook_response_pairs,
        'total_unique_hooks': len(set(h.lower().strip() for h in hooks))
    }


def synthesize_analysis(videos: list[dict]) -> dict:
    """Aggregate analysis insights across all videos."""
    all_analyses = [v.get('analysis', {}) for v in videos if v.get('analysis')]

    synthesis = {}
    for field_key in ['hook_mechanics', 'pattern_and_payoff', 'editing_rhythm',
                      'cognitive_load', 'rewatch_share_triggers',
                      'emotional_triggers', 'platform_fit_cues']:
        entries = [a.get(field_key, '') for a in all_analyses if a.get(field_key)]
        synthesis[field_key] = {
            'count': len(entries),
            'examples': entries[:5]  # First 5 as representative samples
        }

    return synthesis


# ---------------------------------------------------------------------------
# 10. Main extraction pipeline
# ---------------------------------------------------------------------------

def extract_all(input_path: str) -> dict:
    """Run the full extraction pipeline."""
    print(f"Reading {input_path}...")
    text = Path(input_path).read_text(encoding='utf-8')
    print(f"  {len(text):,} characters, {text.count(chr(10)):,} lines")

    print("Splitting into video sections...")
    video_sections = split_into_videos(text)
    print(f"  Found {len(video_sections)} videos")

    videos = []
    errors = []

    for i, section in enumerate(video_sections):
        filename = section['filename']
        video_id = f"viral_{i + 1:03d}"
        print(f"  [{i + 1}/{len(video_sections)}] Parsing {filename}...", end=' ')

        try:
            raw = section['raw']
            meta = parse_metadata(raw)

            # Try frame-by-frame first, then shot-based, then segment-based
            frames = parse_frames(raw)
            if frames:
                conversation = build_conversation(frames)
            else:
                # Try shot-based format
                shot_frames = parse_shots(raw)
                if shot_frames:
                    conversation = build_conversation_from_shots(shot_frames)
                else:
                    seg_frames = parse_segments(raw)
                    if seg_frames:
                        conversation = build_conversation_from_shots(seg_frames)
                    else:
                        conversation = {'messages': [], 'clips': [], 'hook_line': '', 'first_response': ''}

            analysis = extract_analysis(raw)
            arc_type = classify_arc_type(conversation['messages'])

            video = {
                'video_id': video_id,
                'filename': filename,
                'meta': meta,
                'conversation': {
                    'hook_line': conversation['hook_line'],
                    'first_response': conversation['first_response'],
                    'messages': [
                        {
                            'from': m['from'],
                            'text': m['text'],
                            'timestamp_s': m['first_seen_t']
                        }
                        for m in conversation['messages']
                    ],
                    'message_count': len(conversation['messages']),
                },
                'clips': conversation['clips'],
                'clip_count': len(conversation['clips']),
                'arc_type': arc_type,
                'analysis': analysis
            }

            msg_count = len(conversation['messages'])
            clip_count = len(conversation['clips'])
            print(f"{msg_count} msgs, {clip_count} clips, arc={arc_type}")

            videos.append(video)

        except Exception as e:
            print(f"ERROR: {e}")
            errors.append({'filename': filename, 'error': str(e)})

    print(f"\nComputing aggregates...")

    # Build final output
    output = {
        'meta': {
            'total_videos': len(videos),
            'total_errors': len(errors),
            'source_file': str(input_path),
            'extraction_errors': errors
        },
        'videos': videos,
        'hook_patterns': extract_hook_patterns(videos),
        'timing_rhythms': compute_timing_rhythms(videos),
        'arc_distribution': compute_arc_distribution(videos),
        'analysis_synthesis': synthesize_analysis(videos)
    }

    return output


def main():
    parser = argparse.ArgumentParser(description='Extract viral patterns from breakdowns')
    parser.add_argument('--input', '-i',
                        default=str(Path.home() / 'Documents' / 'New project' / 'viral_video_breakdowns_consolidated.md'),
                        help='Path to consolidated breakdowns markdown')
    parser.add_argument('--output', '-o',
                        default='viral_patterns.json',
                        help='Output JSON path')
    args = parser.parse_args()

    result = extract_all(args.input)

    output_path = Path(args.output)
    print(f"\nWriting {output_path}...")
    output_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')

    # Print summary
    print(f"\n{'=' * 60}")
    print(f"EXTRACTION COMPLETE")
    print(f"{'=' * 60}")
    print(f"Videos parsed:     {result['meta']['total_videos']}")
    print(f"Errors:            {result['meta']['total_errors']}")
    print(f"Unique hooks:      {result['hook_patterns']['total_unique_hooks']}")
    print(f"Total clips found: {result['timing_rhythms']['total_clips_across_all_videos']}")
    print(f"Avg msgs/video:    {result['timing_rhythms']['average_messages_per_video']}")
    print(f"Avg clip duration: {result['timing_rhythms']['average_clip_duration_s']}s")
    print(f"Arc distribution:  {result['arc_distribution']}")
    print(f"\nOutput: {output_path.resolve()}")


if __name__ == '__main__':
    main()
