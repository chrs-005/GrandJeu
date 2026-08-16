const GRAVITY_FILTER_ALPHA = 0.9;
const MAGNITUDE_SMOOTHING = 0.4;
const STEP_TRIGGER = 2.4;
const STEP_RESET = 1.0;
const MAX_STEP_ACCELERATION = 16;
const MIN_STEP_INTERVAL_MS = 300;
const MAX_STEP_INTERVAL_MS = 1000;
const CADENCE_TOLERANCE_MS = 120;
const CADENCE_TOLERANCE_RATIO = 0.3;
const REQUIRED_CADENCE_PEAKS = 3;

export function createStepDetector() {
  return {
    gravity: null,
    smoothedMagnitude: 0,
    armed: true,
    lastPeakAt: 0,
    lastInterval: 0,
    cadencePeaks: 0,
    cadenceConfirmed: false,
  };
}

function readVector(value) {
  if (!value) return null;
  const values = [value.x, value.y, value.z].map(Number);
  if (!values.some(Number.isFinite)) return null;
  return values.map((axis) => (Number.isFinite(axis) ? axis : 0));
}

function getLinearAcceleration(detector, event) {
  const acceleration = readVector(event.acceleration);
  if (acceleration) return acceleration;

  const total = readVector(event.accelerationIncludingGravity);
  if (!total) return null;
  if (!detector.gravity) {
    detector.gravity = [...total];
    return null;
  }

  detector.gravity = detector.gravity.map(
    (gravityAxis, index) =>
      GRAVITY_FILTER_ALPHA * gravityAxis + (1 - GRAVITY_FILTER_ALPHA) * total[index]
  );
  return total.map((axis, index) => axis - detector.gravity[index]);
}

function resetCadence(detector, peakAt) {
  detector.lastPeakAt = peakAt;
  detector.lastInterval = 0;
  detector.cadencePeaks = 1;
  detector.cadenceConfirmed = false;
}

function registerPeak(detector, peakAt) {
  if (!detector.lastPeakAt) {
    resetCadence(detector, peakAt);
    return 0;
  }

  const interval = peakAt - detector.lastPeakAt;
  if (interval < MIN_STEP_INTERVAL_MS || interval > MAX_STEP_INTERVAL_MS) {
    resetCadence(detector, peakAt);
    return 0;
  }

  const tolerance = Math.max(
    CADENCE_TOLERANCE_MS,
    detector.lastInterval * CADENCE_TOLERANCE_RATIO
  );
  if (detector.lastInterval && Math.abs(interval - detector.lastInterval) > tolerance) {
    detector.lastPeakAt = peakAt;
    detector.lastInterval = interval;
    detector.cadencePeaks = 2;
    detector.cadenceConfirmed = false;
    return 0;
  }

  detector.lastPeakAt = peakAt;
  detector.lastInterval = interval;
  detector.cadencePeaks += 1;

  if (!detector.cadenceConfirmed) {
    if (detector.cadencePeaks < REQUIRED_CADENCE_PEAKS) return 0;
    detector.cadenceConfirmed = true;
  }

  return 1;
}

export function processMotionSample(detector, event, now = Date.now()) {
  const linear = getLinearAcceleration(detector, event);
  if (!linear) return 0;

  const magnitude = Math.hypot(...linear);
  detector.smoothedMagnitude +=
    MAGNITUDE_SMOOTHING * (magnitude - detector.smoothedMagnitude);

  if (detector.smoothedMagnitude <= STEP_RESET) {
    detector.armed = true;
    return 0;
  }

  if (!detector.armed || detector.smoothedMagnitude < STEP_TRIGGER) return 0;
  detector.armed = false;

  if (detector.smoothedMagnitude > MAX_STEP_ACCELERATION) {
    resetCadence(detector, now);
    return 0;
  }

  return registerPeak(detector, now);
}
