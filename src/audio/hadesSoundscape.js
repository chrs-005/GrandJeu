const SILENCE = 0.0001;

function makeAmbientNoise(context, duration = 3) {
  const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
  const data = buffer.getChannelData(0);
  let previous = 0;

  for (let index = 0; index < data.length; index += 1) {
    previous = previous * 0.965 + (Math.random() * 2 - 1) * 0.035;
    data[index] = Math.max(-1, Math.min(1, previous * 3.2));
  }

  return buffer;
}

function makeImpactNoise(context, duration = 2.4) {
  const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < data.length; index += 1) {
    const progress = index / data.length;
    data[index] = (Math.random() * 2 - 1) * Math.exp(-progress * 6);
  }

  return buffer;
}

export function createHadesSoundscape() {
  let context;
  let master;
  let ambientBus;
  let started = false;
  let revealed = false;
  const drones = [];
  const sources = new Set();

  function track(source) {
    sources.add(source);
    source.addEventListener('ended', () => sources.delete(source), { once: true });
    return source;
  }

  function ensureContext() {
    if (context) return context;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = SILENCE;

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 18;
    compressor.ratio.value = 7;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.45;
    master.connect(compressor).connect(context.destination);
    return context;
  }

  function addDrone(frequency, type, level) {
    const oscillator = track(context.createOscillator());
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;
    filter.type = 'lowpass';
    filter.frequency.value = 185;
    filter.Q.value = 1.4;
    gain.gain.value = level;
    oscillator.connect(filter).connect(gain).connect(ambientBus);
    oscillator.start();
    drones.push({ oscillator, filter });
  }

  function start() {
    const audio = ensureContext();
    if (!audio) return;
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    if (started) return;
    started = true;

    const now = audio.currentTime;
    ambientBus = audio.createGain();
    ambientBus.gain.value = 0.7;
    ambientBus.connect(master);

    addDrone(36.71, 'sine', 0.15);
    addDrone(55, 'triangle', 0.085);
    addDrone(73.42, 'sawtooth', 0.035);

    const pulse = track(audio.createOscillator());
    const pulseDepth = audio.createGain();
    pulse.type = 'sine';
    pulse.frequency.value = 0.085;
    pulseDepth.gain.value = 0.16;
    pulse.connect(pulseDepth).connect(ambientBus.gain);
    pulse.start();

    const noise = track(audio.createBufferSource());
    const noiseFilter = audio.createBiquadFilter();
    const noiseGain = audio.createGain();
    noise.buffer = makeAmbientNoise(audio);
    noise.loop = true;
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 240;
    noiseGain.gain.value = 0.045;
    noise.connect(noiseFilter).connect(noiseGain).connect(ambientBus);
    noise.start();

    master.gain.setValueAtTime(SILENCE, now);
    master.gain.linearRampToValueAtTime(0.32, now + 2.8);
  }

  function addRevealImpact(now) {
    const impact = track(context.createOscillator());
    const impactGain = context.createGain();
    impact.type = 'sine';
    impact.frequency.setValueAtTime(92, now);
    impact.frequency.exponentialRampToValueAtTime(29, now + 3.1);
    impactGain.gain.setValueAtTime(SILENCE, now);
    impactGain.gain.exponentialRampToValueAtTime(0.72, now + 0.035);
    impactGain.gain.exponentialRampToValueAtTime(SILENCE, now + 3.2);
    impact.connect(impactGain).connect(master);
    impact.start(now);
    impact.stop(now + 3.25);

    const noise = track(context.createBufferSource());
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = makeImpactNoise(context);
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(760, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(75, now + 2.3);
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(SILENCE, now + 2.35);
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start(now);
    noise.stop(now + 2.4);
  }

  function addRevealRise(now) {
    const rise = track(context.createOscillator());
    const riseFilter = context.createBiquadFilter();
    const riseGain = context.createGain();
    rise.type = 'sawtooth';
    rise.frequency.setValueAtTime(43.65, now);
    rise.frequency.exponentialRampToValueAtTime(130.81, now + 4.6);
    riseFilter.type = 'lowpass';
    riseFilter.frequency.setValueAtTime(120, now);
    riseFilter.frequency.exponentialRampToValueAtTime(1100, now + 4.2);
    riseGain.gain.setValueAtTime(SILENCE, now);
    riseGain.gain.exponentialRampToValueAtTime(0.17, now + 3.7);
    riseGain.gain.exponentialRampToValueAtTime(SILENCE, now + 5.4);
    rise.connect(riseFilter).connect(riseGain).connect(master);
    rise.start(now);
    rise.stop(now + 5.45);
  }

  function reveal() {
    start();
    if (!context || revealed) return;
    revealed = true;
    const now = context.currentTime;

    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.07), now);
    master.gain.linearRampToValueAtTime(0.34, now + 0.18);

    ambientBus.gain.cancelScheduledValues(now);
    ambientBus.gain.setValueAtTime(ambientBus.gain.value, now);
    ambientBus.gain.linearRampToValueAtTime(0.42, now + 0.45);
    ambientBus.gain.linearRampToValueAtTime(0.76, now + 5.4);

    const finalFrequencies = [32.7, 49, 65.41];
    drones.forEach(({ oscillator, filter }, index) => {
      oscillator.frequency.cancelScheduledValues(now);
      oscillator.frequency.setValueAtTime(oscillator.frequency.value, now);
      oscillator.frequency.exponentialRampToValueAtTime(finalFrequencies[index], now + 4.8);
      filter.frequency.exponentialRampToValueAtTime(430, now + 4.2);
      filter.frequency.exponentialRampToValueAtTime(190, now + 6.2);
    });

    addRevealImpact(now);
    addRevealRise(now);
  }

  function stop() {
    sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // The source may already have ended naturally.
      }
    });
    sources.clear();
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }

  return { reveal, start, stop };
}
