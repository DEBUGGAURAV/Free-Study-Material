/**
 * ============================================================================
 * 🔑 PASSKEY CLIENT HELPER (WEBAUTHN / BIOMETRICS)
 * ============================================================================
 * Supports:
 * - Face ID, Fingerprint (Touch ID, Android Biometrics), Windows Hello, PIN, YubiKey
 * - Automatic hardware detection & graceful fallback
 * - Integrated directly with api.js & OLD Firebase
 * ============================================================================
 */

import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import { api } from "../api";

/**
 * Check if the current browser and device support Passkeys / Biometrics
 */
export async function isPasskeySupported() {
  if (typeof window === "undefined") return false;
  if (!browserSupportsWebAuthn()) return false;
  try {
    const isPlatform = await platformAuthenticatorIsAvailable();
    return Boolean(isPlatform);
  } catch (_) {
    return true; // WebAuthn supported, proceed with prompt
  }
}

/**
 * Register a new Passkey on the current device (Face ID, Touch ID, Windows Hello)
 * Stored in OLD Firebase!
 */
export async function registerDevicePasskey(customDeviceName = "", context = "") {
  try {
    // 1. Get Registration Options from server
    const optionsRes = await api.getPasskeyRegisterOptions();
    if (!optionsRes || !optionsRes.success || !optionsRes.options) {
      throw new Error(optionsRes?.message || "Failed to initiate passkey registration.");
    }

    // 2. Invoke native biometric sensor / Windows Hello / Face ID
    let attResp;
    try {
      attResp = await startRegistration({ optionsJSON: optionsRes.options });
    } catch (bioErr) {
      if (bioErr.name === "NotAllowedError") {
        throw new Error("Passkey registration cancelled by user.");
      }
      if (bioErr.name === "InvalidStateError") {
        throw new Error("This passkey is already registered on your device.");
      }
      throw bioErr;
    }

    // 3. Determine device label
    let deviceLabel = customDeviceName;
    if (!deviceLabel) {
      const ua = navigator.userAgent;
      if (/iPhone|iPad/i.test(ua)) deviceLabel = "Apple Face ID / Touch ID";
      else if (/Macintosh/i.test(ua)) deviceLabel = "Mac Touch ID";
      else if (/Android/i.test(ua)) deviceLabel = "Android Biometric Passkey";
      else if (/Windows/i.test(ua)) deviceLabel = "Windows Hello (Fingerprint / PIN / Face)";
      else deviceLabel = "Biometric Passkey";
    }

    // 4. Send to server for verification & save in OLD Firebase
    const verifyRes = await api.verifyPasskeyRegister(attResp, deviceLabel, context);
    return verifyRes;
  } catch (err) {
    console.error("[PASSKEY-REGISTER-ERROR]", err);
    throw err;
  }
}

/**
 * 1-Click Biometric Login with Passkey
 * Works with or without typing email (Discoverable Resident Keys supported!)
 */
export async function loginWithPasskey(email = "") {
  try {
    // 1. Get Authentication Options from server
    const optionsRes = await api.getPasskeyLoginOptions(email);
    if (!optionsRes || !optionsRes.success || !optionsRes.options) {
      throw new Error(optionsRes?.message || "Failed to initiate passkey login.");
    }

    // 2. Invoke device biometric prompt
    let asseResp;
    try {
      asseResp = await startAuthentication({ optionsJSON: optionsRes.options });
    } catch (bioErr) {
      if (bioErr.name === "NotAllowedError") {
        throw new Error("Biometric authentication cancelled.");
      }
      throw bioErr;
    }

    // 3. Verify on server and receive JWT token
    const verifyRes = await api.verifyPasskeyLogin(asseResp, optionsRes.options.challenge);
    return verifyRes;
  } catch (err) {
    console.error("[PASSKEY-LOGIN-ERROR]", err);
    throw err;
  }
}

