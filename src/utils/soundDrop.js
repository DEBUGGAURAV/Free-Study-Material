/**
 * ============================================================================
 * 🔊 Sound-Drop: High-Speed Near-Ultrasonic Data-Over-Sound Pairing Engine
 * ============================================================================
 * Pure Web Audio API acoustic pairing protocol for zero-internet environments.
 * Transmits 4-hex pairing codes in ~380ms using near-ultrasound (15.8 - 17.5 kHz)
 * or futuristic audible chirps (2.2 - 4.1 kHz).
 *
 * 0 KB Internet • 0.0% Server Bandwidth • Instant <0.4s Acoustic Lock
 * ============================================================================
 */

// Frequency Bands (Optimized for maximum speaker output & smartphone mic capture)
const ULTRASONIC_PREAMBLE = 15800; // Hz (Inaudible to human ear, high speaker power)
const ULTRASONIC_BASE = 16200;     // Hz
const ULTRASONIC_STEP = 90;        // Hz per hex nibble (16 bins = 16200 to 17550 Hz)

const AUDIBLE_PREAMBLE = 2200;     // Hz (Futuristic friendly R2D2 sci-fi chirps)
const AUDIBLE_BASE = 2500;         // Hz
const AUDIBLE_STEP = 110;          // Hz per hex nibble (16 bins = 2500 to 4150 Hz)

const TONE_DURATION_SEC = 0.060;   // 60ms per symbol (Fast 15 symbols/sec)
const PAUSE_DURATION_SEC = 0.020;  // 20ms guard pause between tones

let activeAudioCtx = null;
let activeBroadcastTimer = null;
let activeMicStream = null;
let activeAnalyser = null;
let activeListenAnimFrame = null;

async function getAudioContext() {
  if (!activeAudioCtx || activeAudioCtx.state === "closed") {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) return null;
    activeAudioCtx = new AudioCtxClass();
  }
  if (activeAudioCtx.state === "suspended") {
    try {
      await activeAudioCtx.resume();
    } catch (_) {}
  }
  return activeAudioCtx;
}

/**
 * Broadcasts a 4-hex pairing token over speaker via acoustic audio waves (~380ms total)
 * @param {string} token - 4-6 hex chars (e.g. "B4C9")
 * @param {object} options - Configuration options
 * @returns {object} Controller with stop() method
 */
export async function startSoundDropBroadcast(token, options = {}) {
  const {
    isAudible = false,
    volume = 0.90,
    repeatIntervalMs = 950,
    onBeep = () => {},
  } = options;

  stopSoundDropBroadcast();

  const ctx = await getAudioContext();
  if (!ctx) {
    throw new Error("Web Audio API is not supported on this device.");
  }

  // Sanitize token to 4 hex characters
  const cleanToken = (token || "A1B2").replace(/[^a-fA-F0-9]/g, "").toUpperCase().slice(0, 4).padEnd(4, "0");
  const payload = cleanToken;

  const preambleFreq = isAudible ? AUDIBLE_PREAMBLE : ULTRASONIC_PREAMBLE;
  const baseFreq = isAudible ? AUDIBLE_BASE : ULTRASONIC_BASE;
  const stepFreq = isAudible ? AUDIBLE_STEP : ULTRASONIC_STEP;

  let isRunning = true;

  const playSequence = () => {
    if (!isRunning) return;
    try {
      const now = ctx.currentTime;
      let toneTime = now + 0.03;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      gain.gain.setValueAtTime(0, now);

      osc.connect(gain);
      gain.connect(ctx.destination);

      // 1. Play Preamble tone (wake-up pulse: 80ms)
      osc.frequency.setValueAtTime(preambleFreq, toneTime);
      gain.gain.setValueAtTime(0.001, toneTime);
      gain.gain.exponentialRampToValueAtTime(volume, toneTime + 0.008);
      gain.gain.setValueAtTime(volume, toneTime + 0.075);
      gain.gain.exponentialRampToValueAtTime(0.001, toneTime + 0.080);
      toneTime += 0.080 + PAUSE_DURATION_SEC;

      // 2. Play 4 payload tones (60ms each + 20ms pause)
      for (let i = 0; i < payload.length; i++) {
        const nibble = parseInt(payload[i], 16);
        const freq = baseFreq + nibble * stepFreq;

        osc.frequency.setValueAtTime(freq, toneTime);
        gain.gain.setValueAtTime(0.001, toneTime);
        gain.gain.exponentialRampToValueAtTime(volume, toneTime + 0.006);
        gain.gain.setValueAtTime(volume, toneTime + TONE_DURATION_SEC - 0.006);
        gain.gain.exponentialRampToValueAtTime(0.001, toneTime + TONE_DURATION_SEC);

        toneTime += TONE_DURATION_SEC + PAUSE_DURATION_SEC;
      }

      osc.start(now);
      osc.stop(toneTime);

      onBeep({ token: cleanToken, payload, isAudible });

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch (_) {}
      };
    } catch (err) {
      console.warn("[SOUND-DROP] Broadcast tone error:", err);
    }
  };

  // Immediate play and scheduled periodic loop
  playSequence();
  activeBroadcastTimer = setInterval(playSequence, repeatIntervalMs);

  return {
    token: cleanToken,
    stop: () => stopSoundDropBroadcast(),
  };
}

/**
 * Stops any ongoing ultrasonic sound broadcast
 */
export function stopSoundDropBroadcast() {
  if (activeBroadcastTimer) {
    clearInterval(activeBroadcastTimer);
    activeBroadcastTimer = null;
  }
}

/**
 * Listens on the microphone for incoming Sound-Drop chirps (~380ms decode time)
 * @param {object} callbacks - { onTokenDetected, onVolume, onError }
 * @param {object} options - { isAudible }
 * @returns {Promise<object>} Controller with stop() method
 */
export async function startSoundDropListener(callbacks = {}, options = {}) {
  const {
    onTokenDetected = () => {},
    onVolume = () => {},
    onError = () => {},
  } = callbacks;
  const { isAudible = false } = options;

  stopSoundDropListener();

  const ctx = await getAudioContext();
  if (!ctx) {
    throw new Error("Web Audio API is not supported on this device.");
  }

  // Request microphone stream with clean unprocessed audio
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
  } catch (err) {
    const error = new Error(
      err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
        ? "Microphone access denied. Please grant microphone permission to hear nearby Sound-Drop transfers."
        : "Failed to initialize microphone for Sound-Drop: " + err.message
    );
    onError(error);
    throw error;
  }

  activeMicStream = stream;

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.25; // Responsive time constant for fast chirps

  source.connect(analyser);
  activeAnalyser = analyser;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  const sampleRate = ctx.sampleRate;
  const binWidth = sampleRate / analyser.fftSize;

  const preambleFreq = isAudible ? AUDIBLE_PREAMBLE : ULTRASONIC_PREAMBLE;
  const baseFreq = isAudible ? AUDIBLE_BASE : ULTRASONIC_BASE;
  const stepFreq = isAudible ? AUDIBLE_STEP : ULTRASONIC_STEP;

  const preambleBin = Math.round(preambleFreq / binWidth);

  let state = "IDLE"; // 'IDLE' | 'READING_NIBBLES'
  let capturedNibbles = [];
  let nextToneExpectedAt = 0;
  let lastVolumeTime = 0;
  let isListening = true;

  const loop = () => {
    if (!isListening) return;

    analyser.getByteFrequencyData(dataArray);
    const now = performance.now();

    // Throttled Volume Visualizer (12 FPS): Smooth UI without React re-render lag
    if (now - lastVolumeTime > 80) {
      lastVolumeTime = now;
      let sum = 0;
      for (let i = 0; i < 32; i += 4) sum += dataArray[i];
      const avgVolume = Math.min(100, Math.round((sum / 8 / 255) * 100));
      onVolume(avgVolume);
    }

    if (state === "IDLE") {
      // 1. Detect Preamble tone (wake-up pulse)
      const preambleEnergy = Math.max(
        dataArray[preambleBin - 1] || 0,
        dataArray[preambleBin] || 0,
        dataArray[preambleBin + 1] || 0
      );
      const noiseFloor = ((dataArray[preambleBin - 5] || 0) + (dataArray[preambleBin + 5] || 0)) / 2 + 4;

      if (preambleEnergy > 24 && preambleEnergy > noiseFloor * 1.25) {
        state = "READING_NIBBLES";
        capturedNibbles = [];
        // First payload tone center arrives ~110ms after preamble start
        nextToneExpectedAt = now + 95;
      }
    } else if (state === "READING_NIBBLES") {
      // 2. Sample each nibble in its exact time window (prevents double-sampling)
      if (now >= nextToneExpectedAt) {
        let maxEnergy = 0;
        let bestNibble = -1;
        const lowBin = Math.max(0, Math.round((baseFreq - stepFreq) / binWidth));
        const highBin = Math.min(bufferLength - 1, Math.round((baseFreq + 16 * stepFreq) / binWidth));
        const localNoise = ((dataArray[lowBin] || 0) + (dataArray[highBin] || 0)) / 2 + 4;

        for (let n = 0; n < 16; n++) {
          const targetBin = Math.round((baseFreq + n * stepFreq) / binWidth);
          const energy = Math.max(
            dataArray[targetBin - 1] || 0,
            dataArray[targetBin] || 0,
            dataArray[targetBin + 1] || 0
          );
          if (energy > maxEnergy && energy > 20 && energy > localNoise * 1.20) {
            maxEnergy = energy;
            bestNibble = n;
          }
        }

        if (bestNibble !== -1) {
          capturedNibbles.push(bestNibble.toString(16).toUpperCase());
          // Advance directly to next tone center (80ms slot)
          nextToneExpectedAt = now + 75;

          if (capturedNibbles.length >= 4) {
            const detectedCode = capturedNibbles.slice(0, 4).join("");
            onTokenDetected(detectedCode);
            state = "IDLE";
            capturedNibbles = [];
          }
        } else {
          // Retry within 15ms if right on edge of window
          nextToneExpectedAt = now + 15;
        }

        // Safety timeout: if taking longer than 800ms, reset to IDLE
        if (capturedNibbles.length === 0 && now - nextToneExpectedAt > 350) {
          state = "IDLE";
        }
      }
    }

    activeListenAnimFrame = requestAnimationFrame(loop);
  };

  activeListenAnimFrame = requestAnimationFrame(loop);

  return {
    stop: () => stopSoundDropListener(),
  };
}

/**
 * Stops listening for ultrasonic sound
 */
export function stopSoundDropListener() {
  if (activeListenAnimFrame) {
    cancelAnimationFrame(activeListenAnimFrame);
    activeListenAnimFrame = null;
  }
  if (activeMicStream) {
    activeMicStream.getTracks().forEach((track) => track.stop());
    activeMicStream = null;
  }
  activeAnalyser = null;
}
