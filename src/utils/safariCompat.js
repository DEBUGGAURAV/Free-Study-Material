/**
 * ============================================================================
 * 🧭 SAFARI / WEBKIT (iOS, iPadOS, macOS) COMPATIBILITY & POLYFILL ENGINE
 * ============================================================================
 * Fixes 5 core WebKit limitations that break Circle-to-Search & PDF.js v6:
 * 1. Polyfills `Promise.withResolvers` (Safari < 17.4) & `URL.parse` (Safari < 18.0)
 *    required by `pdfjs-dist@6.x` so PDFs render on `<canvas>` instead of falling
 *    back to an un-circleable native `<iframe>`.
 * 2. Non-passive `{ passive: false }` native `touchstart`/`touchmove` lock so iOS
 *    Safari does NOT hijack finger / Apple Pencil drawing into rubber-band scrolling
 *    (`pointercancel`).
 * 3. Safari-safe Clipboard helper (`ClipboardItem` Promise + `execCommand` fallback)
 *    because WebKit blocks `navigator.clipboard.writeText` after `await`.
 * ============================================================================
 */

import { useEffect } from "react";

export function installSafariPolyfills() {
  // 1. Promise.withResolvers polyfill (Required by pdfjs-dist v4/v5/v6 on Safari < 17.4)
  if (typeof Promise !== "undefined" && typeof Promise.withResolvers !== "function") {
    Promise.withResolvers = function withResolvers() {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }

  // 2. URL.parse polyfill (Required by pdfjs-dist v5/v6 on Safari < 18.0)
  if (typeof URL !== "undefined" && typeof URL.parse !== "function") {
    URL.parse = function parseUrl(url, base) {
      try {
        return base !== undefined ? new URL(url, base) : new URL(url);
      } catch (_) {
        return null;
      }
    };
  }

  // 3. Map / WeakMap getOrInsert & getOrInsertComputed polyfills (Required by pdfjs-dist v6 on Safari WebKit)
  if (typeof Map !== "undefined" && Map.prototype) {
    if (typeof Map.prototype.getOrInsert !== "function") {
      Object.defineProperty(Map.prototype, "getOrInsert", {
        configurable: true,
        writable: true,
        value: function getOrInsert(key, defaultValue) {
          if (this.has(key)) return this.get(key);
          this.set(key, defaultValue);
          return defaultValue;
        },
      });
    }
    if (typeof Map.prototype.getOrInsertComputed !== "function") {
      Object.defineProperty(Map.prototype, "getOrInsertComputed", {
        configurable: true,
        writable: true,
        value: function getOrInsertComputed(key, callbackfn) {
          if (this.has(key)) return this.get(key);
          const val = callbackfn(key);
          this.set(key, val);
          return val;
        },
      });
    }
  }

  if (typeof WeakMap !== "undefined" && WeakMap.prototype) {
    if (typeof WeakMap.prototype.getOrInsert !== "function") {
      Object.defineProperty(WeakMap.prototype, "getOrInsert", {
        configurable: true,
        writable: true,
        value: function getOrInsert(key, defaultValue) {
          if (this.has(key)) return this.get(key);
          this.set(key, defaultValue);
          return defaultValue;
        },
      });
    }
    if (typeof WeakMap.prototype.getOrInsertComputed !== "function") {
      Object.defineProperty(WeakMap.prototype, "getOrInsertComputed", {
        configurable: true,
        writable: true,
        value: function getOrInsertComputed(key, callbackfn) {
          if (this.has(key)) return this.get(key);
          const val = callbackfn(key);
          this.set(key, val);
          return val;
        },
      });
    }
  }
}

// Install immediately on module evaluation before lazy chunks load
installSafariPolyfills();

/**
 * Fallback synchronous copy using a temporary off-screen <textarea>
 * Works in Safari even after async/await boundaries when Clipboard API rejects.
 */
function fallbackExecCommandCopy(text) {
  if (typeof document === "undefined" || !text) return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.left = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

/**
 * Safari-safe clipboard copy for immediate strings OR async OCR Promises.
 * - For async OCR in Safari: registers `ClipboardItem({ "text/plain": Promise<Blob> })`
 *   synchronously inside the user tap gesture before `await` expires activation!
 */
export async function copyTextSafariSafe(textOrAsyncFn) {
  if (typeof textOrAsyncFn === "function") {
    let memoPromise = null;
    const runOnce = () => {
      if (!memoPromise) {
        memoPromise = Promise.resolve().then(() => textOrAsyncFn());
      }
      return memoPromise;
    };

    // Safari supports ClipboardItem with a Promise<Blob> if invoked synchronously in click handler!
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard?.write &&
      typeof window !== "undefined" &&
      typeof window.ClipboardItem !== "undefined"
    ) {
      let resolvedText = "";
      try {
        const blobPromise = runOnce().then((txt) => {
          resolvedText = String(txt || "").trim();
          if (!resolvedText) throw new Error("Empty OCR text");
          return new Blob([resolvedText], { type: "text/plain" });
        });

        await navigator.clipboard.write([
          new window.ClipboardItem({ "text/plain": blobPromise }),
        ]);
        return resolvedText;
      } catch (_) {
        if (resolvedText) {
          fallbackExecCommandCopy(resolvedText);
          return resolvedText;
        }
      }
    }

    // Standard fallback for browsers without Promise ClipboardItem
    const produced = String((await runOnce()) || "").trim();
    if (!produced) return "";
    try {
      await navigator.clipboard.writeText(produced);
      return produced;
    } catch (_) {
      fallbackExecCommandCopy(produced);
      return produced;
    }
  }

  const str = String(textOrAsyncFn || "").trim();
  if (!str) return "";
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(str);
      return str;
    }
  } catch (_) {}
  fallbackExecCommandCopy(str);
  return str;
}

/**
 * Prevents iOS / iPadOS Safari from hijacking touch drags into page scrolling
 * or firing `pointercancel` on freehand pencil canvases/overlays.
 */
export function useSafariNonPassiveTouchLock(elementRef, enabled = true, ignoreSelector = "[data-pencil-toolbar='true'], [data-circle-pill='true'], button, input") {
  useEffect(() => {
    const el = elementRef?.current;
    if (!el || !enabled) return;

    const preventSafariScroll = (e) => {
      if (ignoreSelector && e.target?.closest?.(ignoreSelector)) {
        return;
      }
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    el.addEventListener("touchstart", preventSafariScroll, { passive: false });
    el.addEventListener("touchmove", preventSafariScroll, { passive: false });

    return () => {
      el.removeEventListener("touchstart", preventSafariScroll);
      el.removeEventListener("touchmove", preventSafariScroll);
    };
  }, [elementRef, enabled, ignoreSelector]);
}
