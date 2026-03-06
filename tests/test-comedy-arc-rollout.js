/**
 * Guardrail tests for comedy-arc rollout safety.
 * Run: node tests/test-comedy-arc-rollout.js
 */

const { buildArcPlan } = require('../tools/generate');

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  \\u2713 ${label}`);
    passed += 1;
  } else {
    console.error(`  \\u2717 ${label}${detail ? `: ${detail}` : ''}`);
    failed += 1;
  }
}

function countsOf(plan) {
  return plan.reduce((acc, arc) => {
    acc[arc] = (acc[arc] || 0) + 1;
    return acc;
  }, {});
}

console.log('\nTest 1: comedy disabled (weight 0) never schedules comedy');
{
  const config = {
    arc_distribution: {
      number_exchange: 0.6,
      rejection: 0.2,
      plot_twist: 0.05,
      cliffhanger: 0.15,
      comedy: 0
    }
  };
  const plan = buildArcPlan({ count: 50, config, seed: 'comedy-off' });
  assert('plan has entries', plan.length === 50, `length=${plan.length}`);
  assert('plan contains no comedy', !plan.includes('comedy'));
}

console.log('\nTest 2: legacy 20-count plan remains unchanged when comedy is off');
{
  const config = {
    arc_distribution: {
      number_exchange: 0.6,
      rejection: 0.2,
      plot_twist: 0.05,
      cliffhanger: 0.15,
      comedy: 0
    }
  };
  const plan = buildArcPlan({ count: 20, config, seed: 'legacy-20' });
  const counts = countsOf(plan);
  assert('exactly 20 entries', plan.length === 20, `length=${plan.length}`);
  assert('number_exchange count preserved', counts.number_exchange === 12, JSON.stringify(counts));
  assert('rejection count preserved', counts.rejection === 4, JSON.stringify(counts));
  assert('plot_twist count preserved', counts.plot_twist === 1, JSON.stringify(counts));
  assert('cliffhanger count preserved', counts.cliffhanger === 3, JSON.stringify(counts));
  assert('no comedy in legacy plan', !counts.comedy, JSON.stringify(counts));
}

console.log('\nTest 3: comedy enabled schedules comedy and preserves configured arcs');
{
  const config = {
    arc_distribution: {
      number_exchange: 0.5,
      rejection: 0.2,
      plot_twist: 0.1,
      cliffhanger: 0.1,
      comedy: 0.1
    }
  };
  const plan = buildArcPlan({ count: 50, config, seed: 'comedy-on' });
  const counts = countsOf(plan);
  assert('plan has entries', plan.length === 50, `length=${plan.length}`);
  assert('comedy appears when enabled', (counts.comedy || 0) > 0, JSON.stringify(counts));
  assert('no unknown arcs appear', Object.keys(counts).every((arc) => Object.prototype.hasOwnProperty.call(config.arc_distribution, arc)), JSON.stringify(counts));
}

console.log(`\\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
