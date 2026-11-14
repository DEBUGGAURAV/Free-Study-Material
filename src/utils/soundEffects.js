/**
 * 🎵 Web Audio Sound & Haptic Synthesizer
 * 100% zero-dependency browser synthesis (0 KB audio file downloads).
 * Delivers luxury micro-interactions (pops, chimes, success arpeggios) + mobile haptics.
 */

let audioCtx = null;
let soundEnabled = true;

// Check localStorage for user sound preference
if (typeof window !== "undefined") {
  try {
    const stored = localStorage.getItem("fsm_sound_effects");
    if (stored !== null) soundEnabled = stored === "true";
  } catch (_) {}
}

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function triggerHaptic(pattern = [15]) {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch (_) {}
}

export function playPop() {
  if (!soundEnabled) return;
  triggerHaptic([10]);
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(540, now + 0.05);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  } catch (_) {}
}

export function playChime() {
  if (!soundEnabled) return;
  triggerHaptic([15, 30, 20]);
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Harmonious dual bell: C6 (1046.5 Hz) + E6 (1318.5 Hz)
    [1046.5, 1318.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.05;

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.07, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0006, startTime + 0.32);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.32);
    });
  } catch (_) {}
}

export function playSuccess() {
  if (!soundEnabled) return;
  triggerHaptic([20, 35, 25]);
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Pleasant ascending triad: G5 (784Hz), C6 (1046.5Hz), G6 (1568Hz)
    [783.99, 1046.5, 1567.98].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.06;

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.06, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0008, startTime + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.28);
    });
  } catch (_) {}
}

export function isSoundEnabled() {
  return soundEnabled;
}

export function toggleSound(forceState) {
  soundEnabled = forceState !== undefined ? Boolean(forceState) : !soundEnabled;
  try {
    localStorage.setItem("fsm_sound_effects", String(soundEnabled));
  } catch (_) {}
  return soundEnabled;
}
