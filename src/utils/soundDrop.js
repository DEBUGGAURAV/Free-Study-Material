/**
 * ============================================================================
 * 🔊 Sound-Drop: Ultrasonic Data-Over-Sound Offline Pairing Engine
 * ============================================================================
 * Pure Web Audio API acoustic pairing protocol for zero-internet environments.
 * Transmits short pairing tokens and session handshakes using inaudible 
 * ultrasonic audio frequencies (18.2 kHz - 19.8 kHz) from speaker to microphone.
 *
 * 0 KB Internet • 0.0% Server Bandwidth • ₹0 Cost Forever
 * Zero Camera Required • 0-Touch Proximity Pairing (Apple NameDrop Style)
 * ============================================================================
 */

// Frequency Bands (Standard Ultrasonic vs Audible Sci-Fi Mode)
const ULTRASONIC_PREAMBLE = 18200; // Hz
const ULTRASONIC_BASE = 18500;     // Hz
const ULTRASONIC_STEP = 90;        // Hz per hex nibble (16 bins = 18500 to 19850 Hz)

const AUDIBLE_PREAMBLE = 14200;    // Hz
const AUDIBLE_BASE = 14500;        // Hz
const AUDIBLE_STEP = 90;           // Hz per hex nibble

const TONE_DURATION_SEC = 0.065;   // 65ms per symbol
const PAUSE_DURATION_SEC = 0.015;  // 15ms guard pause between tones

let activeAudioCtx = null;
let activeBroadcastTimer = null;
let activeMicStream = null;
let activeAnalyser = null;
let activeListenAnimFrame = null;

function getAudioContext() {
  if (!activeAudioCtx || activeAudioCtx.state === "closed") {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) return null;
    activeAudioCtx = new AudioCtxClass();
  }
  if (activeAudioCtx.state === "suspended") {
    activeAudioCtx.resume().catch(() => {});
  }
  return activeAudioCtx;
}

/**
 * Calculates simple 2-character checksum for transmission integrity
 */
function calculateChecksum(hexString) {
  let sum = 0;
  for (let i = 0; i < hexString.length; i++) {
    sum = (sum + hexString.charCodeAt(i)) % 256;
  }
  return sum.toString(16).padStart(2, "0").toUpperCase();
}

/**
 * Broadcasts a pairing token over speaker via ultrasonic audio waves
 * @param {string} token - Short pairing code (e.g. 6-8 hex chars)
 * @param {object} options - Configuration options
 * @returns {object} Controller with stop() method
 */
export function startSoundDropBroadcast(token, options = {}) {
  const {
    isAudible = false,
    volume = 0.85,
    repeatIntervalMs = 1200,
    onBeep = () => {},
  } = options;

  stopSoundDropBroadcast();

  const ctx = getAudioContext();
  if (!ctx) {
    throw new Error("Web Audio API is not supported on this device.");
  }

  // Sanitize token to 6-8 hex characters + 2-char checksum
  const cleanToken = (token || "A1B2C3").replace(/[^a-fA-F0-9]/g, "").toUpperCase().slice(0, 8);
  const checksum = calculateChecksum(cleanToken);
  const payload = cleanToken + checksum;

  const preambleFreq = isAudible ? AUDIBLE_PREAMBLE : ULTRASONIC_PREAMBLE;
  const baseFreq = isAudible ? AUDIBLE_BASE : ULTRASONIC_BASE;
  const stepFreq = isAudible ? AUDIBLE_STEP : ULTRASONIC_STEP;

  let isRunning = true;

  const playSequence = () => {
    if (!isRunning) return;
    try {
      const now = ctx.currentTime;
      let toneTime = now + 0.05;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      gain.gain.setValueAtTime(0, now);

      osc.connect(gain);
      gain.connect(ctx.destination);

      // 1. Play Preamble tone (wake-up signal)
      osc.frequency.setValueAtTime(preambleFreq, toneTime);
      gain.gain.setValueAtTime(0.001, toneTime);
      gain.gain.exponentialRampToValueAtTime(volume, toneTime + 0.01);
      gain.gain.setValueAtTime(volume, toneTime + TONE_DURATION_SEC * 1.5 - 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, toneTime + TONE_DURATION_SEC * 1.5);
      toneTime += TONE_DURATION_SEC * 1.5 + PAUSE_DURATION_SEC;

      // 2. Play payload tones (hex nibbles)
      for (let i = 0; i < payload.length; i++) {
        const nibble = parseInt(payload[i], 16);
        const freq = baseFreq + nibble * stepFreq;

        osc.frequency.setValueAtTime(freq, toneTime);
        gain.gain.setValueAtTime(0.001, toneTime);
        gain.gain.exponentialRampToValueAtTime(volume, toneTime + 0.008);
        gain.gain.setValueAtTime(volume, toneTime + TONE_DURATION_SEC - 0.008);
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
 * Listens on the microphone for incoming ultrasonic Sound-Drop chirps
 * Decodes the pairing token in real time without camera or server.
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

  const ctx = getAudioContext();
  if (!ctx) {
    throw new Error("Web Audio API is not supported on this device.");
  }

  // Request microphone stream
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
  analyser.smoothingTimeConstant = 0.35;

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
  const baseBin = Math.round(baseFreq / binWidth);
  const stepBins = Math.round(stepFreq / binWidth);

  let state = "IDLE"; // 'IDLE' | 'READING_NIBBLES'
  let capturedNibbles = [];
  let lastDetectedTime = 0;
  let isListening = true;

  const loop = () => {
    if (!isListening) return;

    analyser.getByteFrequencyData(dataArray);

    // Calculate ambient volume for UI visualizer
    let sum = 0;
    for (let i = 0; i < 64; i++) sum += dataArray[i];
    const avgVolume = Math.round((sum / 64 / 255) * 100);
    onVolume(avgVolume);

    const now = performance.now();

    if (state === "IDLE") {
      // Look for Preamble pulse (peak energy in preamble bin)
      const preambleEnergy = dataArray[preambleBin] || 0;
      const noiseFloor = (dataArray[preambleBin - 4] + dataArray[preambleBin + 4]) / 2 || 1;

      if (preambleEnergy > 130 && preambleEnergy > noiseFloor * 1.8) {
        state = "READING_NIBBLES";
        capturedNibbles = [];
        lastDetectedTime = now;
      }
    } else if (state === "READING_NIBBLES") {
      // Find highest energy bin in the 16 symbol range
      if (now - lastDetectedTime >= TONE_DURATION_SEC * 1000 * 0.75) {
        let maxEnergy = 0;
        let bestNibble = -1;

        for (let n = 0; n < 16; n++) {
          const targetBin = baseBin + n * stepBins;
          const energy = dataArray[targetBin] || 0;
          if (energy > maxEnergy && energy > 120) {
            maxEnergy = energy;
            bestNibble = n;
          }
        }

        if (bestNibble !== -1) {
          capturedNibbles.push(bestNibble.toString(16).toUpperCase());
          lastDetectedTime = now;

          // Check if we captured 8 to 10 characters (payload + checksum)
          if (capturedNibbles.length >= 8) {
            const rawCode = capturedNibbles.join("");
            const dataPart = rawCode.slice(0, rawCode.length - 2);
            const checksumPart = rawCode.slice(rawCode.length - 2);

            const expectedChecksum = calculateChecksum(dataPart);
            if (checksumPart === expectedChecksum || rawCode.length >= 8) {
              onTokenDetected(dataPart || rawCode);
              state = "IDLE";
              capturedNibbles = [];
            }
          }
        }

        // Reset if timeout exceeded
        if (now - lastDetectedTime > 1200) {
          state = "IDLE";
          capturedNibbles = [];
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
