#!/usr/bin/env python3
"""
Consolidate viral video breakdowns from multiple sources into one file.

Priority order (newest wins on duplicates):
  1. ~/Documents/New project/.tmp_viral_batch_28_55/Viral_video_*/section.md
  2. ~/Documents/New project/.tmp_viral/Viral_video_*.section.md
  3. ~/Documents/New project/docs/viral_video_breakdowns.md

Output: ~/Documents/New project/viral_video_breakdowns_consolidated.md
"""

from pathlib import Path
import re

HOME = Path.home()
NEW_PROJECT = HOME / 'Documents' / 'New project'

BATCH_DIR = NEW_PROJECT / '.tmp_viral_batch_28_55'
TMP_DIR   = NEW_PROJECT / '.tmp_viral'
DOCS_FILE = NEW_PROJECT / 'docs' / 'viral_video_breakdowns.md'
OUT_FILE  = NEW_PROJECT / 'viral_video_breakdowns_consolidated.md'


def extract_filename_key(header_line: str) -> str:
    """Normalise a ## Video: header to a lowercase key, e.g. 'viral_video_28.mp4'."""
    m = re.match(r'##\s*Video:\s*(.+\.mp4)', header_line.strip(), re.IGNORECASE)
    if m:
        return m.group(1).strip().lower()
    return ''


def load_sections_from_single_file(path: Path) -> list[tuple[str, str]]:
    """
    Parse a multi-video markdown file that uses '## Video: ...' headers.
    Returns list of (filename_key, full_section_text) tuples.
    """
    if not path.exists():
        return []
    text = path.read_text(encoding='utf-8', errors='ignore')
    parts = re.split(r'\n(?=## Video:)', text)
    if parts and not parts[0].strip().startswith('## Video:'):
        # Try finding first ## Video: inside first chunk
        idx = parts[0].find('## Video:')
        if idx >= 0:
            parts[0] = parts[0][idx:]
        else:
            parts.pop(0)

    sections = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        first_line = part.split('\n', 1)[0]
        key = extract_filename_key(first_line)
        if key:
            sections.append((key, part))
    return sections


def load_sections_from_individual_files(glob_dirs: list[Path],
                                        inner_filename: str) -> list[tuple[str, str]]:
    """
    Read individual section.md files from per-video subdirectories.
    Returns list of (filename_key, full_section_text) tuples.
    """
    sections = []
    for batch_dir in glob_dirs:
        if not batch_dir.exists():
            continue
        for video_dir in sorted(batch_dir.iterdir()):
            if not video_dir.is_dir():
                continue
            section_file = video_dir / inner_filename
            if not section_file.exists():
                continue
            text = section_file.read_text(encoding='utf-8', errors='ignore')
            # Find first non-blank line (some files have a leading blank line)
            first_line = ''
            for line in text.split('\n'):
                if line.strip():
                    first_line = line.strip()
                    break
            key = extract_filename_key(first_line)
            if not key:
                # Try to infer from directory name
                dir_name = video_dir.name  # e.g. "Viral_video_28"
                key = (dir_name + '.mp4').lower()
                text = f'## Video: {dir_name}.mp4\n{text}'
            sections.append((key, text))
    return sections


def load_sections_from_flat_files(directory: Path,
                                  pattern: str) -> list[tuple[str, str]]:
    """
    Read flat *.section.md files (e.g. Viral_video_26.section.md).
    Returns list of (filename_key, full_section_text) tuples.
    """
    if not directory.exists():
        return []
    sections = []
    for f in sorted(directory.glob(pattern)):
        text = f.read_text(encoding='utf-8', errors='ignore')
        first_line = text.split('\n', 1)[0].strip()
        key = extract_filename_key(first_line)
        if not key:
            # Infer from filename: Viral_video_26.section.md → viral_video_26.mp4
            stem = f.stem  # e.g. "Viral_video_26"
            if stem.endswith('.section'):
                stem = stem[:-len('.section')]
            key = (stem + '.mp4').lower()
            text = f'## Video: {stem}.mp4\n{text}'
        sections.append((key, text))
    return sections


def main():
    # -----------------------------------------------------------------
    # Source 1 — batch 28–55 (newest, highest priority)
    # -----------------------------------------------------------------
    src1_sections = load_sections_from_individual_files([BATCH_DIR], 'section.md')
    print(f'Source 1 (.tmp_viral_batch_28_55): {len(src1_sections)} sections')

    # -----------------------------------------------------------------
    # Source 2 — .tmp_viral flat files (videos 26–43, older)
    # -----------------------------------------------------------------
    src2_sections = load_sections_from_flat_files(TMP_DIR, 'Viral_video_*.section.md')
    print(f'Source 2 (.tmp_viral):              {len(src2_sections)} sections')

    # -----------------------------------------------------------------
    # Source 3 — docs/viral_video_breakdowns.md (oldest)
    # -----------------------------------------------------------------
    src3_sections = load_sections_from_single_file(DOCS_FILE)
    print(f'Source 3 (docs):                    {len(src3_sections)} sections')

    # -----------------------------------------------------------------
    # Merge — newest wins on duplicates
    # -----------------------------------------------------------------
    seen: dict[str, str] = {}   # key → section text
    source_wins: dict[str, int] = {}  # key → source number that won
    duplicate_log: list[str] = []

    for source_num, sections in [(1, src1_sections), (2, src2_sections), (3, src3_sections)]:
        for key, text in sections:
            if key not in seen:
                seen[key] = text
                source_wins[key] = source_num
            else:
                winner = source_wins[key]
                duplicate_log.append(
                    f'  SKIP {key!r} from source {source_num} '
                    f'(source {winner} already won)'
                )

    if duplicate_log:
        print(f'\nDuplicates skipped ({len(duplicate_log)}):')
        for line in duplicate_log:
            print(line)

    # -----------------------------------------------------------------
    # Sort by video number for deterministic output
    # -----------------------------------------------------------------
    def sort_key(k: str) -> tuple:
        # Extract trailing number if present, e.g. "viral_video_28.mp4" → 28
        m = re.search(r'(\d+)\.mp4$', k)
        if m:
            return (1, int(m.group(1)))
        # Text names (one, two, three…) → sort before numeric
        order = ['one', 'two', 'three', 'four', 'five', 'six', 'seven',
                 'eight', 'nine', 'ten']
        for i, word in enumerate(order):
            if word in k:
                return (0, i)
        return (2, 0)

    sorted_keys = sorted(seen.keys(), key=sort_key)

    # -----------------------------------------------------------------
    # Write consolidated file
    # -----------------------------------------------------------------
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUT_FILE.open('w', encoding='utf-8') as f:
        for i, key in enumerate(sorted_keys):
            if i > 0:
                f.write('\n\n---\n\n')
            f.write(seen[key].strip())
            f.write('\n')

    print(f'\nTotal unique videos in output: {len(sorted_keys)}')
    print(f'Output: {OUT_FILE}')


if __name__ == '__main__':
    main()
