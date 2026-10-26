import React, { useState, useEffect } from "react";
import {
  X,
  UserPlus,
  LogIn,
  User,
  AlertCircle,
  CheckCircle2,
  Send,
  KeyRound,
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  Mail,
  ExternalLink,
  Bot,
  MessageSquare,
  Copy,
  Check,
  Eye,
  EyeOff,
  Fingerprint,
  Sparkles,
} from "lucide-react";
import { api } from "../api";
import { loginWithPasskey, registerDevicePasskey, isPasskeySupported } from "../utils/passkeyClient";

const TelegramIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <path
      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.37.74-.56 2.92-1.27 4.86-2.11 5.83-2.51 2.77-1.15 3.35-1.35 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24-.03.42z"
      fill="#2AABEE"
    />
  </svg>
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0, marginRight: "8px" }}>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
  </svg>
);

export default function AuthModal({
  isOpen,
  onClose,
  onAuthSuccess,
  initialTab = "signin",
  isMaintenanceMode = false,
}) {
  const [tab, setTab] = useState(isMaintenanceMode ? "signin" : initialTab); // 'signin', 'signup', or 'forgot'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [successMsg, setSuccessMsg] = useState(null);
  const [purgedAccountNotice, setPurgedAccountNotice] = useState(false);

  const clearFieldError = (field) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setError(null);
    setPurgedAccountNotice(false);
  };

  const setFormError = (errOrMsg, fallbackField = null) => {
    if (!errOrMsg) {
      setError(null);
      setFieldErrors({});
      return;
    }

    const msg = typeof errOrMsg === "string" ? errOrMsg : (errOrMsg?.data?.message || errOrMsg?.message || "An error occurred.");
    const lower = String(msg).toLowerCase();

    // 1. First Priority: Check if backend explicitly provided invalid field key
    let targetField = errOrMsg?.field || errOrMsg?.data?.field || null;

    // 2. Map generic field keys from backend to current tab's exact input field
    if (targetField === "email") {
      if (tab === "signin") targetField = "signInIdentifier";
      else if (tab === "forgot") targetField = "forgotEmail";
      else targetField = "email";
    } else if (targetField === "mobile") {
      if (isGoogleOnboarding) targetField = "googleMobile";
      else if (tab === "forgot") targetField = forgotMode === "telebot" ? "forgotMobile" : "forgotEmail";
      else targetField = "mobile";
    } else if (targetField === "password") {
      if (tab === "signin") targetField = "signInPassword";
      else if (tab === "forgot") targetField = "forgotNewPassword";
      else targetField = "signUpPassword";
    } else if (targetField === "college") {
      if (isGoogleOnboarding) targetField = "googleCollege";
      else targetField = "college";
    } else if (targetField === "year") {
      if (isGoogleOnboarding) targetField = "googleYear";
      else targetField = "year";
    }

    // 3. Second Priority: Intelligent Message Content Disambiguation (Prevents wrong field highlight)
    if (!targetField) {
      if (
        lower.includes("email") ||
        lower.includes("e-mail") ||
        lower.includes("gmail") ||
        lower.includes("@") ||
        lower.includes("mail address")
      ) {
        if (tab === "signin") targetField = "signInIdentifier";
        else if (tab === "forgot") targetField = "forgotEmail";
        else targetField = "email";
      } else if (
        lower.includes("mobile") ||
        lower.includes("phone") ||
        lower.includes("10-digit") ||
        lower.includes("mobile number") ||
        lower.includes("phone number")
      ) {
        if (isGoogleOnboarding) targetField = "googleMobile";
        else if (tab === "forgot") targetField = forgotMode === "telebot" ? "forgotMobile" : "forgotEmail";
        else targetField = "mobile";
      } else if (
        lower.includes("password") ||
        lower.includes("credentials") ||
        lower.includes("passphrase") ||
        lower.includes("secret")
      ) {
        if (tab === "signin") targetField = "signInPassword";
        else if (tab === "forgot") targetField = "forgotNewPassword";
        else targetField = "signUpPassword";
      } else if (
        lower.includes("full name") ||
        (lower.includes("name") && !lower.includes("college") && !lower.includes("university") && !lower.includes("username") && !lower.includes("user"))
      ) {
        targetField = "name";
      } else if (
        lower.includes("college") ||
        lower.includes("university") ||
        lower.includes("institute")
      ) {
        targetField = isGoogleOnboarding ? "googleCollege" : "college";
      } else if (
        lower.includes("academic year") ||
        (lower.includes("year") && !lower.includes("already"))
      ) {
        targetField = isGoogleOnboarding ? "googleYear" : "year";
      } else if (
        lower.includes("otp") ||
        lower.includes("passcode") ||
        lower.includes("verification code") ||
        lower.includes("recovery code")
      ) {
        if (tab === "signin") targetField = "loginOtpCode";
        else if (tab === "forgot") targetField = forgotTgOtpStep ? "forgotTgOtpCode" : "forgotOtpCode";
        else targetField = regTgStep ? "regTgOtpCode" : "signUpOtpCode";
      } else if (
        tab === "signin" &&
        (lower.includes("not found") || lower.includes("no account") || lower.includes("no registered student") || lower.includes("user does not exist"))
      ) {
        targetField = "signInIdentifier";
      }
    }

    // 4. Third Priority: Fallback to caller-provided field only if neither server nor message inspection matched
    if (!targetField && fallbackField) {
      targetField = fallbackField;
    }

    if (targetField) {
      // If error is about a Step 1 field (e.g. email/mobile already registered) but student is on OTP screen, bring them back so they can see and edit the field!
      if (regTgStep && (targetField === "name" || targetField === "mobile" || targetField === "email" || targetField === "college" || targetField === "year" || targetField === "signUpPassword")) {
        setRegTgStep(false);
      }
      if (signUpOtpStep && (targetField === "name" || targetField === "mobile" || targetField === "email" || targetField === "college" || targetField === "year" || targetField === "signUpPassword")) {
        setSignUpOtpStep(false);
      }
      if (forgotTgOtpStep && (targetField === "forgotMobile" || targetField === "forgotEmail")) {
        setForgotTgOtpStep(false);
      }
      if (forgotOtpStep && targetField === "forgotEmail") {
        setForgotOtpStep(false);
      }

      setFieldErrors({ [targetField]: msg });
      setError(msg);

      setTimeout(() => {
        const el =
          document.getElementById(`field-group-${targetField}`) ||
          document.getElementById(`field-group-${targetField}-email`) ||
          document.getElementById(`input-${targetField}`) ||
          document.getElementById(`input-${targetField}-email`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          const input = el.tagName === "INPUT" || el.tagName === "SELECT" ? el : el.querySelector("input, select");
          if (input) input.focus();
        }
      }, 70);
    } else {
      setError(msg);
      setFieldErrors({});
    }
  };

  const FieldNotice = ({ fieldKey }) => {
    const msg = fieldErrors[fieldKey];
    if (!msg) return null;
    return (
      <div
        className="fsm-field-error-banner"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(239, 68, 68, 0.16)",
          border: "1.5px solid #ef4444",
          color: "#fca5a5",
          padding: "7px 12px",
          borderRadius: "6px",
          fontSize: "0.8rem",
          fontWeight: 700,
          marginBottom: "8px",
          marginTop: "4px",
          boxShadow: "0 2px 10px rgba(239, 68, 68, 0.25)",
          animation: "fadeIn 0.2s ease",
        }}
      >
        <AlertCircle size={15} style={{ flexShrink: 0, color: "#f87171" }} />
        <span style={{ lineHeight: 1.35 }}>{msg}</span>
      </div>
    );
  };

  // Google Sign-In & Onboarding State
  const [googleUser, setGoogleUser] = useState(null);
  const [isGoogleOnboarding, setIsGoogleOnboarding] = useState(false);
  const [googleMobile, setGoogleMobile] = useState("");
  const [googleCollege, setGoogleCollege] = useState("");
  const [googleYear, setGoogleYear] = useState("1st Year");

  // Sign In Form State
  const [signInIdentifier, setSignInIdentifier] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [loginOtpStep, setLoginOtpStep] = useState(false);
  const [loginOtpCode, setLoginOtpCode] = useState("");
  const [loginTargetEmail, setLoginTargetEmail] = useState("");

  // Passkey Biometrics State
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [regPasskeyLoading, setRegPasskeyLoading] = useState(false);
  const [supportsPasskey, setSupportsPasskey] = useState(true);
  const [showPostRegPasskeyPrompt, setShowPostRegPasskeyPrompt] = useState(false);
  const [postRegUser, setPostRegUser] = useState(null);

  // Preferred login mode: prioritizes passkey if user has set it up or saved preference
  const [loginViewMode, setLoginViewMode] = useState(() => {
    if (typeof window !== "undefined") {
      const pref = localStorage.getItem("academic_vault_login_pref");
      if (pref === "passkey") return "passkey";
      if (pref === "password") return "password";
      if (localStorage.getItem("academic_vault_has_passkey") === "true") return "passkey";
    }
    return "password";
  });

  useEffect(() => {
    isPasskeySupported().then((supported) => setSupportsPasskey(supported));
  }, []);

  const handlePasskeySignIn = async () => {
    try {
      setPasskeyLoading(true);
      setError(null);
      setFieldErrors({});
      setSuccessMsg(null);
      const res = await loginWithPasskey(signInIdentifier?.trim() || "");
      if (res && res.success) {
        localStorage.setItem("academic_vault_has_passkey", "true");
        localStorage.setItem("academic_vault_login_pref", "passkey");
        setSuccessMsg(res.message || "Passkey biometric authentication successful!");
        setTimeout(() => {
          if (onAuthSuccess) onAuthSuccess(res.user, res.token);
          onClose();
        }, 400);
      }
    } catch (err) {
      if (err.message && !err.message.includes("cancelled")) {
        setFormError(err.message || "Biometric authentication failed. You can sign in with password below.");
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  // Register Passkey right after successful account signup
  const handlePostRegEnablePasskey = async () => {
    try {
      setRegPasskeyLoading(true);
      setError(null);
      setFieldErrors({});
      setSuccessMsg(null);
      const res = await registerDevicePasskey("", "registration");
      localStorage.setItem("academic_vault_has_passkey", "true");
      localStorage.setItem("academic_vault_login_pref", "passkey");
      setLoginViewMode("passkey");
      setSuccessMsg(res?.message || "🎉 Passkey registered successfully! 1-Click login is now active.");
      const finalUser = {
        ...(postRegUser || {}),
        hasPasskey: true,
      };
      setTimeout(() => {
        if (onAuthSuccess && finalUser) onAuthSuccess(finalUser);
        setShowPostRegPasskeyPrompt(false);
        setPostRegUser(null);
        onClose();
      }, 750);
    } catch (err) {
      if (err.message && (err.message.includes("cancelled") || err.message.includes("NotAllowedError"))) {
        setError("Biometric prompt was cancelled. You can retry or click 'Skip for Now' below to continue to notes.");
      } else {
        setError(err.message || "Failed to set up passkey on this device.");
      }
    } finally {
      setRegPasskeyLoading(false);
    }
  };

  const handlePostRegSkipPasskey = () => {
    localStorage.setItem("academic_vault_login_pref", "password");
    setLoginViewMode("password");
    const userToLogin = postRegUser;
    setShowPostRegPasskeyPrompt(false);
    setPostRegUser(null);
    if (onAuthSuccess && userToLogin) onAuthSuccess(userToLogin);
    onClose();
  };

  const handleRegistrationSuccess = (authenticatedUser) => {
    if (!authenticatedUser) {
      onClose();
      return;
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("vault_last_active", String(Date.now()));
      localStorage.setItem("academic_vault_login_pref", "password");
    }

    // Always ask user if they want to apply Passkey on this device (Google, Telegram Bot, or Email)
    if (supportsPasskey && !authenticatedUser.hasPasskey) {
      setPostRegUser(authenticatedUser);
      setShowPostRegPasskeyPrompt(true);
      setError(null);
      setFieldErrors({});
      setSuccessMsg(null);
    } else {
      // If passkey is not supported or already setup, immediately authenticate & land on notes page!
      if (onAuthSuccess) {
        onAuthSuccess(authenticatedUser);
      }
      onClose();
    }
  };

  // Forgot Password State
  const [forgotMode, setForgotMode] = useState("telebot"); // "telebot" | "email"
  const [forgotMobile, setForgotMobile] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtpStep, setForgotOtpStep] = useState(false);
  const [forgotOtpCode, setForgotOtpCode] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [forgotTgToken, setForgotTgToken] = useState("");
  const [forgotTgBotLink, setForgotTgBotLink] = useState("");
  const [forgotTgOtpStep, setForgotTgOtpStep] = useState(false);
  const [forgotTgOtpCode, setForgotTgOtpCode] = useState("");

  // Sign Up Form State
  const [regMode, setRegMode] = useState("telebot"); // "telebot" | "email"
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [college, setCollege] = useState("");
  const [year, setYear] = useState("1st Year");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [signUpOtpStep, setSignUpOtpStep] = useState(false);
  const [signUpOtpCode, setSignUpOtpCode] = useState("");
  const [regTgToken, setRegTgToken] = useState("");
  const [regTgBotLink, setRegTgBotLink] = useState("");
  const [regTgStep, setRegTgStep] = useState(false);
  const [regTgOtpCode, setRegTgOtpCode] = useState("");

  // Reset all fields across all forms (Sign In, Sign Up, Forgot Password, Google Onboarding)
  const resetAllFormFields = () => {
    setSignInIdentifier("");
    setSignInPassword("");
    setShowSignInPassword(false);
    setLoginOtpStep(false);
    setLoginOtpCode("");
    setLoginTargetEmail("");

    setName("");
    setMobile("");
    setEmail("");
    setCollege("");
    setYear("1st Year");
    setSignUpPassword("");
    setShowSignUpPassword(false);
    setSignUpOtpStep(false);
    setSignUpOtpCode("");
    setRegTgStep(false);
    setRegTgOtpCode("");
    setRegTgToken("");
    setRegTgBotLink("");

    setForgotMobile("");
    setForgotEmail("");
    setForgotOtpStep(false);
    setForgotOtpCode("");
    setForgotNewPassword("");
    setShowForgotNewPassword(false);
    setForgotTgOtpStep(false);
    setForgotTgOtpCode("");
    setForgotTgToken("");
    setForgotTgBotLink("");

    setIsGoogleOnboarding(false);
    setGoogleUser(null);
    setGoogleMobile("");
    setGoogleCollege("");
    setGoogleYear("1st Year");

    setShowPostRegPasskeyPrompt(false);
    setPostRegUser(null);
    setRegPasskeyLoading(false);
    setPasskeyLoading(false);

    setError(null);
    setSuccessMsg(null);
    setFieldErrors({});
    setPurgedAccountNotice(false);
  };

  // Reset Sign Up form fields when user switches between Tele Bot and Email
  const resetSignUpFields = () => {
    setName("");
    setMobile("");
    setEmail("");
    setCollege("");
    setYear("1st Year");
    setSignUpPassword("");
    setShowSignUpPassword(false);
    setSignUpOtpStep(false);
    setSignUpOtpCode("");
    setRegTgStep(false);
    setRegTgOtpCode("");
    setRegTgToken("");
    setRegTgBotLink("");
    setError(null);
    setSuccessMsg(null);
    setFieldErrors({});
  };

  // Reset Forgot Password form fields when user switches between Tele Bot and Email
  const resetForgotFields = () => {
    setForgotMobile("");
    setForgotEmail("");
    setForgotOtpStep(false);
    setForgotOtpCode("");
    setForgotNewPassword("");
    setShowForgotNewPassword(false);
    setForgotTgOtpStep(false);
    setForgotTgOtpCode("");
    setForgotTgToken("");
    setForgotTgBotLink("");
    setError(null);
    setSuccessMsg(null);
    setFieldErrors({});
  };

  useEffect(() => {
    if (isOpen) {
      resetAllFormFields();
      setTab(isMaintenanceMode ? "signin" : initialTab);
      const hasPasskeyPref =
        typeof window !== "undefined" &&
        (localStorage.getItem("academic_vault_login_pref") === "passkey" ||
          localStorage.getItem("academic_vault_has_passkey") === "true");
      setLoginViewMode(hasPasskeyPref ? "passkey" : "password");
    }
  }, [isOpen, initialTab, isMaintenanceMode]);

  // Clear any legacy session storage on mount to guarantee fresh forms
  useEffect(() => {
    try { sessionStorage.removeItem("fsm_pending_tg_reg"); } catch {}
  }, []);

  // Auto-poll Telegram password recovery status to auto-populate 6-digit OTP code (< 2s)
  useEffect(() => {
    if (!isOpen || tab !== "forgot" || !forgotTgOtpStep) return;
    let isCancelled = false;

    const checkResetStatus = async () => {
      try {
        const res = await api.pollTelegramResetStatus({
          resetToken: forgotTgToken,
          mobile: forgotMobile,
          email: forgotEmail,
        });
        if (!isCancelled && res?.ready && res?.phoneVerified && res?.otp) {
          setForgotTgOtpCode(String(res.otp).trim());
          clearFieldError("forgotTgOtpCode");
          setSuccessMsg(`✅ Telegram mobile verified! Passcode received: ${res.otp}`);
        }
      } catch (_) {}
    };

    // Immediate initial check at 500ms, then every 1800ms (< 2 seconds)
    const initialTimer = setTimeout(checkResetStatus, 500);
    const intervalId = setInterval(checkResetStatus, 1800);

    return () => {
      isCancelled = true;
      clearTimeout(initialTimer);
      clearInterval(intervalId);
    };
  }, [isOpen, tab, forgotTgOtpStep, forgotTgToken, forgotMobile, forgotEmail]);

  // Auto-poll Telegram registration status to auto-populate 6-digit OTP code (< 2s)
  useEffect(() => {
    if (!isOpen || tab !== "signup" || !regTgStep) return;
    let isCancelled = false;

    const checkRegStatus = async () => {
      try {
        const res = await api.pollTelegramRegisterStatus({
          regToken: regTgToken,
          mobile: mobile,
          email: email,
        });
        if (!isCancelled && res?.ready && res?.phoneVerified && res?.otp) {
          const cleanOtp = String(res.otp).trim();
          if (cleanOtp && cleanOtp.length === 6) {
            setRegTgOtpCode(cleanOtp);
            clearFieldError("regTgOtpCode");
            setSuccessMsg(`✅ Mobile verified via Telegram! Passcode auto-filled: ${cleanOtp}`);
          }
        }
      } catch (_) {}
    };

    // Immediate initial check at 300ms, then snappy 1.5s interval
    const initialTimer = setTimeout(checkRegStatus, 300);
    const intervalId = setInterval(checkRegStatus, 1500);

    return () => {
      isCancelled = true;
      clearTimeout(initialTimer);
      clearInterval(intervalId);
    };
  }, [isOpen, tab, regTgStep, regTgToken, mobile, email]);

  if (!isOpen) return null;

  const isGmail = (str) => {
    if (!str || typeof str !== "string") return false;
    const clean = str.trim().toLowerCase();
    // Allow any standard academic, corporate, or personal email domain
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (!emailRegex.test(clean)) return false;
    // Block disposable email domains
    const disposable = ["10minutemail", "tempmail", "temp-mail", "guerrillamail", "mailinator", "yopmail", "throwawaymail", "sharklasers", "dispostable", "trashmail", "fakeinbox"];
    const domain = clean.split("@")[1] || "";
    return !disposable.some((d) => domain.includes(d));
  };

  // Google Auth Core Processor
  const processGoogleLogin = async (googlePayload) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.googleLogin(googlePayload);
      if (res.isNewUser) {
        const gUser = {
          email: res.googleUser?.email || "",
          name: res.googleUser?.name || "",
          picture: res.googleUser?.picture || "",
          signupToken: res.signupToken || "",
        };
        if (!gUser.picture && googlePayload?.credential) {
          try {
            const base64Url = googlePayload.credential.split(".")[1];
            const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
            const jsonPayload = decodeURIComponent(
              atob(base64)
                .split("")
                .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                .join("")
            );
            const decoded = JSON.parse(jsonPayload);
            if (decoded?.picture) gUser.picture = decoded.picture;
            if (!gUser.name && decoded?.name) gUser.name = decoded.name;
            if (!gUser.email && decoded?.email) gUser.email = decoded.email;
          } catch (_) {}
        }
        setGoogleUser(gUser);
        setIsGoogleOnboarding(true);
        setSuccessMsg("Google account verified! Please enter your mobile number and college to finish registration.");
      } else if (res.user) {
        onAuthSuccess(res.user);
        onClose();
      }
    } catch (err) {
      setError(err.message || "Failed to authenticate with Google.");
    } finally {
      setLoading(false);
    }
  };

  // Ensure GIS script is fully loaded
  const ensureGoogleScript = () => {
    return new Promise((resolve) => {
      if (window.google?.accounts) return resolve(true);
      let script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (!script) {
        script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);
      }
      const onLoad = () => resolve(true);
      const onError = () => resolve(false);
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
      setTimeout(() => resolve(Boolean(window.google?.accounts)), 3000);
    });
  };

  // Google 1-Click Trigger: Directly opens the Google Account Chooser popup
  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccessMsg(null);

    const googleClientId =
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_GOOGLE_CLIENT_ID) ||
      "15016303838-caotog5g4dmemicenukuqsed89mu0ej1.apps.googleusercontent.com";

    if (!googleClientId) {
      return setError(
        "Google Client ID is missing. Please add VITE_GOOGLE_CLIENT_ID in your .env file to enable Google Account selection."
      );
    }

    if (!window.google?.accounts) {
      setLoading(true);
      const ready = await ensureGoogleScript();
      setLoading(false);
      if (!ready || !window.google?.accounts) {
        return setError("Google Identity Services script failed to load. Please check your internet connection or ad-blocker.");
      }
    }

    try {
      setLoading(true);

      // Preferred GIS OAuth2 Token Client (opens standard popup to choose Google account)
      if (window.google.accounts.oauth2) {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: "email profile openid",
          callback: async (tokenResponse) => {
            if (tokenResponse.error) {
              setLoading(false);
              const err = tokenResponse.error_description || tokenResponse.error;
              if (err === "popup_closed_by_user") {
                return setError("Google Sign-In popup was closed before completion.");
              }
              if (err === "access_denied") {
                return setError("Google account access was denied.");
              }
              return setError("Google Sign-In failed: " + err);
            }
            if (tokenResponse.access_token) {
              await processGoogleLogin({ accessToken: tokenResponse.access_token });
            } else {
              setLoading(false);
              setError("No access token received from Google.");
            }
          },
        });
        tokenClient.requestAccessToken();
        return;
      }

      // GIS ID Token Fallback
      if (window.google.accounts.id) {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response) => {
            if (response.credential) {
              await processGoogleLogin({ credential: response.credential });
            }
          },
        });
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            setLoading(false);
            setError("Google Account prompt could not be displayed. Please check popup permissions.");
          }
        });
      }
    } catch (err) {
      console.error("[GOOGLE-AUTH] Error:", err);
      setLoading(false);
      setError("Failed to open Google Sign-In: " + err.message);
    }
  };

  // Complete Google Student Profile
  const handleCompleteGoogleProfile = async (e) => {
    e.preventDefault();
    const cleanMobile = googleMobile.trim();
    const cleanCollege = googleCollege.trim();

    if (!cleanMobile || cleanMobile.length < 10) {
      return setFormError("Please enter a valid 10-digit mobile number.", "googleMobile");
    }
    if (!cleanCollege) {
      return setFormError("College / University name is mandatory.", "googleCollege");
    }

    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await api.googleCompleteProfile({
        email: googleUser.email,
        name: googleUser.name,
        mobile: cleanMobile,
        college: cleanCollege,
        year: googleYear,
        picture: googleUser.picture || "",
        signupToken: googleUser.signupToken || "",
      });

      const authenticatedUser = res?.user;
      if (authenticatedUser) {
        setSuccessMsg("Profile completed! Welcome to Academic Vault.");
        handleRegistrationSuccess(authenticatedUser);
      } else {
        onClose();
      }
    } catch (err) {
      setFormError(err);
    } finally {
      setLoading(false);
    }
  };

  // 1. Direct Sign In (Email & Password - No OTP)
  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    setSuccessMsg(null);

    const cleanInput = signInIdentifier.trim().toLowerCase();

    if (cleanInput.includes("@") && !isGmail(cleanInput)) {
      setLoading(false);
      return setFormError("Please enter a valid academic or personal email address.", "signInIdentifier");
    }

    try {
      const res = await api.login(signInIdentifier, signInPassword);
      if (res.user?.hasPasskey) {
        localStorage.setItem("academic_vault_has_passkey", "true");
      }
      onAuthSuccess(res.user);
      onClose();
    } catch (err) {
      if (err.data?.isPurgedDueToInactivity || (err.message && err.message.includes("90 days"))) {
        setPurgedAccountNotice(true);
        setError("Your old account was safely and successfully deleted due to 90 days of inactivity. Please create a new account to continue.");
      } else {
        setPurgedAccountNotice(false);
        setFormError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  // 2. Forgot Password: Step 1 (Request Reset OTP)
  const handleRequestForgotOtp = async (e) => {
    e.preventDefault();
    const cleanEmail = forgotEmail.trim().toLowerCase();

    if (!cleanEmail || !isGmail(cleanEmail)) {
      return setFormError("Please enter your registered email address.", "forgotEmail");
    }

    setLoading(true);
    setError(null);
    setFieldErrors({});
    setSuccessMsg(null);

    try {
      const res = await api.requestForgotPasswordOtp(cleanEmail);
      setForgotOtpStep(true);
      if (res.simulationOtp) {
        setForgotOtpCode(res.simulationOtp);
        setSuccessMsg(`${res.message || "Code dispatched!"} (Auto-Fill Code: ${res.simulationOtp})`);
      } else {
        setSuccessMsg(res.message || "Password recovery OTP code sent to your Gmail.");
      }
    } catch (err) {
      setFormError(err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Forgot Password: Step 2 (Verify OTP & Reset Password)
  const handleVerifyForgotOtp = async (e) => {
    e.preventDefault();
    if (!forgotOtpCode.trim()) {
      return setFormError("Please enter the 6-digit recovery OTP code.", "forgotOtpCode");
    }
    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      return setFormError("New password must be at least 6 characters long.", "forgotNewPassword");
    }

    setLoading(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await api.verifyForgotPasswordOtp(
        forgotEmail.trim().toLowerCase(),
        forgotOtpCode.trim(),
        forgotNewPassword
      );
      setSuccessMsg(res.message || "Password reset successful! Please sign in with your new password.");
      setTimeout(() => {
        setTab("signin");
        setLoginOtpStep(false);
        setForgotOtpStep(false);
        setSignInIdentifier(forgotEmail);
        setSignInPassword("");
      }, 1500);
    } catch (err) {
      setFormError(err.message || "Failed to verify OTP or update password.", "forgotOtpCode");
    } finally {
      setLoading(false);
    }
  };

  // 2. Forgot Password via Telegram Bot: Step 1 (Verify Mobile & Email, Request Code)
  const handleForgotTelegramInitiate = async (e) => {
    e.preventDefault();
    const cleanMobile = forgotMobile.trim();
    const cleanEmail = forgotEmail.trim().toLowerCase();

    if (!cleanMobile || cleanMobile.length < 10) {
      return setFormError("Valid 10-digit registered Mobile Number is mandatory.", "forgotMobile");
    }
    if (!cleanEmail || !isGmail(cleanEmail)) {
      return setFormError("Valid registered email address is mandatory.", "forgotEmail");
    }

    setLoading(true);
    setError(null);
    setFieldErrors({});
    setSuccessMsg(null);

    try {
      const res = await api.forgotTelegramInitiate({
        mobile: cleanMobile,
        email: cleanEmail,
      });

      setForgotTgToken(res.resetToken);
      setForgotTgBotLink(res.botLink);
      setForgotTgOtpStep(true);
      setForgotTgOtpCode("");
      setSuccessMsg("Mobile and Email verified! Open @fsm_security_otp_bot to view your 6-digit recovery code.");
    } catch (err) {
      setFormError(err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Forgot Password via Telegram Bot: Step 2 (Verify OTP & Reset Password)
  const handleForgotTelegramVerify = async (e) => {
    e.preventDefault();
    if (!forgotTgOtpCode.trim() || forgotTgOtpCode.trim().length < 6) {
      return setFormError("Please enter the 6-digit recovery code from Telegram.", "forgotTgOtpCode");
    }
    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      return setFormError("New password must be at least 6 characters long.", "forgotNewPassword");
    }

    setLoading(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await api.forgotTelegramVerify({
        resetToken: forgotTgToken,
        mobile: forgotMobile.trim(),
        email: forgotEmail.trim().toLowerCase(),
        otp: forgotTgOtpCode.trim(),
        newPassword: forgotNewPassword,
      });

      setSuccessMsg(res.message || "Password updated successfully! Please sign in with your new password.");
      setTimeout(() => {
        setTab("signin");
        setForgotTgOtpStep(false);
        setSignInIdentifier(forgotEmail);
        setSignInPassword("");
      }, 1500);
    } catch (err) {
      setFormError(err.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Student Sign Up (Option 2: Telegram Bot Verification) - Step 1: Initiate
  const handleSignUpTelegramInitiate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setLoading(false);
      return setFormError("Full Name is mandatory.", "name");
    }
    if (!mobile.trim() || mobile.trim().length < 10) {
      setLoading(false);
      return setFormError("Valid 10-digit Mobile Number is mandatory.", "mobile");
    }
    if (!email.trim() || !isGmail(email)) {
      setLoading(false);
      return setFormError("Please enter a valid academic or personal email address (disposable emails prohibited).", "email");
    }
    if (!college.trim()) {
      setLoading(false);
      return setFormError("College Name is mandatory.", "college");
    }
    if (!signUpPassword || signUpPassword.length < 6) {
      setLoading(false);
      return setFormError("Password must be at least 6 characters.", "signUpPassword");
    }

    try {
      const res = await api.registerTelegramInitiate({
        name: name.trim(),
        mobile: mobile.trim(),
        email: email.trim().toLowerCase(),
        college: college.trim(),
        year: year.trim(),
        password: signUpPassword,
      });

      setRegTgToken(res.regToken);
      setRegTgBotLink(res.botLink);
      setRegTgStep(true);
      setRegTgOtpCode("");
      setSuccessMsg("Registration session ready! Open @fsm_security_otp_bot and tap [ 📲 Verify & Share My Telegram Number ] to get your 6-digit passcode.");
    } catch (err) {
      setFormError(err);
    } finally {
      setLoading(false);
    }
  };

  // 3. Student Sign Up (Option 2: Telegram Bot Verification) - Step 2: Verify & Create
  const handleSignUpTelegramVerify = async (e) => {
    e.preventDefault();
    if (!regTgOtpCode.trim() || regTgOtpCode.trim().length < 6) {
      return setFormError("Please enter the 6-digit verification code from Telegram.", "regTgOtpCode");
    }

    setLoading(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await api.registerTelegramVerify({
        regToken: regTgToken,
        mobile: mobile.trim(),
        email: email.trim().toLowerCase(),
        otp: regTgOtpCode.trim(),
        password: signUpPassword,
        name: name.trim(),
        college: college.trim(),
        year: year.trim(),
      });
      const authenticatedUser = res?.user;
      if (authenticatedUser) {
        setSuccessMsg("Account verified & created successfully! Welcome to Academic Vault.");
        handleRegistrationSuccess(authenticatedUser);
      } else {
        onClose();
      }
    } catch (err) {
      setFormError(err, "regTgOtpCode");
    } finally {
      setLoading(false);
    }
  };


  // 3. Student Sign Up - Step 1: Request OTP (Option 3: Email OTP)
  const handleRequestSignUpOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    setSuccessMsg(null);

    if (!name.trim()) {
      setLoading(false);
      return setFormError("Full Name is mandatory.", "name");
    }
    if (!mobile.trim() || mobile.trim().length < 10) {
      setLoading(false);
      return setFormError("Valid 10-digit Mobile Number is mandatory.", "mobile");
    }
    if (!email.trim() || !isGmail(email)) {
      setLoading(false);
      return setFormError("Please enter a valid academic or personal email address.", "email");
    }
    if (!college.trim()) {
      setLoading(false);
      return setFormError("College Name is mandatory.", "college");
    }
    if (!signUpPassword || signUpPassword.length < 6) {
      setLoading(false);
      return setFormError("Password must be at least 6 characters.", "signUpPassword");
    }

    try {
      const res = await api.requestRegisterOtp({
        name: name.trim(),
        mobile: mobile.trim(),
        email: email.trim().toLowerCase(),
        college: college.trim(),
        year: year.trim(),
        password: signUpPassword,
      });

      setSignUpOtpStep(true);
      if (res.simulationOtp) {
        setSignUpOtpCode(res.simulationOtp);
        setSuccessMsg(`${res.message || "Code dispatched!"} (Auto-Fill Code: ${res.simulationOtp})`);
      } else {
        setSuccessMsg(res.message || "Verification code sent to your Gmail.");
      }
    } catch (err) {
      setFormError(err);
    } finally {
      setLoading(false);
    }
  };

  // 3. Student Sign Up - Step 2: Verify OTP & Create Account
  const handleVerifySignUpOtp = async (e) => {
    e.preventDefault();
    if (!signUpOtpCode.trim() || signUpOtpCode.trim().length < 6) {
      return setFormError("Please enter the 6-digit verification OTP code.", "signUpOtpCode");
    }

    setLoading(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await api.verifyRegisterOtp(email.trim().toLowerCase(), signUpOtpCode.trim());
      const authenticatedUser = res?.user;
      if (authenticatedUser) {
        setSuccessMsg("Account verified & created successfully! Welcome to Academic Vault.");
        handleRegistrationSuccess(authenticatedUser);
      } else {
        onClose();
      }
    } catch (err) {
      setFormError(err, "signUpOtpCode");
    } finally {
      setLoading(false);
    }
  };

  // 3. Student Sign Up - Resend OTP
  const handleResendSignUpOtp = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.requestRegisterOtp({
        name: name.trim(),
        mobile: mobile.trim(),
        email: email.trim().toLowerCase(),
        college: college.trim(),
        year: year.trim(),
        password: signUpPassword,
      });
      if (res.simulationOtp) {
        setSignUpOtpCode(res.simulationOtp);
        setSuccessMsg(`${res.message || "New code generated!"} (Auto-Fill Code: ${res.simulationOtp})`);
      } else {
        setSuccessMsg(res.message || "New OTP dispatched to your Gmail.");
      }
    } catch (err) {
      setError(err.message || "Failed to resend registration OTP.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (showPostRegPasskeyPrompt) {
          handlePostRegSkipPasskey();
          return;
        }
        // Prevent accidental closing when user is awaiting OTP!
        if (regTgStep || forgotTgStep || signUpOtpStep || loginOtpStep) return;
        onClose();
      }}
    >
      <div
        className="modal-content"
        style={{ maxWidth: "415px", width: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header">
          {showPostRegPasskeyPrompt ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "#fff", fontSize: "0.95rem" }}>
              <Fingerprint size={18} color="#38bdf8" />
              <span>Biometric Passkey Setup</span>
            </div>
          ) : isMaintenanceMode ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "#38bdf8", fontSize: "0.95rem" }}>
              <ShieldCheck size={18} color="#38bdf8" />
              <span>Administrator Access Only</span>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                className={`filter-tab ${tab === "signin" ? "active" : ""}`}
                onClick={() => {
                  resetAllFormFields();
                  setTab("signin");
                }}
                type="button"
              >
                <LogIn size={15} style={{ marginRight: "4px" }} />
                Sign In
              </button>
              <button
                className={`filter-tab ${tab === "signup" ? "active" : ""}`}
                onClick={() => {
                  resetAllFormFields();
                  setTab("signup");
                }}
                type="button"
              >
                <UserPlus size={15} style={{ marginRight: "4px" }} />
                Student Sign Up
              </button>
              {!showPostRegPasskeyPrompt && tab === "forgot" && (
                <button
                  className="filter-tab active"
                  style={{ background: "rgba(139, 92, 246, 0.2)", borderColor: "rgba(139, 92, 246, 0.4)", color: "#a78bfa" }}
                  type="button"
                >
                  <KeyRound size={15} style={{ marginRight: "4px" }} />
                  Recovery
                </button>
              )}
            </div>
          )}

          <button
            className="modal-close-btn"
            onClick={() => {
              if (showPostRegPasskeyPrompt) {
                handlePostRegSkipPasskey();
              } else {
                onClose();
              }
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Inactive Account Purged Notice Box */}
        {purgedAccountNotice && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: "var(--radius-md)",
              padding: "14px 16px",
              marginBottom: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <span style={{ fontSize: "1.3rem" }}>🛡️</span>
              <div>
                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#f87171" }}>
                  Account Safely Deleted (90 Days Inactivity)
                </div>
                <div style={{ fontSize: "0.8rem", color: "#fca5a5", marginTop: "4px", lineHeight: "1.45" }}>
                  Your old account was safely and successfully deleted due to 90 days of inactivity. Any study notes you uploaded remain preserved for university scholars. Please create a new account to continue.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                resetAllFormFields();
                setTab("signup");
              }}
              className="btn-primary"
              style={{
                fontSize: "0.82rem",
                padding: "8px 16px",
                alignSelf: "flex-start",
                background: "linear-gradient(135deg, #ef4444, #f97316)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>✨ Create New Account</span>
            </button>
          </div>
        )}

        {/* Regular Error Alert Box - Shown only when no specific field holds the error */}
        {error && !purgedAccountNotice && Object.keys(fieldErrors).length === 0 && (
          <div
            style={{
              background: "rgba(244, 63, 94, 0.12)",
              border: "1px solid rgba(244, 63, 94, 0.35)",
              color: "#f43f5e",
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              marginBottom: "14px",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert Box */}
        {successMsg && (
          <div
            style={{
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.35)",
              color: "#10b981",
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              marginBottom: "14px",
              fontSize: "0.82rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ================= POST-REGISTRATION PASSKEY PROMPT ================= */}
        {showPostRegPasskeyPrompt && postRegUser && (
          <div style={{ textAlign: "center", padding: "10px 4px 6px" }}>
            <div
              style={{
                width: "66px",
                height: "66px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, rgba(6, 182, 212, 0.22), rgba(99, 102, 241, 0.25))",
                border: "2px solid rgba(56, 189, 248, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto",
                boxShadow: "0 0 24px rgba(56, 189, 248, 0.28)",
              }}
            >
              <Fingerprint size={36} color="#38bdf8" />
            </div>

            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
              Enable 1-Click Biometric Login?
            </h3>
            <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, marginBottom: "18px" }}>
              Would you like to activate a <strong>Passkey</strong> on this device? Next time, sign in instantly using <strong>Fingerprint</strong>, <strong>Face ID</strong>, or <strong>Windows Hello</strong> without typing any password!
            </p>

            <div
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                padding: "12px 14px",
                textAlign: "left",
                marginBottom: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                fontSize: "0.78rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#38bdf8" }}>
                <Sparkles size={15} style={{ flexShrink: 0 }} />
                <span><strong>0-Second Sign In:</strong> Tap your sensor & enter immediately</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#34d399" }}>
                <ShieldCheck size={15} style={{ flexShrink: 0 }} />
                <span><strong>Hardware Security:</strong> Stored safely inside your device chip</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#a78bfa" }}>
                <KeyRound size={15} style={{ flexShrink: 0 }} />
                <span><strong>Password Optional:</strong> Password login remains available anytime</span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                type="button"
                className="btn-primary"
                onClick={handlePostRegEnablePasskey}
                disabled={regPasskeyLoading}
                style={{
                  width: "100%",
                  justifyContent: "center",
                  padding: "12px",
                  background: "linear-gradient(135deg, #0284c7, #6366f1)",
                  boxShadow: "0 4px 14px rgba(2, 132, 199, 0.35)",
                  fontSize: "0.9rem",
                  fontWeight: 700,
                }}
              >
                {regPasskeyLoading ? (
                  <>
                    <div className="spinner"></div>
                    <span>Waiting for Fingerprint / Face ID...</span>
                  </>
                ) : (
                  <>
                    <Fingerprint size={18} />
                    <span>⚡ Enable Passkey (Recommended)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handlePostRegSkipPasskey}
                disabled={regPasskeyLoading}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "8px",
                  color: "var(--text-dim)",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => (e.target.style.color = "#fff")}
                onMouseLeave={(e) => (e.target.style.color = "var(--text-dim)")}
              >
                Skip for Now (Sign In with Password)
              </button>
            </div>
          </div>
        )}

        {/* ================= GOOGLE ONBOARDING SCREEN ================= */}
        {!showPostRegPasskeyPrompt && isGoogleOnboarding && (
          <div style={{ animation: "fadeIn 0.25s ease" }}>
            <div style={{ textAlign: "center", marginBottom: "18px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "rgba(66, 133, 244, 0.15)", display: "inline-flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px" }}>
                <GoogleIcon />
              </div>
              <h3 style={{ margin: "0 0 4px", color: "#fff", fontSize: "1.15rem", fontWeight: 700 }}>
                Complete Student Profile
              </h3>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-dim)" }}>
                Welcome, <strong>{googleUser?.name || "Scholar"}</strong>! Please provide your phone &amp; college details to activate your student account.
              </p>
            </div>

            <form onSubmit={handleCompleteGoogleProfile} autoComplete="off">
              <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "rgba(66, 133, 244, 0.08)", border: "1px solid rgba(66, 133, 244, 0.25)", borderRadius: "var(--radius-md)", padding: "12px 14px", marginBottom: "16px" }}>
                {googleUser?.picture ? (
                  <img src={googleUser.picture} alt="Google Avatar" style={{ width: "38px", height: "38px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "#4285f4", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.95rem", flexShrink: 0 }}>
                    {googleUser?.name ? googleUser.name[0] : "S"}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.92rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {googleUser?.name || "Verified Student"}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {googleUser?.email}
                  </div>
                </div>
                <span style={{ fontSize: "0.68rem", background: "rgba(16, 185, 129, 0.2)", color: "#10b981", padding: "2px 8px", borderRadius: "10px", fontWeight: 700, flexShrink: 0 }}>
                  ✓ VERIFIED
                </span>
              </div>

              <div className="form-group" id="field-group-googleMobile">
                <label className="form-label">Mobile Number * (10 Digits)</label>
                <FieldNotice fieldKey="googleMobile" />
                <input
                  id="input-googleMobile"
                  type="tel"
                  className="form-input"
                  style={fieldErrors.googleMobile ? { borderColor: "#f43f5e", boxShadow: "0 0 0 1px #f43f5e" } : {}}
                  placeholder="Enter 10-digit mobile number"
                  value={googleMobile}
                  onChange={(e) => {
                    setGoogleMobile(e.target.value.replace(/\D/g, "").slice(0, 10));
                    clearFieldError("googleMobile");
                  }}
                  maxLength={10}
                  autoFocus
                  required
                />
              </div>

              <div className="form-group" id="field-group-googleCollege">
                <label className="form-label">College / University Name *</label>
                <FieldNotice fieldKey="googleCollege" />
                <input
                  id="input-googleCollege"
                  type="text"
                  className="form-input"
                  style={fieldErrors.googleCollege ? { borderColor: "#f43f5e", boxShadow: "0 0 0 1px #f43f5e" } : {}}
                  placeholder="e.g. University / College name"
                  value={googleCollege}
                  onChange={(e) => {
                    setGoogleCollege(e.target.value);
                    clearFieldError("googleCollege");
                  }}
                  required
                />
              </div>

              <div className="form-group" id="field-group-googleYear">
                <label className="form-label">Academic Year</label>
                <FieldNotice fieldKey="googleYear" />
                <select
                  id="input-googleYear"
                  className="form-select"
                  style={fieldErrors.googleYear ? { borderColor: "#f43f5e", boxShadow: "0 0 0 1px #f43f5e" } : {}}
                  value={googleYear}
                  onChange={(e) => {
                    setGoogleYear(e.target.value);
                    clearFieldError("googleYear");
                  }}
                >
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                  <option value="3rd Year">3rd Year</option>
                  <option value="4th Year">4th Year</option>
                  <option value="Post Graduate">Post Graduate / M.Tech</option>
                  <option value="Faculty / Other">Faculty / Other</option>
                </select>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={loading || googleMobile.length < 10 || !googleCollege.trim()}
                style={{ width: "100%", justifyContent: "center", marginTop: "16px", background: "linear-gradient(135deg, #4285f4, #06b6d4)" }}
              >
                {loading ? (
                  <>
                    <div className="spinner"></div>
                    <span>Activating Account...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Complete Registration &amp; Access Vault</span>
                  </>
                )}
              </button>

              <div style={{ textAlign: "center", marginTop: "14px" }}>
                <button
                  type="button"
                  onClick={() => {
                    resetAllFormFields();
                    setTab("signin");
                  }}
                  style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  <ArrowLeft size={13} />
                  <span>Back to Sign In</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ================= TAB 1: SIGN IN ================= */}
        {!showPostRegPasskeyPrompt && tab === "signin" && !isGoogleOnboarding && (
          <div>
            {loginViewMode === "passkey" ? (
              /* --- PASSKEY FIRST VIEW (If user setup passkey) --- */
              <div>
                <button
                  type="button"
                  className="btn-google-auth"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    padding: "11px 16px",
                    background: "#ffffff",
                    color: "#1f2937",
                    border: "1px solid #e5e7eb",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                    marginBottom: "14px",
                  }}
                >
                  <GoogleIcon />
                  <span>Continue with Google</span>
                </button>

                <div style={{ display: "flex", alignItems: "center", margin: "14px 0", gap: "10px" }}>
                  <div style={{ flex: 1, height: "1px", background: "rgba(255, 255, 255, 0.1)" }} />
                  <span style={{ fontSize: "0.74rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    or fast biometric passkey
                  </span>
                  <div style={{ flex: 1, height: "1px", background: "rgba(255, 255, 255, 0.1)" }} />
                </div>

                {/* Hero Biometric Card */}
                <div
                  style={{
                    background: "linear-gradient(135deg, rgba(6, 182, 212, 0.08), rgba(99, 102, 241, 0.1))",
                    border: "1px solid rgba(56, 189, 248, 0.35)",
                    borderRadius: "12px",
                    padding: "18px 16px",
                    textAlign: "center",
                    marginBottom: "14px",
                  }}
                >
                  <div
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(99, 102, 241, 0.25))",
                      border: "1px solid rgba(56, 189, 248, 0.4)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 12px auto",
                      boxShadow: "0 0 16px rgba(56, 189, 248, 0.2)",
                    }}
                  >
                    <Fingerprint size={30} color="#38bdf8" />
                  </div>

                  <h4 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff", marginBottom: "6px" }}>
                    Biometric Passkey Sign In
                  </h4>
                  <p style={{ fontSize: "0.82rem", color: "rgba(224, 242, 254, 0.8)", marginBottom: "18px", lineHeight: 1.5, maxWidth: "340px", margin: "0 auto 18px" }}>
                    Touch your fingerprint sensor, look at Face ID, or use Windows Hello PIN to sign in securely.
                  </p>

                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handlePasskeySignIn}
                    disabled={loading || passkeyLoading}
                    style={{
                      width: "100%",
                      justifyContent: "center",
                      padding: "13px 18px",
                      borderRadius: "12px",
                      background: "linear-gradient(135deg, #0284c7 0%, #6366f1 100%)",
                      boxShadow: "0 6px 22px rgba(2, 132, 199, 0.4)",
                      fontSize: "0.92rem",
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    {passkeyLoading ? (
                      <>
                        <div className="spinner"></div>
                        <span>Authenticating with Biometrics...</span>
                      </>
                    ) : (
                      <>
                        <Fingerprint size={20} />
                        <span>Authenticate with Passkey</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Option to toggle to Password mode */}
                <button
                  type="button"
                  onClick={() => {
                    setLoginViewMode("password");
                    localStorage.setItem("academic_vault_login_pref", "password");
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "8px",
                    color: "var(--text-secondary)",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    padding: "10px 14px",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    marginBottom: "12px",
                  }}
                  onMouseEnter={(e) => (e.target.style.background = "rgba(255, 255, 255, 0.08)")}
                  onMouseLeave={(e) => (e.target.style.background = "rgba(255, 255, 255, 0.04)")}
                >
                  <KeyRound size={15} color="var(--accent-cyan)" />
                  <span>🔑 Or Sign In with Password instead</span>
                </button>

                <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "14px", marginBottom: "8px" }}>
                  New student?{" "}
                  <span
                    style={{ color: "var(--accent-cyan)", cursor: "pointer", fontWeight: 600 }}
                    onClick={() => {
                      resetAllFormFields();
                      setTab("signup");
                    }}
                  >
                    Create Account
                  </span>
                </p>
              </div>
            ) : (
              /* --- PASSWORD FIRST VIEW --- */
              <div>
                {/* Premium Centered Passkey & Biometric Gateway */}
                {supportsPasskey && (
                  <button
                    type="button"
                    onClick={handlePasskeySignIn}
                    disabled={loading || passkeyLoading}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "14px",
                      padding: "14px 18px",
                      background: "linear-gradient(135deg, rgba(14, 165, 233, 0.16) 0%, rgba(99, 102, 241, 0.18) 50%, rgba(168, 85, 247, 0.16) 100%)",
                      border: "1px solid rgba(56, 189, 248, 0.45)",
                      borderRadius: "14px",
                      cursor: "pointer",
                      marginBottom: "16px",
                      boxShadow: "0 4px 20px rgba(14, 165, 233, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
                      transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                      position: "relative",
                      overflow: "hidden",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.borderColor = "rgba(56, 189, 248, 0.85)";
                      e.currentTarget.style.boxShadow = "0 8px 26px rgba(14, 165, 233, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.25)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.borderColor = "rgba(56, 189, 248, 0.45)";
                      e.currentTarget.style.boxShadow = "0 4px 20px rgba(14, 165, 233, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.15)";
                    }}
                  >
                    <div
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "10px",
                        background: "linear-gradient(135deg, rgba(6, 182, 212, 0.3), rgba(99, 102, 241, 0.35))",
                        border: "1px solid rgba(56, 189, 248, 0.6)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        boxShadow: "0 0 12px rgba(56, 189, 248, 0.35)",
                      }}
                    >
                      <Fingerprint size={22} color="#38bdf8" />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "0.94rem", fontWeight: 800, color: "#fff", letterSpacing: "0.2px" }}>
                          {passkeyLoading ? "Authenticating with Biometrics..." : "Sign In with Passkey / Biometrics"}
                        </span>
                        <span
                          style={{
                            fontSize: "0.65rem",
                            fontWeight: 800,
                            textTransform: "uppercase",
                            letterSpacing: "0.6px",
                            background: "linear-gradient(135deg, #06b6d4, #6366f1)",
                            color: "#ffffff",
                            padding: "2px 7px",
                            borderRadius: "6px",
                            boxShadow: "0 2px 6px rgba(6, 182, 212, 0.3)",
                          }}
                        >
                          Biometric
                        </span>
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "rgba(224, 242, 254, 0.8)", marginTop: "2px" }}>
                        Face ID, Fingerprint, or Windows Hello PIN
                      </span>
                    </div>
                  </button>
                )}

                <button
                  type="button"
                  className="btn-google-auth"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    padding: "11px 16px",
                    background: "#ffffff",
                    color: "#1f2937",
                    border: "1px solid #e5e7eb",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                    marginBottom: "16px",
                  }}
                >
                  <GoogleIcon />
                  <span>Continue with Google</span>
                </button>

                <div style={{ display: "flex", alignItems: "center", margin: "16px 0", gap: "10px" }}>
                  <div style={{ flex: 1, height: "1px", background: "rgba(255, 255, 255, 0.1)" }} />
                  <span style={{ fontSize: "0.74rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    or sign in with password
                  </span>
                  <div style={{ flex: 1, height: "1px", background: "rgba(255, 255, 255, 0.1)" }} />
                </div>

                <form onSubmit={handleSignIn} autoComplete="off">
                  {isMaintenanceMode && (
                    <div
                      style={{
                        padding: "10px 14px",
                        marginBottom: "16px",
                        borderRadius: "8px",
                        background: "rgba(234, 179, 8, 0.12)",
                        border: "1px solid rgba(234, 179, 8, 0.3)",
                        color: "#fde047",
                        fontSize: "0.82rem",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "10px",
                        lineHeight: "1.4",
                      }}
                    >
                      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                      <div>
                        <strong>Server Maintenance Mode Active:</strong> Student sign-in, account creation, and password recovery are currently paused. Only platform administrators may log in.
                      </div>
                    </div>
                  )}
            <div className="form-group" id="field-group-signInIdentifier">
              <label className="form-label">Gmail Address or Admin Alias *</label>
              <FieldNotice fieldKey="signInIdentifier" />
              <input
                id="input-signInIdentifier"
                type="text"
                className="form-input"
                style={fieldErrors.signInIdentifier ? { borderColor: "#f43f5e", boxShadow: "0 0 0 1px #f43f5e" } : {}}
                placeholder="student@example.com or admin"
                value={signInIdentifier}
                onChange={(e) => {
                  setSignInIdentifier(e.target.value);
                  clearFieldError("signInIdentifier");
                }}
                autoFocus
                required
              />
              <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "3px" }}>
                Enter your registered email address (or admin alias).
              </span>
            </div>

            <div className="form-group" id="field-group-signInPassword">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="form-label">Password *</label>
                {!isMaintenanceMode && (
                  <span
                    style={{ fontSize: "0.74rem", color: "var(--accent-cyan)", cursor: "pointer", fontWeight: 600 }}
                    onClick={() => {
                      resetAllFormFields();
                      setTab("forgot");
                    }}
                  >
                    Forgot password?
                  </span>
                )}
              </div>
              <FieldNotice fieldKey="signInPassword" />
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  id="input-signInPassword"
                  type={showSignInPassword ? "text" : "password"}
                  className="form-input"
                  style={{
                    width: "100%",
                    paddingRight: "42px",
                    borderColor: fieldErrors.signInPassword ? "#f43f5e" : undefined,
                    boxShadow: fieldErrors.signInPassword ? "0 0 0 1px #f43f5e" : undefined,
                  }}
                  placeholder="Enter your password"
                  value={signInPassword}
                  onChange={(e) => {
                    setSignInPassword(e.target.value);
                    clearFieldError("signInPassword");
                  }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowSignInPassword(!showSignInPassword)}
                  title={showSignInPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: "12px",
                    background: "none",
                    border: "none",
                    padding: "4px",
                    color: showSignInPassword ? "#38bdf8" : "var(--text-dim)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "color 0.2s ease",
                  }}
                  tabIndex={-1}
                >
                  {showSignInPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ width: "100%", justifyContent: "center", marginTop: "16px" }}
            >
              {loading ? (
                <>
                  <div className="spinner"></div>
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  <span>Sign In to Academic Vault</span>
                </>
              )}
            </button>

            {!isMaintenanceMode && (
              <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "16px", marginBottom: "8px" }}>
                New student?{" "}
                <span
                  style={{ color: "var(--accent-cyan)", cursor: "pointer", fontWeight: 600 }}
                  onClick={() => {
                    resetAllFormFields();
                    setTab("signup");
                  }}
                >
                  Create Account
                </span>
              </p>
            )}

            <div
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: "8px",
                padding: "8px 12px",
                fontSize: "0.72rem",
                color: "var(--text-dim)",
                marginTop: "10px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "0.9rem" }}>ℹ️</span>
              <span>
                <strong>Account Retention:</strong> Inactive student accounts (90+ days without login) are safely deleted.
              </span>
            </div>
          </form>
        </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: FORGOT PASSWORD ================= */}
        {tab === "forgot" && (
          <div>
            {/* Forgot Password Method Selector: 1. Telegram Bot (Default) | 2. Email OTP */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
              <button
                type="button"
                onClick={() => {
                  if (forgotMode !== "telebot") {
                    resetForgotFields();
                    setForgotMode("telebot");
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: forgotMode === "telebot" ? "1.5px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.1)",
                  background: forgotMode === "telebot" ? "rgba(56, 189, 248, 0.15)" : "rgba(255, 255, 255, 0.03)",
                  color: forgotMode === "telebot" ? "#ffffff" : "var(--text-dim)",
                  fontSize: "0.82rem",
                  fontWeight: forgotMode === "telebot" ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <TelegramIcon />
                <span>1. Tele Bot (Fast)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (forgotMode !== "email") {
                    resetForgotFields();
                    setForgotMode("email");
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: forgotMode === "email" ? "1.5px solid #a78bfa" : "1px solid rgba(255, 255, 255, 0.1)",
                  background: forgotMode === "email" ? "rgba(167, 139, 250, 0.15)" : "rgba(255, 255, 255, 0.03)",
                  color: forgotMode === "email" ? "#ffffff" : "var(--text-dim)",
                  fontSize: "0.82rem",
                  fontWeight: forgotMode === "email" ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <Mail size={15} />
                <span>2. Email OTP</span>
              </button>
            </div>

            {/* OPTION 1: TELEGRAM BOT FORGOT PASSWORD */}
            {forgotMode === "telebot" && (
              <>
                {!forgotTgOtpStep ? (
                  /* Step 1: Verify Mobile Number first, then Email */
                  <form onSubmit={handleForgotTelegramInitiate} autoComplete="off">
                    <div style={{ marginBottom: "16px", textAlign: "center" }}>
                      <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
                        <TelegramIcon />
                      </div>
                      <h4 style={{ margin: "0 0 4px", color: "#fff", fontSize: "1rem" }}>Recover via Telegram Bot</h4>
                      <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-dim)" }}>
                        Bot verifies your Mobile Number first, then checks your Email to deliver an instant recovery code.
                      </p>
                    </div>

                    <div className="form-group" id="field-group-forgotMobile">
                      <label className="form-label">Step 1: Registered 10-Digit Mobile Number *</label>
                      <FieldNotice fieldKey="forgotMobile" />
                      <input
                        id="input-forgotMobile"
                        type="tel"
                        className="form-input"
                        style={fieldErrors.forgotMobile ? { borderColor: "#f43f5e", boxShadow: "0 0 0 1px #f43f5e" } : {}}
                        placeholder="e.g. 9876543210"
                        maxLength={10}
                        value={forgotMobile}
                        onChange={(e) => {
                          setForgotMobile(e.target.value);
                          clearFieldError("forgotMobile");
                        }}
                        required
                        autoFocus
                      />
                    </div>

                    <div className="form-group" id="field-group-forgotEmail">
                      <label className="form-label">Step 2: Registered Gmail Address *</label>
                      <FieldNotice fieldKey="forgotEmail" />
                      <input
                        id="input-forgotEmail"
                        type="email"
                        className="form-input"
                        style={fieldErrors.forgotEmail ? { borderColor: "#f43f5e", boxShadow: "0 0 0 1px #f43f5e" } : {}}
                        placeholder="student@example.com"
                        value={forgotEmail}
                        onChange={(e) => {
                          setForgotEmail(e.target.value);
                          clearFieldError("forgotEmail");
                        }}
                        required
                      />
                      <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "3px" }}>
                        Must match the email account registered with this mobile number.
                      </span>
                    </div>

                    <div style={{ background: "rgba(56, 189, 248, 0.08)", border: "1px solid rgba(56, 189, 248, 0.2)", borderRadius: "8px", padding: "10px 12px", marginBottom: "16px", fontSize: "0.75rem", color: "#7dd3fc" }}>
                      ⚡ <strong>Instant Delivery:</strong> Passcode will be delivered directly via Telegram Bot <strong>@fsm_security_otp_bot</strong> with zero email delay.
                    </div>

                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={loading || forgotMobile.length < 10 || !forgotEmail.trim()}
                      style={{ width: "100%", justifyContent: "center", background: "linear-gradient(135deg, #0284c7, #38bdf8)" }}
                    >
                      {loading ? (
                        <>
                          <div className="spinner"></div>
                          <span>Verifying Credentials...</span>
                        </>
                      ) : (
                        <>
                          <Send size={16} />
                          <span>Request Telegram Bot Passcode</span>
                        </>
                      )}
                    </button>

                    <div style={{ textAlign: "center", marginTop: "16px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          resetAllFormFields();
                          setTab("signin");
                        }}
                        style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      >
                        <ArrowLeft size={14} />
                        <span>Back to Sign In</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  /* Step 2: Enter Telegram OTP & New Password */
                  <form onSubmit={handleForgotTelegramVerify} autoComplete="off">
                    <div style={{ background: "rgba(56, 189, 248, 0.1)", border: "1px solid rgba(56, 189, 248, 0.3)", borderRadius: "10px", padding: "14px", marginBottom: "16px", textAlign: "center" }}>
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
                        Passcode Waiting in Telegram Bot
                      </div>
                      <p style={{ margin: "0 0 10px", fontSize: "0.78rem", color: "var(--text-dim)" }}>
                        Click below to open <strong>@fsm_security_otp_bot</strong>:
                      </p>
                      <a
                        href={forgotTgBotLink || "https://t.me/fsm_security_otp_bot"}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "9px 18px",
                          background: "#2AABEE",
                          color: "#fff",
                          borderRadius: "6px",
                          fontWeight: 700,
                          fontSize: "0.88rem",
                          textDecoration: "none",
                        }}
                      >
                        <TelegramIcon />
                        <span>Open Telegram Bot ↗</span>
                      </a>
                      <p style={{ margin: "10px 0 0", fontSize: "0.76rem", color: "#7dd3fc" }}>
                        🛡️ In the bot: Tap <strong>[ 📲 Verify & Share My Telegram Number ]</strong>, then type your registered <strong>Email Address</strong> to receive your 6-digit passcode.
                      </p>
                    </div>

                    <div className="form-group" id="field-group-forgotTgOtpCode">
                      <label className="form-label" style={{ textAlign: "center", display: "block" }}>
                        6-Digit Recovery Passcode from Telegram *
                      </label>
                      <FieldNotice fieldKey="forgotTgOtpCode" />
                      <input
                        id="input-forgotTgOtpCode"
                        type="text"
                        className="form-input"
                        maxLength={6}
                        placeholder="• • • • • •"
                        value={forgotTgOtpCode}
                        onChange={(e) => {
                          setForgotTgOtpCode(e.target.value.replace(/\D/g, ""));
                          clearFieldError("forgotTgOtpCode");
                        }}
                        style={{
                          textAlign: "center",
                          letterSpacing: "10px",
                          fontSize: "1.45rem",
                          fontWeight: 800,
                          fontFamily: "var(--font-mono)",
                          color: "#38bdf8",
                          padding: "12px",
                          background: "rgba(56, 189, 248, 0.08)",
                          border: fieldErrors.forgotTgOtpCode ? "1.5px solid #f43f5e" : "1.5px solid rgba(56, 189, 248, 0.4)",
                          boxShadow: fieldErrors.forgotTgOtpCode ? "0 0 0 1px #f43f5e" : "none",
                        }}
                        autoFocus
                        required
                      />
                      {forgotTgOtpCode && forgotTgOtpCode.length === 6 && (
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          marginTop: "8px",
                          color: "#10b981",
                          fontSize: "0.84rem",
                          fontWeight: 600,
                          background: "rgba(16, 185, 129, 0.12)",
                          padding: "6px 12px",
                          borderRadius: "8px",
                          border: "1px solid rgba(16, 185, 129, 0.3)",
                        }}>
                          <span>⚡</span>
                          <span>Passcode auto-filled from Telegram! Tap button below to continue.</span>
                        </div>
                      )}
                    </div>

                    <div className="form-group" id="field-group-forgotNewPassword">
                      <label className="form-label">New Password * (Min 6 Characters)</label>
                      <FieldNotice fieldKey="forgotNewPassword" />
                      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                        <input
                          id="input-forgotNewPassword"
                          type={showForgotNewPassword ? "text" : "password"}
                          className="form-input"
                          style={{
                            width: "100%",
                            paddingRight: "42px",
                            borderColor: fieldErrors.forgotNewPassword ? "#f43f5e" : undefined,
                            boxShadow: fieldErrors.forgotNewPassword ? "0 0 0 1px #f43f5e" : undefined,
                          }}
                          placeholder="Enter your new secure password"
                          value={forgotNewPassword}
                          onChange={(e) => {
                            setForgotNewPassword(e.target.value);
                            clearFieldError("forgotNewPassword");
                          }}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowForgotNewPassword(!showForgotNewPassword)}
                          title={showForgotNewPassword ? "Hide password" : "Show password"}
                          style={{
                            position: "absolute",
                            right: "12px",
                            background: "none",
                            border: "none",
                            padding: "4px",
                            color: showForgotNewPassword ? "#38bdf8" : "var(--text-dim)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "color 0.2s ease",
                          }}
                          tabIndex={-1}
                        >
                          {showForgotNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={loading || forgotTgOtpCode.length < 6 || forgotNewPassword.length < 6}
                      style={{ width: "100%", justifyContent: "center", marginTop: "14px", background: "linear-gradient(135deg, #10b981, #06b6d4)" }}
                    >
                      {loading ? (
                        <>
                          <div className="spinner"></div>
                          <span>Updating Password...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={16} />
                          <span>Authorize &amp; Set New Password</span>
                        </>
                      )}
                    </button>

                    <div style={{ textAlign: "center", marginTop: "14px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setForgotTgOtpStep(false);
                          setForgotTgOtpCode("");
                          setError(null);
                        }}
                        style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      >
                        <ArrowLeft size={13} />
                        <span>Change Mobile or Email</span>
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}

            {/* OPTION 2: EMAIL OTP FORGOT PASSWORD */}
            {forgotMode === "email" && (
              <>
                {!forgotOtpStep ? (
                  /* Forgot Password Step 1: Enter Gmail */
                  <form onSubmit={handleRequestForgotOtp} autoComplete="off">
                    <div style={{ marginBottom: "16px", textAlign: "center" }}>
                      <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: "rgba(139, 92, 246, 0.15)", color: "#a78bfa", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
                        <KeyRound size={22} />
                      </div>
                      <h4 style={{ margin: "0 0 4px", color: "#fff", fontSize: "1rem" }}>Recover via Gmail OTP</h4>
                      <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-dim)" }}>
                        Enter your registered Gmail address to receive a recovery passcode in your inbox.
                      </p>
                    </div>

                    <div className="form-group" id="field-group-forgotEmail">
                      <label className="form-label">Registered Gmail Address *</label>
                      <FieldNotice fieldKey="forgotEmail" />
                      <input
                        id="input-forgotEmail"
                        type="email"
                        className="form-input"
                        style={fieldErrors.forgotEmail ? { borderColor: "#f43f5e", boxShadow: "0 0 0 1px #f43f5e" } : {}}
                        placeholder="student@example.com"
                        value={forgotEmail}
                        onChange={(e) => {
                          setForgotEmail(e.target.value);
                          clearFieldError("forgotEmail");
                        }}
                        required
                      />
                      <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "3px" }}>
                        Enter your registered email address to receive your password reset passcode.
                      </span>
                    </div>

                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={loading}
                      style={{ width: "100%", justifyContent: "center", marginTop: "16px", background: "linear-gradient(135deg, #8b5cf6, #3b82f6)" }}
                    >
                      {loading ? (
                        <>
                          <div className="spinner"></div>
                          <span>Dispatching Reset Code...</span>
                        </>
                      ) : (
                        <>
                          <Send size={16} />
                          <span>Send Password Reset Passcode</span>
                        </>
                      )}
                    </button>

                    <div style={{ textAlign: "center", marginTop: "16px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          resetAllFormFields();
                          setTab("signin");
                        }}
                        style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      >
                        <ArrowLeft size={14} />
                        <span>Back to Sign In</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  /* Forgot Password Step 2: Enter OTP & New Password */
                  <form onSubmit={handleVerifyForgotOtp} autoComplete="off">
                    <div className="form-group" id="field-group-forgotOtpCode">
                      <label className="form-label" style={{ textAlign: "center", display: "block" }}>
                        6-Digit Recovery Passcode *
                      </label>
                      <FieldNotice fieldKey="forgotOtpCode" />
                      <input
                        id="input-forgotOtpCode"
                        type="text"
                        className="form-input"
                        maxLength={6}
                        placeholder="• • • • • •"
                        value={forgotOtpCode}
                        onChange={(e) => {
                          setForgotOtpCode(e.target.value.replace(/\D/g, ""));
                          clearFieldError("forgotOtpCode");
                        }}
                        style={{
                          textAlign: "center",
                          letterSpacing: "10px",
                          fontSize: "1.45rem",
                          fontWeight: 800,
                          fontFamily: "var(--font-mono)",
                          color: "#a78bfa",
                          padding: "12px",
                          background: "rgba(139, 92, 246, 0.08)",
                          border: fieldErrors.forgotOtpCode ? "1.5px solid #f43f5e" : "1.5px solid rgba(139, 92, 246, 0.4)",
                          boxShadow: fieldErrors.forgotOtpCode ? "0 0 0 1px #f43f5e" : "none",
                        }}
                        autoFocus
                        required
                      />
                    </div>

                    <div className="form-group" id="field-group-forgotNewPassword">
                      <label className="form-label">New Password * (Min 6 Characters)</label>
                      <FieldNotice fieldKey="forgotNewPassword" />
                      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                        <input
                          id="input-forgotNewPassword"
                          type={showForgotNewPassword ? "text" : "password"}
                          className="form-input"
                          style={{
                            width: "100%",
                            paddingRight: "42px",
                            borderColor: fieldErrors.forgotNewPassword ? "#f43f5e" : undefined,
                            boxShadow: fieldErrors.forgotNewPassword ? "0 0 0 1px #f43f5e" : undefined,
                          }}
                          placeholder="Enter your new secure password"
                          value={forgotNewPassword}
                          onChange={(e) => {
                            setForgotNewPassword(e.target.value);
                            clearFieldError("forgotNewPassword");
                          }}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowForgotNewPassword(!showForgotNewPassword)}
                          title={showForgotNewPassword ? "Hide password" : "Show password"}
                          style={{
                            position: "absolute",
                            right: "12px",
                            background: "none",
                            border: "none",
                            padding: "4px",
                            color: showForgotNewPassword ? "#a78bfa" : "var(--text-dim)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "color 0.2s ease",
                          }}
                          tabIndex={-1}
                        >
                          {showForgotNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={loading || forgotOtpCode.length < 6 || forgotNewPassword.length < 6}
                      style={{ width: "100%", justifyContent: "center", marginTop: "14px", background: "linear-gradient(135deg, #10b981, #06b6d4)" }}
                    >
                      {loading ? (
                        <>
                          <div className="spinner"></div>
                          <span>Updating Password...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={16} />
                          <span>Authorize &amp; Set New Password</span>
                        </>
                      )}
                    </button>

                    <div style={{ textAlign: "center", marginTop: "14px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setForgotOtpStep(false);
                          setForgotOtpCode("");
                          setError(null);
                        }}
                        style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      >
                        <ArrowLeft size={13} />
                        <span>Change Recovery Email</span>
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        )}

        {/* ================= TAB 3: SIGN UP ================= */}
        {!showPostRegPasskeyPrompt && tab === "signup" && !isGoogleOnboarding && (
          <div>
            {/* 1. Continue with Google (Top Option 1) */}
            <button
              type="button"
              className="btn-google-auth"
              onClick={handleGoogleSignIn}
              disabled={loading}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                padding: "11px 16px",
                background: "#ffffff",
                color: "#1f2937",
                border: "1px solid #e5e7eb",
                borderRadius: "var(--radius-md)",
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                marginBottom: "14px",
              }}
            >
              <GoogleIcon />
              <span>1. Continue with Google</span>
            </button>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", margin: "14px 0", gap: "10px" }}>
              <div style={{ flex: 1, height: "1px", background: "rgba(255, 255, 255, 0.1)" }} />
              <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                or select registration method
              </span>
              <div style={{ flex: 1, height: "1px", background: "rgba(255, 255, 255, 0.1)" }} />
            </div>

            {/* Registration Method Selector: 2. For Tele Bot | 3. OTP with Email */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
              <button
                type="button"
                onClick={() => {
                  if (regMode !== "telebot") {
                    resetSignUpFields();
                    setRegMode("telebot");
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "9px 8px",
                  borderRadius: "8px",
                  border: regMode === "telebot" ? "1.5px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.1)",
                  background: regMode === "telebot" ? "rgba(56, 189, 248, 0.15)" : "rgba(255, 255, 255, 0.03)",
                  color: regMode === "telebot" ? "#ffffff" : "var(--text-dim)",
                  fontSize: "0.78rem",
                  fontWeight: regMode === "telebot" ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <TelegramIcon />
                <span>2. For Tele Bot</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (regMode !== "email") {
                    resetSignUpFields();
                    setRegMode("email");
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "9px 8px",
                  borderRadius: "8px",
                  border: regMode === "email" ? "1.5px solid #a78bfa" : "1px solid rgba(255, 255, 255, 0.1)",
                  background: regMode === "email" ? "rgba(167, 139, 250, 0.15)" : "rgba(255, 255, 255, 0.03)",
                  color: regMode === "email" ? "#ffffff" : "var(--text-dim)",
                  fontSize: "0.78rem",
                  fontWeight: regMode === "email" ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <Mail size={14} />
                <span>3. OTP with Email</span>
              </button>
            </div>

            {/* METHOD 2: TELEGRAM BOT VERIFICATION */}
            {regMode === "telebot" && (
              <>
                {!regTgStep ? (
                  <form onSubmit={handleSignUpTelegramInitiate} autoComplete="off">
                    <div className="form-group" id="field-group-name">
                      <label className="form-label">Full Name *</label>
                      <FieldNotice fieldKey="name" />
                      <input
                        id="input-name"
                        type="text"
                        className="form-input"
                        style={fieldErrors.name ? { borderColor: "#f43f5e", boxShadow: "0 0 0 1px #f43f5e" } : {}}
                        placeholder="Enter your full name"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          clearFieldError("name");
                        }}
                        required
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div className="form-group" id="field-group-mobile">
                        <label className="form-label">Mobile Number *</label>
                        <FieldNotice fieldKey="mobile" />
                        <input
                          id="input-mobile"
                          type="tel"
                          className="form-input"
                          style={fieldErrors.mobile ? { borderColor: "#f43f5e", boxShadow: "0 0 0 1px #f43f5e" } : {}}
                          placeholder="10-digit number"
                          value={mobile}
                          onChange={(e) => {
                            setMobile(e.target.value);
                            clearFieldError("mobile");
                          }}
                          maxLength={10}
                          required
                        />
                      </div>

                      <div className="form-group" id="field-group-email">
                        <label className="form-label">Email Address *</label>
                        <FieldNotice fieldKey="email" />
                        <input
                          id="input-email"
                          type="email"
                          className="form-input"
                          style={fieldErrors.email ? { borderColor: "#f43f5e", boxShadow: "0 0 0 1px #f43f5e" } : {}}
                          placeholder="student@example.com"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            clearFieldError("email");
                          }}
                          required
                        />
                      </div>
                    </div>

                    <div className="form-group" id="field-group-college">
                      <label className="form-label">College / University Name *</label>
                      <FieldNotice fieldKey="college" />
                      <input
                        id="input-college"
                        type="text"
                        className="form-input"
                        style={fieldErrors.college ? { borderColor: "#f43f5e", boxShadow: "0 0 0 1px #f43f5e" } : {}}
                        placeholder="e.g. University / College name"
                        value={college}
                        onChange={(e) => {
                          setCollege(e.target.value);
                          clearFieldError("college");
                        }}
                        required
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div className="form-group" id="field-group-year">
                        <label className="form-label">Academic Year</label>
                        <FieldNotice fieldKey="year" />
                        <select
                          id="input-year"
                          className="form-select"
                          style={fieldErrors.year ? { borderColor: "#f43f5e", boxShadow: "0 0 0 1px #f43f5e" } : {}}
                          value={year}
                          onChange={(e) => {
                            setYear(e.target.value);
                            clearFieldError("year");
                          }}
                        >
                          <option value="1st Year">1st Year</option>
                          <option value="2nd Year">2nd Year</option>
                          <option value="3rd Year">3rd Year</option>
                          <option value="4th Year">4th Year</option>
                          <option value="Post Graduate">Post Graduate / M.Tech</option>
                          <option value="Faculty / Other">Faculty / Other</option>
                        </select>
                      </div>

                      <div className="form-group" id="field-group-signUpPassword">
                        <label className="form-label">Password * (Min 6 chars)</label>
                        <FieldNotice fieldKey="signUpPassword" />
                        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                          <input
                            id="input-signUpPassword"
                            type={showSignUpPassword ? "text" : "password"}
                            className="form-input"
                            style={{
                              width: "100%",
                              paddingRight: "42px",
                              borderColor: fieldErrors.signUpPassword ? "#f43f5e" : undefined,
                              boxShadow: fieldErrors.signUpPassword ? "0 0 0 1px #f43f5e" : undefined,
                            }}
                            placeholder="Min 6 characters"
                            value={signUpPassword}
                            onChange={(e) => {
                              setSignUpPassword(e.target.value);
                              clearFieldError("signUpPassword");
                            }}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                            title={showSignUpPassword ? "Hide password" : "Show password"}
                            style={{
                              position: "absolute",
                              right: "12px",
                              background: "none",
                              border: "none",
                              padding: "4px",
                              color: showSignUpPassword ? "#38bdf8" : "var(--text-dim)",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              transition: "color 0.2s ease",
                            }}
                            tabIndex={-1}
                          >
                            {showSignUpPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div style={{ background: "rgba(56, 189, 248, 0.08)", border: "1px solid rgba(56, 189, 248, 0.2)", borderRadius: "8px", padding: "10px 12px", marginBottom: "16px", fontSize: "0.75rem", color: "#7dd3fc" }}>
                      ⚡ <strong>Instant Bot Verification:</strong> 6-digit OTP verification code will be delivered instantly via Telegram Bot.
                    </div>

                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={loading}
                      style={{ width: "100%", justifyContent: "center", background: "linear-gradient(135deg, #0284c7, #38bdf8)" }}
                    >
                      {loading ? (
                        <>
                          <div className="spinner"></div>
                          <span>Preparing Verification...</span>
                        </>
                      ) : (
                        <>
                          <TelegramIcon />
                          <span>Get OTP via Telegram Bot</span>
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  /* Step 2: Enter Telegram OTP */
                  <form onSubmit={handleSignUpTelegramVerify} autoComplete="off">
                    <div style={{ background: "rgba(56, 189, 248, 0.1)", border: "1px solid rgba(56, 189, 248, 0.3)", borderRadius: "10px", padding: "16px", marginBottom: "16px", textAlign: "center" }}>
                      <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
                        Verification Waiting in Telegram Bot
                      </div>
                      <p style={{ margin: "0 0 10px", fontSize: "0.78rem", color: "var(--text-dim)", lineHeight: "1.4" }}>
                        Tap the button below to open <strong>@fsm_security_otp_bot</strong>:
                      </p>

                      <div style={{ display: "flex", justifyContent: "center", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            window.open(regTgBotLink || "https://t.me/fsm_security_otp_bot", "_blank", "noopener,noreferrer");
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "9px 18px",
                            background: "#2AABEE",
                            color: "#fff",
                            borderRadius: "6px",
                            fontWeight: 700,
                            fontSize: "0.84rem",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          <TelegramIcon />
                          <span>Open Telegram Bot ↗</span>
                        </button>
                      </div>

                      <p style={{ margin: "10px 0 0", fontSize: "0.76rem", color: "#7dd3fc" }}>
                        🛡️ In the bot, tap <strong>[ 📲 Verify & Share My Telegram Number ]</strong> to receive your 6-digit passcode.
                      </p>
                    </div>

                    <div className="form-group" id="field-group-regTgOtpCode">
                      <label className="form-label" style={{ textAlign: "center", display: "block" }}>
                        6-Digit Verification Passcode from Telegram *
                      </label>
                      <FieldNotice fieldKey="regTgOtpCode" />
                      <input
                        id="input-regTgOtpCode"
                        type="text"
                        className="form-input"
                        maxLength={6}
                        placeholder="• • • • • •"
                        value={regTgOtpCode}
                        onChange={(e) => {
                          setRegTgOtpCode(e.target.value.replace(/\D/g, ""));
                          clearFieldError("regTgOtpCode");
                        }}
                        style={{
                          textAlign: "center",
                          letterSpacing: "10px",
                          fontSize: "1.45rem",
                          fontWeight: 800,
                          fontFamily: "var(--font-mono)",
                          color: "#38bdf8",
                          padding: "12px",
                          background: "rgba(56, 189, 248, 0.08)",
                          border: fieldErrors.regTgOtpCode ? "1.5px solid #f43f5e" : "1.5px solid rgba(56, 189, 248, 0.4)",
                          boxShadow: fieldErrors.regTgOtpCode ? "0 0 0 1px #f43f5e" : "none",
                        }}
                        autoFocus
                        required
                      />
                      {regTgOtpCode && regTgOtpCode.length === 6 && (
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          marginTop: "8px",
                          color: "#10b981",
                          fontSize: "0.84rem",
                          fontWeight: 600,
                          background: "rgba(16, 185, 129, 0.12)",
                          padding: "6px 12px",
                          borderRadius: "8px",
                          border: "1px solid rgba(16, 185, 129, 0.3)",
                        }}>
                          <span>⚡</span>
                          <span>Passcode auto-filled from Telegram! Tap button below to continue.</span>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={loading || regTgOtpCode.length < 6}
                      style={{
                        width: "100%",
                        justifyContent: "center",
                        marginTop: "14px",
                        background: "linear-gradient(135deg, #0284c7, #06b6d4)",
                      }}
                    >
                      {loading ? (
                        <>
                          <div className="spinner"></div>
                          <span>Activating Account...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={16} />
                          <span>Complete Registration &amp; Access Vault</span>
                        </>
                      )}
                    </button>

                    <div style={{ textAlign: "center", marginTop: "14px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setRegTgStep(false);
                          setRegTgOtpCode("");
                          setError(null);
                        }}
                        style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      >
                        <ArrowLeft size={13} />
                        <span>Edit Details</span>
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}

            {/* METHOD 3: EMAIL OTP VERIFICATION */}
            {regMode === "email" && (
              <>
                {!signUpOtpStep ? (
                  <form onSubmit={handleRequestSignUpOtp} autoComplete="off">
                    <div className="form-group" id="field-group-name-email">
                      <label className="form-label">Full Name *</label>
                      <FieldNotice fieldKey="name" />
                      <input
                        id="input-name-email"
                        type="text"
                        className="form-input"
                        style={fieldErrors.name ? { borderColor: "#f43f5e", boxShadow: "0 0 0 1px #f43f5e" } : {}}
                        placeholder="Enter your full name"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          clearFieldError("name");
                        }}
                        required
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div className="form-group" id="field-group-mobile-email">
                        <label className="form-label">Mobile Number *</label>
                        <FieldNotice fieldKey="mobile" />
                        <input
                          id="input-mobile-email"
                          type="tel"
                          className="form-input"
                          style={fieldErrors.mobile ? { borderColor: "#f43f5e", boxShadow: "0 0 0 1px #f43f5e" } : {}}
                          placeholder="10-digit number"
                          value={mobile}
                          onChange={(e) => {
                            setMobile(e.target.value);
                            clearFieldError("mobile");
                          }}
                          maxLength={10}
                          required
                        />
                      </div>

                      <div className="form-group" id="field-group-email-email">
                        <label className="form-label">Email Address *</label>
                        <FieldNotice fieldKey="email" />
                        <input
                          id="input-email-email"
                          type="email"
                          className="form-input"
                          style={fieldErrors.email ? { borderColor: "#f43f5e", boxShadow: "0 0 0 1px #f43f5e" } : {}}
                          placeholder="student@example.com"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            clearFieldError("email");
                          }}
                          required
                        />
                      </div>
                    </div>

                    <div className="form-group" id="field-group-college-email">
                      <label className="form-label">College / University Name *</label>
                      <FieldNotice fieldKey="college" />
                      <input
                        id="input-college-email"
                        type="text"
                        className="form-input"
                        style={fieldErrors.college ? { borderColor: "#f43f5e", boxShadow: "0 0 0 1px #f43f5e" } : {}}
                        placeholder="e.g. University / College name"
                        value={college}
                        onChange={(e) => {
                          setCollege(e.target.value);
                          clearFieldError("college");
                        }}
                        required
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div className="form-group" id="field-group-year">
                        <label className="form-label">Academic Year</label>
                        <FieldNotice fieldKey="year" />
                        <select
                          id="input-year"
                          className="form-select"
                          style={fieldErrors.year ? { borderColor: "#f43f5e", boxShadow: "0 0 0 1px #f43f5e" } : {}}
                          value={year}
                          onChange={(e) => {
                            setYear(e.target.value);
                            clearFieldError("year");
                          }}
                        >
                          <option value="1st Year">1st Year</option>
                          <option value="2nd Year">2nd Year</option>
                          <option value="3rd Year">3rd Year</option>
                          <option value="4th Year">4th Year</option>
                          <option value="Post Graduate">Post Graduate / M.Tech</option>
                          <option value="Faculty / Other">Faculty / Other</option>
                        </select>
                      </div>

                      <div className="form-group" id="field-group-signUpPassword-email">
                        <label className="form-label">Password * (Min 6 chars)</label>
                        <FieldNotice fieldKey="signUpPassword" />
                        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                          <input
                            id="input-signUpPassword-email"
                            type={showSignUpPassword ? "text" : "password"}
                            className="form-input"
                            style={{
                              width: "100%",
                              paddingRight: "42px",
                              borderColor: fieldErrors.signUpPassword ? "#f43f5e" : undefined,
                              boxShadow: fieldErrors.signUpPassword ? "0 0 0 1px #f43f5e" : undefined,
                            }}
                            placeholder="Min 6 characters"
                            value={signUpPassword}
                            onChange={(e) => {
                              setSignUpPassword(e.target.value);
                              clearFieldError("signUpPassword");
                            }}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                            title={showSignUpPassword ? "Hide password" : "Show password"}
                            style={{
                              position: "absolute",
                              right: "12px",
                              background: "none",
                              border: "none",
                              padding: "4px",
                              color: showSignUpPassword ? "#a78bfa" : "var(--text-dim)",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              transition: "color 0.2s ease",
                            }}
                            tabIndex={-1}
                          >
                            {showSignUpPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={loading}
                      style={{ width: "100%", justifyContent: "center", marginTop: "16px" }}
                    >
                      {loading ? (
                        <>
                          <div className="spinner"></div>
                          <span>Dispatching OTP...</span>
                        </>
                      ) : (
                        <>
                          <Mail size={16} />
                          <span>Continue with Email OTP Verification</span>
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifySignUpOtp} autoComplete="off">
                    <div style={{ marginBottom: "16px", textAlign: "center" }}>
                      <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
                        <ShieldCheck size={24} />
                      </div>
                      <h4 style={{ margin: "0 0 4px", color: "#fff", fontSize: "1.05rem" }}>Verify Student Email</h4>
                      <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-dim)" }}>
                        Enter the 6-digit verification code dispatched to <strong style={{ color: "#38bdf8" }}>{email}</strong>
                      </p>
                    </div>

                    <div className="form-group" id="field-group-signUpOtpCode">
                      <label className="form-label" style={{ textAlign: "center", display: "block" }}>
                        6-Digit Verification Passcode *
                      </label>
                      <FieldNotice fieldKey="signUpOtpCode" />
                      <input
                        id="input-signUpOtpCode"
                        type="text"
                        className="form-input"
                        maxLength={6}
                        placeholder="• • • • • •"
                        value={signUpOtpCode}
                        onChange={(e) => {
                          setSignUpOtpCode(e.target.value.replace(/\D/g, ""));
                          clearFieldError("signUpOtpCode");
                        }}
                        style={{
                          textAlign: "center",
                          letterSpacing: "10px",
                          fontSize: "1.45rem",
                          fontWeight: 800,
                          fontFamily: "var(--font-mono)",
                          color: "#38bdf8",
                          padding: "12px",
                          background: "rgba(56, 189, 248, 0.08)",
                          border: fieldErrors.signUpOtpCode ? "1.5px solid #f43f5e" : "1.5px solid rgba(56, 189, 248, 0.4)",
                          boxShadow: fieldErrors.signUpOtpCode ? "0 0 0 1px #f43f5e" : "none",
                        }}
                        autoFocus
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={loading || signUpOtpCode.length < 6}
                      style={{ width: "100%", justifyContent: "center", marginTop: "14px", background: "linear-gradient(135deg, #0284c7, #06b6d4)" }}
                    >
                      {loading ? (
                        <>
                          <div className="spinner"></div>
                          <span>Verifying &amp; Registering...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={16} />
                          <span>Verify OTP &amp; Complete Registration</span>
                        </>
                      )}
                    </button>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSignUpOtpStep(false);
                          setSignUpOtpCode("");
                          setError(null);
                        }}
                        style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      >
                        <ArrowLeft size={13} />
                        <span>Edit Details</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleResendSignUpOtp}
                        disabled={loading}
                        style={{ background: "none", border: "none", color: "var(--accent-cyan)", cursor: "pointer", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 600 }}
                      >
                        <RefreshCw size={13} />
                        <span>Resend OTP</span>
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}


            {/* Back to sign in link */}
            <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "16px" }}>
              Already registered?{" "}
              <span
                style={{ color: "var(--accent-cyan)", cursor: "pointer", fontWeight: 600 }}
                onClick={() => {
                  resetAllFormFields();
                  setTab("signin");
                }}
              >
                Sign In
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
