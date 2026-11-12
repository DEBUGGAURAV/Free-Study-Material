/**
 * ⚡ Shared Runtime Reader & Reactive Hook for Admin Tech Nexus Flags
 * Allows any nested UI widget (Mermaid, Web Push Bell, Shareable Card) to react
 * immediately when Admin toggles features ON/OFF without prop-drilling everywhere.
 */
import { useEffect, useState } from "react";

const DEFAULT_FLAGS = {
  enableAiMermaid: true,
  enableWebPush: true,
  enableShareRevisionCard: true,
};

export function readCachedTechFlags() {
  if (typeof window === "undefined") return { ...DEFAULT_FLAGS };
  try {
    const raw = window.localStorage.getItem("fsm_offline_flags");
    if (!raw) return { ...DEFAULT_FLAGS };
    const parsed = JSON.parse(raw);
    const flags = parsed?.flags || parsed || {};
    return {
      enableAiMermaid: flags.enableAiMermaid !== false,
      enableWebPush: flags.enableWebPush !== false,
      enableShareRevisionCard: flags.enableShareRevisionCard !== false,
    };
  } catch {
    return { ...DEFAULT_FLAGS };
  }
}

export function broadcastTechFlagsUpdate(flagsObj = {}) {
  if (typeof window === "undefined") return;
  try {
    const existingRaw = window.localStorage.getItem("fsm_offline_flags");
    const existingParsed = existingRaw ? JSON.parse(existingRaw) : {};
    const mergedFlags = {
      ...(existingParsed?.flags || {}),
      ...flagsObj,
    };
    window.localStorage.setItem(
      "fsm_offline_flags",
      JSON.stringify({ ...existingParsed, flags: mergedFlags })
    );
  } catch (_) {}

  try {
    window.dispatchEvent(
      new CustomEvent("fsm:tech-flags-updated", { detail: flagsObj })
    );
  } catch (_) {}
}

export function useTechFlags() {
  const [flags, setFlags] = useState(() => readCachedTechFlags());

  useEffect(() => {
    const sync = () => setFlags(readCachedTechFlags());
    window.addEventListener("fsm:tech-flags-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("fsm:tech-flags-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return flags;
}
