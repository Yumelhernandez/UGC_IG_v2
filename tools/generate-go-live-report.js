const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function parseArgs(argv) {
  const args = { date: null, batchSize: 20, approver: 'codex' };
  argv.forEach((arg) => {
    if (arg.startsWith('--date=')) args.date = arg.split('=')[1];
    if (arg.startsWith('--batch-size=')) args.batchSize = Number(arg.split('=')[1]);
    if (arg.startsWith('--approver=')) args.approver = arg.split('=')[1];
  });
  return args;
}

function dateStamp(input) {
  if (input) return input;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function loadJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function getCommitSha(rootDir) {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch (e) {
    return 'unknown';
  }
}

function run() {
  const rootDir = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const date = dateStamp(args.date);

  const logsDir = path.join(rootDir, 'logs', date);
  const validationDir = path.join(rootDir, 'logs', 'validation');
  const scriptsDir = path.join(rootDir, 'scripts', date);
  const qa = loadJsonIfExists(path.join(logsDir, 'qa.json'));
  const vm = loadJsonIfExists(path.join(logsDir, 'validate-viral-mechanics.json'));
  const renderCv = loadJsonIfExists(path.join(logsDir, 'validate-render-tier-cv.json'));

  if (!vm || !vm.gate_results) {
    console.error(`Missing validator output at ${path.join(logsDir, 'validate-viral-mechanics.json')}`);
    process.exit(1);
  }

  const gateResults = { ...(vm.gate_results || {}) };
  if (renderCv && renderCv.gate_results) {
    const renderMap = {
      '1_hook_visibility': '1_hook_visibility',
      '9_clip_cadence': '9_clip_cadence',
      '18_clip_overlay': '18_clip_overlay',
      '21_visual_structure': '21_visual_structure'
    };
    Object.entries(renderMap).forEach(([renderKey, gateKey]) => {
      if (renderCv.gate_results[renderKey]) {
        gateResults[gateKey] = renderCv.gate_results[renderKey];
      }
    });
  }
  const gateEntries = Object.entries(gateResults)
    .map(([gate, data]) => ({ gate, status: data && data.status ? data.status : 'WARN', details: data || {} }))
    .sort((a, b) => a.gate.localeCompare(b.gate, undefined, { numeric: true }));

  const failGates = gateEntries.filter((row) => row.status === 'FAIL');
  const warnGates = gateEntries.filter((row) => row.status === 'WARN');
  const decision = failGates.length === 0 ? 'GO' : 'NO_GO';

  const overrideEntries = [];
  if (fs.existsSync(scriptsDir)) {
    const scriptFiles = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.json')).sort();
    scriptFiles.forEach((file) => {
      try {
        const script = JSON.parse(fs.readFileSync(path.join(scriptsDir, file), 'utf8'));
        const reason = script.meta && script.meta.qa_overrides && script.meta.qa_overrides.first_gap_reason;
        if (reason && typeof reason === 'string' && reason.trim()) {
          overrideEntries.push({ file, reason: reason.trim() });
        }
      } catch (e) {
        // ignore malformed files
      }
    });
  }

  const gateTableRows = gateEntries
    .map((row) => {
      const detail = JSON.stringify(row.details)
        .replace(/\|/g, '/')
        .slice(0, 180);
      return `| ${row.gate} | ${row.status} | ${detail} |`;
    })
    .join('\n');

  fs.mkdirSync(validationDir, { recursive: true });
  const reportPath = path.join(validationDir, `go_live_validation_report_${date}.md`);

  const content = `# Go-Live Validation Report\n\n` +
`Date: ${date}\n` +
`Project: ${rootDir}\n` +
`Commit SHA: ${getCommitSha(rootDir)}\n` +
`Validator Version: v14-18-canonical\n` +
`Batch Size: ${vm.total_scripts || args.batchSize}\n\n` +
`## Final Decision\n` +
`- Decision: ${decision}\n` +
`- Approver: ${args.approver}\n` +
`- Timestamp: ${new Date().toISOString()}\n\n` +
`## Decision Policy\n` +
`- Canonical gate source: Section 14.18\n` +
`- GO requires zero FAIL gates\n` +
`- WARN gates are non-blocking but require remediation ownership and due date\n\n` +
`## Batch Metadata\n` +
`- QA summary: ${qa && qa.summary ? `${qa.summary.pass}/${qa.summary.total} pass` : 'n/a'}\n` +
`- Arc counts: ${JSON.stringify(vm.arc_counts || {})}\n` +
`- Controversy counts: ${JSON.stringify(vm.controversy_counts || {})}\n` +
`- Spice counts: ${JSON.stringify(vm.spice_counts || {})}\n\n` +
`## Gate Results (14.18 Canonical)\n` +
`| Gate | Status | Details |\n` +
`|---|---|---|\n` +
`${gateTableRows}\n\n` +
`## Timing Variance Snapshot\n` +
`- first_response stdev: ${vm.first_response ? vm.first_response.stdev : 'n/a'}\n` +
`- first_gap stdev: ${vm.first_gap ? vm.first_gap.stdev : 'n/a'}\n` +
`- first_gap >3.5s count: ${vm.first_gap ? vm.first_gap.soft_penalty_count_gt_3_5 : 'n/a'}\n` +
`- first_gap >4.8s count: ${vm.first_gap ? vm.first_gap.hard_fail_count_gt_4_8 : 'n/a'}\n` +
`- first_gap >5.5s count: ${vm.first_gap ? vm.first_gap.absolute_fail_count_gt_5_5 : 'n/a'}\n\n` +
`## Override Log\n` +
`- Overrides applied: ${overrideEntries.length > 0 ? 'yes' : 'no'}\n` +
`- Required key path: meta.qa_overrides.first_gap_reason\n` +
`${overrideEntries.length > 0 ? overrideEntries.map((e) => `- ${e.file}: ${e.reason}`).join('\n') : '- none'}\n\n` +
`## Failure Summary\n` +
`${failGates.length > 0 ? failGates.map((g) => `- FAIL: ${g.gate}`).join('\n') : '- none'}\n\n` +
`## WARN Summary\n` +
`${warnGates.length > 0 ? warnGates.map((g) => `- WARN: ${g.gate}`).join('\n') : '- none'}\n\n` +
`## Required Remediation\n` +
`1. Resolve each FAIL gate before next posting decision.\n` +
`2. For WARN gates, assign owner + due date in next report iteration.\n` +
`3. Re-run: generate -> qa -> validate-viral-mechanics -> go-live-report.\n`;

  fs.writeFileSync(reportPath, content, 'utf8');
  console.log(`Go-live report written: ${reportPath}`);
  if (decision !== 'GO') process.exit(1);
}

if (require.main === module) {
  run();
}
