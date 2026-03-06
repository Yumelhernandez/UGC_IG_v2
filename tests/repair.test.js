const fs = require("fs");
const os = require("os");
const path = require("path");
const { repairPayoff } = require("../tools/repair");

let failed = 0;

function assert(condition, label, detail = "") {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${label}${detail ? ` (${detail})` : ""}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

function buildScript() {
  return {
    video_id: "2026-03-02-001",
    meta: {
      arc_type: "number_exchange",
      format: "B",
      format_variant: "short",
      run_seed: 77
    },
    messages: [
      { from: "girl", text: "what do you want", type_at: 1 },
      { from: "boy", text: "to be honest im trying", type_at: 2.2 },
      { from: "girl", text: "ok maybe", type_at: 3.8 },
      { from: "boy", text: "idk maybe", type_at: 5.1 }
    ]
  };
}

function makeLogger() {
  const events = [];
  return {
    events,
    log(eventType, payload) {
      events.push({ eventType, payload });
    }
  };
}

(async function run() {
  const tmpLogs = fs.mkdtempSync(path.join(os.tmpdir(), "repair-test-"));

  const skipLogger = makeLogger();
  const highScore = await repairPayoff(
    buildScript(),
    { repair: { threshold: 6, max_rounds: 3, candidates_per_round: 3 } },
    skipLogger,
    {
      logsDir: tmpLogs,
      date: "2026-03-02",
      scorer: () => ({ total: 7.5, reason_codes: [] }),
      rewriter: async () => []
    }
  );
  assert(highScore.script.meta.repair_applied === false, "skip repair when already above threshold");
  assert(highScore.script.meta.repair_rounds === 0, "skip repair rounds=0");

  const improvingLogger = makeLogger();
  let scoreCall = 0;
  const contextBefore = JSON.stringify(buildScript().messages.slice(0, 2));
  const improving = await repairPayoff(
    buildScript(),
    { repair: { threshold: 6, max_rounds: 3, candidates_per_round: 3 } },
    improvingLogger,
    {
      logsDir: tmpLogs,
      date: "2026-03-02",
      scorer: () => {
        scoreCall += 1;
        if (scoreCall === 1) return { total: 3, reason_codes: ["no_callback"] };
        if (scoreCall <= 4) return { total: 4, reason_codes: ["no_callback"] };
        if (scoreCall <= 7) return { total: 7.2, reason_codes: [] };
        return { total: 7.2, reason_codes: [] };
      },
      rewriter: async ({ payoffRegion }) => payoffRegion.map((msg, idx) => ({ ...msg, text: idx === payoffRegion.length - 1 ? "meet me friday then" : msg.text }))
    }
  );
  assert(improving.script.meta.repair_applied === true, "repair applied when low initial score");
  assert(improving.script.meta.repair_rounds === 2, "repair exits in round 2 after passing threshold");
  assert(improving.script.meta.repair_failed === false, "repair_failed false after successful repair");
  assert(JSON.stringify(improving.script.messages.slice(0, 2)) === contextBefore, "context messages unchanged");

  const original = buildScript();
  const repaired = improving.script;
  const originalTail = original.messages.slice(-2);
  const repairedTail = repaired.messages.slice(-2);
  assert(repairedTail.every((msg, idx) => msg.from === originalTail[idx].from), "sender assignment preserved");
  assert(repairedTail.every((msg, idx) => msg.type_at === originalTail[idx].type_at), "type_at preserved");

  const exhaustedLogger = makeLogger();
  const exhausted = await repairPayoff(
    buildScript(),
    { repair: { threshold: 6, max_rounds: 3, candidates_per_round: 3 } },
    exhaustedLogger,
    {
      logsDir: tmpLogs,
      date: "2026-03-02",
      scorer: () => ({ total: 4.2, reason_codes: ["low_surprise"] }),
      rewriter: async ({ payoffRegion }) => payoffRegion
    }
  );
  assert(exhausted.script.meta.repair_failed === true, "repair_failed true after exhausting rounds");
  assert(exhausted.script.meta.repair_rounds === 3, "repair rounds capped at max_rounds");

  const repairsDir = path.join(tmpLogs, "repairs");
  const repairFiles = fs.existsSync(repairsDir)
    ? fs.readdirSync(repairsDir).filter((file) => file.endsWith(".json"))
    : [];
  assert(repairFiles.length >= 1, "repair artifact files created");

  fs.rmSync(tmpLogs, { recursive: true, force: true });

  if (failed > 0) {
    console.error(`repair.test.js: ${failed} failed`);
    process.exit(1);
  }
  console.log("repair.test.js: all passed");
})();
