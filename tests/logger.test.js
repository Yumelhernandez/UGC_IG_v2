const fs = require("fs");
const os = require("os");
const path = require("path");
const { createLogger } = require("../tools/lib/logger");

let failed = 0;

function assert(condition, label, detail = "") {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${label}${detail ? ` (${detail})` : ""}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

(function run() {
  const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), "logger-test-"));
  const runId = "2026-03-02";

  const logger = createLogger(logsDir, runId);
  logger.log("run_started", { daily_count: 3 });
  logger.log("script_generated", { video_id: "2026-03-02-001" });
  logger.log("run_summary", { rendered_count: 1 });
  logger.close();

  const runPath = path.join(logsDir, "run.jsonl");
  assert(fs.existsSync(runPath), "run.jsonl created");

  const lines = fs.readFileSync(runPath, "utf8").trim().split(/\n+/);
  assert(lines.length >= 4, "expected event count");

  const parsed = lines.map((line) => JSON.parse(line));
  assert(parsed[0].event_type === "run_started", "run_started first event");
  assert(parsed[parsed.length - 2].event_type === "run_summary", "run_summary second to last");
  assert(parsed[parsed.length - 1].event_type === "run_complete", "run_complete last");
  assert(parsed.every((event) => event.ts && event.run_id && event.event_type && Object.prototype.hasOwnProperty.call(event, "payload")), "all events have required keys");

  const logger2 = createLogger(logsDir, runId);
  logger2.log("run_started", { daily_count: 4 });
  logger2.close();

  const lines2 = fs.readFileSync(runPath, "utf8").trim().split(/\n+/);
  assert(lines2.length > lines.length, "second logger appends, not overwrite");

  fs.rmSync(logsDir, { recursive: true, force: true });

  if (failed > 0) {
    console.error(`logger.test.js: ${failed} failed`);
    process.exit(1);
  }
  console.log("logger.test.js: all passed");
})();
