#!/usr/bin/env bash
set -euo pipefail

DATE="${1:?Usage: ./validate-existing-batch.sh YYYY-MM-DD [render_count] [min_total] [min_sample]}"
RENDER_COUNT="${2:-1}"
MIN_TOTAL="${3:-5}"
MIN_SAMPLE="${4:-5}"

cd "$(dirname "$0")"

echo "[1/7] QA gate"
npm run qa -- --date="$DATE"

echo "[2/7] Render gate (sample count=$RENDER_COUNT)"
npm run render -- --date="$DATE" --count="$RENDER_COUNT" --only-pass

echo "[3/7] Viral-alignment gate"
node tests/compare-viral.js --date="$DATE" --min-total="$MIN_TOTAL"

echo "[4/7] Arc-diversity gate"
node tests/validate-arc-distribution.js --date="$DATE" --min-sample="$MIN_SAMPLE"

echo "[5/7] Reliability gate"
node tests/reliability-check.js --date="$DATE" --min-total="$MIN_TOTAL"

echo "[6/7] Viral-mechanics gate"
node tests/validate-viral-mechanics.js --date="$DATE" --min-total="$MIN_TOTAL"

echo "[7/7] Go-live report artifact"
node tools/generate-go-live-report.js --date="$DATE"

echo "Batch $DATE passed all gates"
