const fs = require("fs");
const path = require("path");

function createLogger(logsDir, runId) {
  if (!logsDir || !fs.existsSync(logsDir) || !fs.statSync(logsDir).isDirectory()) {
    throw new Error(`Logger requires existing logsDir: ${logsDir}`);
  }
  const runJsonlPath = path.join(logsDir, "run.jsonl");

  function log(eventType, payload) {
    const event = {
      ts: new Date().toISOString(),
      run_id: runId,
      event_type: String(eventType || ""),
      payload: payload && typeof payload === "object" ? payload : {}
    };
    fs.appendFileSync(runJsonlPath, `${JSON.stringify(event)}\n`, "utf8");
  }

  function close() {
    log("run_complete", {});
  }

  return {
    path: runJsonlPath,
    log,
    close
  };
}

module.exports = {
  createLogger
};
