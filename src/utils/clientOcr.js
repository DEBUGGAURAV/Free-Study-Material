/**
 * Client-Side Handwritten Search & Recognition Engine (Tesseract.js WASM)
 * Runs in Browser Web Worker • 0.0% Server CPU • 100% Free
 * Features Adaptive Binarization for Notebook Scans & Indian Handwriting
 */
import { createWorker } from 'tesseract.js';

let ocrWorkerInstance = null;
let ocrWorkerPromise = null;

/**
 * Pre-warms the Tesseract WebAssembly engine in background idle time
 */
export function warmupClientOcr() {
  if (!ocrWorkerInstance && !ocrWorkerPromise) {
    getClientOcrWorker().catch(() => {});
  }
}

/**
 * Pre-processes canvas pixels to boost handwriting recognition:
 * 1. Checks if canvas is inverted (Night mode / dark background) and flips back to dark ink on white paper
 * 2. Adaptive contrast binarization: Sharpens pencil/pen strokes to pure black (#000)
 * 3. Washes out faint watermarks, paper grain, and shadows to pure white (#FFF)
 */
export function preprocessCanvasForHandwriting(sourceCanvas) {
  if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) return sourceCanvas;

  try {
    const offscreen = document.createElement('canvas');
    offscreen.width = sourceCanvas.width;
    offscreen.height = sourceCanvas.height;
    const ctx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!ctx) return sourceCanvas;

    // 1. Draw solid white background behind image
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    ctx.drawImage(sourceCanvas, 0, 0);

    // 2. Pixel data extraction for binarization
    const imgData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
    const data = imgData.data;
    const len = data.length;

    // Detect if background is dark (night mode or scanner inversion)
    let totalBrightness = 0;
    const step = 40;
    let samples = 0;
    for (let i = 0; i < len; i += step * 4) {
      totalBrightness += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      samples++;
    }
    const avgBrightness = samples > 0 ? totalBrightness / samples : 255;
    const isInverted = avgBrightness < 110;

    // Adaptive thresholding: pen strokes -> black, paper background -> white
    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      if (isInverted) {
        r = 255 - r;
        g = 255 - g;
        b = 255 - b;
      }

      const gray = 0.299 * r + 0.587 * g + 0.114 * b;

      // Threshold: sharpen pen ink lines to pure black; wash out shadows/paper grain to pure white
      if (gray < 165) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      } else {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return offscreen;
  } catch (err) {
    console.warn('[OCR-PREPROCESS] Preprocessing fallback:', err);
    return sourceCanvas;
  }
}

/**
 * Initializes or reuses the client-side Tesseract Web Worker
 * Uses local traineddata (/tesseract/lang-data) with graceful CDN fallback
 */
export async function getClientOcrWorker(onProgress = () => {}) {
  if (ocrWorkerInstance) {
    return ocrWorkerInstance;
  }
  if (ocrWorkerPromise) {
    return ocrWorkerPromise;
  }

  ocrWorkerPromise = (async () => {
    try {
      onProgress(15, 'Loading Tesseract neural OCR engine...');
      const worker = await createWorker('eng', 1, {
        workerBlobURL: true,
        langPath: '/tesseract/lang-data',
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const pct = Math.round(25 + (m.progress || 0) * 70);
            onProgress(pct, `Scanning handwriting & text: ${Math.round((m.progress || 0) * 100)}%`);
          } else if (m.status === 'loading language traineddata') {
            onProgress(20, `Loading OCR handwriting model: ${Math.round((m.progress || 0) * 100)}%`);
          } else if (m.status) {
            onProgress(15, `${m.status}...`);
          }
        },
        errorHandler: (e) => {
          console.warn('[CLIENT-OCR] Engine warning:', e);
        },
      });

      ocrWorkerInstance = worker;
      onProgress(25, 'Tesseract OCR Worker Ready.');
      return worker;
    } catch (primaryErr) {
      console.warn('[CLIENT-OCR] Primary local init notice:', primaryErr);
      try {
        const fallbackWorker = await createWorker('eng', 1, {
          workerBlobURL: true,
          logger: (m) => {
            if (m.status === 'recognizing text') {
              const pct = Math.round(25 + (m.progress || 0) * 70);
              onProgress(pct, `Scanning handwriting & text: ${Math.round((m.progress || 0) * 100)}%`);
            } else if (m.status) {
              onProgress(20, `${m.status}...`);
            }
          },
        });
        ocrWorkerInstance = fallbackWorker;
        return fallbackWorker;
      } catch (fallbackErr) {
        ocrWorkerPromise = null;
        ocrWorkerInstance = null;
        console.error('[CLIENT-OCR] OCR initialization failed:', fallbackErr);
        throw fallbackErr;
      }
    }
  })();

  return ocrWorkerPromise;
}

/**
 * Performs high-speed OCR recognition on an HTML Canvas element
 * Applies handwriting contrast binarization first, then runs Tesseract
 */
export async function recognizeCanvasText(canvas, onProgress = () => {}) {
  if (!canvas || !canvas.width || !canvas.height) return '';

  onProgress(15, 'Enhancing handwritten ink & paper contrast...');
  const enhancedCanvas = preprocessCanvasForHandwriting(canvas);

  const worker = await getClientOcrWorker(onProgress);

  onProgress(35, 'Analyzing handwriting with LSTM neural network...');
  const recognizePromise = worker.recognize(enhancedCanvas);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Handwritten scan taking longer than usual. Please retry.')), 45000)
  );

  const { data } = await Promise.race([recognizePromise, timeoutPromise]);

  const cleanedText = (data?.text || '')
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleanedText;
}

/**
 * Cleanly terminates the OCR worker to free browser RAM
 */
export async function terminateOcrWorker() {
  if (ocrWorkerInstance) {
    try {
      await ocrWorkerInstance.terminate();
    } catch (_) {}
    ocrWorkerInstance = null;
    ocrWorkerPromise = null;
  }
}
