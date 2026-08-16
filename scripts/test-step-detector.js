import assert from 'node:assert/strict';
import { createStepDetector, processMotionSample } from '../src/hooks/stepDetector.js';

function runPulseSequence({ durationMs, pulseEveryMs, pulseStrength = 8, sampleEveryMs = 20 }) {
  const detector = createStepDetector();
  let steps = 0;
  for (let now = 1; now <= durationMs; now += sampleEveryMs) {
    const isPulse = (now - 1) % pulseEveryMs === 0;
    steps += processMotionSample(
      detector,
      { acceleration: { x: 0, y: 0, z: isPulse ? pulseStrength : 0 } },
      now
    );
  }
  return steps;
}

function runIrregularSteps(intervals) {
  const detector = createStepDetector();
  const pulseTimes = [1];
  for (const interval of intervals) pulseTimes.push(pulseTimes.at(-1) + interval);
  const pulses = new Set(pulseTimes);
  let steps = 0;
  for (let now = 1; now <= pulseTimes.at(-1) + 500; now += 10) {
    steps += processMotionSample(
      detector,
      { acceleration: { x: 0, y: 0, z: pulses.has(now) ? 6 : 0 } },
      now
    );
  }
  return steps;
}

assert.equal(runPulseSequence({ durationMs: 5000, pulseEveryMs: 500 }), 10);
assert.equal(runIrregularSteps([500, 400, 700, 300, 800, 500, 600]), 8);
assert.equal(runPulseSequence({ durationMs: 3000, pulseEveryMs: 120 }), 0);
assert.equal(runPulseSequence({ durationMs: 3000, pulseEveryMs: 1500 }), 0);

const gravityDetector = createStepDetector();
let gravitySteps = 0;
for (let now = 1; now <= 3000; now += 20) {
  gravitySteps += processMotionSample(
    gravityDetector,
    { accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 } },
    now
  );
}
assert.equal(gravitySteps, 0);

console.log('Step detector checks passed.');
