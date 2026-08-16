import { useEffect, useRef, useState } from 'react';
import { createStepDetector, processMotionSample } from './stepDetector';

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

const SAVE_INTERVAL_MS = 5000;

// Counts steps from devicemotion while the challenge window is open and
// periodically reports the total via onSave(steps).
export function useStepCounter({ enabled, challenge, serverNow, initialSteps = 0, onSave }) {
  const [steps, setSteps] = useState(initialSteps);
  const stepsRef = useRef(initialSteps);
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
    const detector = createStepDetector();

    function handleMotion(event) {
      const current = challengeRef.current;
      const now = serverNow ? serverNow() : Date.now();
      if (!current || current.status !== 'active') return;
      if (now < current.startAtMs || now > current.endAtMs) return;

      const wallNow = Date.now();
      const detectedSteps = processMotionSample(detector, event, wallNow);
      if (detectedSteps > 0) {
        stepsRef.current += detectedSteps;
        setSteps(stepsRef.current);

        if (wallNow - lastSaveAtRef.current >= SAVE_INTERVAL_MS) {
          lastSaveAtRef.current = wallNow;
          onSaveRef.current?.(stepsRef.current);
        }
      }
    }

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [challengeId, enabled, serverNow]);

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
