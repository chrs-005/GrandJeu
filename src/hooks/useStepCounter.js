import { useEffect, useRef, useState } from 'react';

export function isMotionSupported() {
  return 'DeviceMotionEvent' in window;
}

export async function requestMotionPermission() {
  if (!isMotionSupported()) throw new Error('Capteur de mouvement non supporté sur cet appareil.');
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    const result = await DeviceMotionEvent.requestPermission();
    if (result !== 'granted') throw new Error(`Permission mouvement ${result}`);
  }
  return true;
}

const STEP_THRESHOLD = 16.5;
const STEP_DEBOUNCE_MS = 450;
const SAVE_INTERVAL_MS = 5000;

// Counts steps from devicemotion while the challenge window is open and
// periodically reports the total via onSave(steps).
export function useStepCounter({ enabled, challenge, serverNow, initialSteps = 0, onSave }) {
  const [steps, setSteps] = useState(initialSteps);
  const stepsRef = useRef(initialSteps);
  const lastStepAtRef = useRef(0);
  const lastSaveAtRef = useRef(0);
  const challengeRef = useRef(challenge);
  const onSaveRef = useRef(onSave);
  challengeRef.current = challenge;
  onSaveRef.current = onSave;

  // Reset when a new challenge starts.
  const challengeId = challenge?.id;
  useEffect(() => {
    stepsRef.current = initialSteps;
    setSteps(initialSteps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId]);

  useEffect(() => {
    if (!enabled) return undefined;

    function handleMotion(event) {
      const current = challengeRef.current;
      const now = serverNow ? serverNow() : Date.now();
      if (!current || current.status !== 'active') return;
      if (now < current.startAtMs || now > current.endAtMs) return;

      const acceleration = event.accelerationIncludingGravity || event.acceleration;
      if (!acceleration) return;
      const x = acceleration.x || 0;
      const y = acceleration.y || 0;
      const z = acceleration.z || 0;
      const magnitude = Math.sqrt(x * x + y * y + z * z);

      const wallNow = Date.now();
      if (magnitude > STEP_THRESHOLD && wallNow - lastStepAtRef.current > STEP_DEBOUNCE_MS) {
        lastStepAtRef.current = wallNow;
        stepsRef.current += 1;
        setSteps(stepsRef.current);

        if (wallNow - lastSaveAtRef.current >= SAVE_INTERVAL_MS) {
          lastSaveAtRef.current = wallNow;
          onSaveRef.current?.(stepsRef.current);
        }
      }
    }

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [enabled, serverNow]);

  // Final save shortly after the challenge ends so the last count lands.
  useEffect(() => {
    if (!enabled || !challenge?.endAtMs) return undefined;
    const now = serverNow ? serverNow() : Date.now();
    const delay = challenge.endAtMs - now + 2000;
    if (delay < 0) return undefined;
    const id = setTimeout(() => onSaveRef.current?.(stepsRef.current), delay);
    return () => clearTimeout(id);
  }, [enabled, challenge?.endAtMs, serverNow]);

  return steps;
}
