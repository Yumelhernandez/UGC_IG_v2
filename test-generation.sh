#!/usr/bin/env bash
set -euo pipefail

DATE="${1:-$(date +%F)}"
COUNT="${2:-10}"
RENDER_COUNT="${3:-5}"
MIN_TOTAL="${4:-5}"

cd "$(dirname "$0")"

echo "[1/9] Generating scripts (date=$DATE count=$COUNT)"
npm run generate -- --date="$DATE" --count="$COUNT"

echo "[2/9] Running QA"
npm run qa -- --date="$DATE"

echo "[3/9] Rendering sample videos (count=$RENDER_COUNT, only pass)"
npm run render -- --date="$DATE" --count="$RENDER_COUNT" --only-pass

echo "[4/9] Comparing generated scripts vs viral baseline"
node tests/compare-viral.js --date="$DATE" --min-total="$MIN_TOTAL"

echo "[5/9] Validating arc distribution"
node tests/validate-arc-distribution.js --date="$DATE" --min-sample="$COUNT"

echo "[6/9] Running reliability check"
node tests/reliability-check.js --date="$DATE" --min-total="$MIN_TOTAL"

echo "[7/9] Running viral-mechanics validation"
node tests/validate-viral-mechanics.js --date="$DATE" --min-total="$MIN_TOTAL"

echo "[8/9] Building go-live validation report"
node tools/generate-go-live-report.js --date="$DATE" --batch-size="$COUNT"

echo "[9/9] Selecting top posting candidates"
node tools/select-candidates.js --date="$DATE" --top=3

echo "Pipeline validation complete for $DATE"
