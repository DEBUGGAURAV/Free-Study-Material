import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Bot,
  Zap,
  Activity,
  RefreshCw,
  Power,
  ShieldCheck,
  Cpu,
  Server,
  Cloud,
  CheckCircle,
  AlertTriangle,
  Send,
  RotateCcw,
  Key,
  Eye,
  EyeOff,
  Flame,
  Globe,
} from "lucide-react";
import { api } from "../../../api";

export default function TabAiEngine() {
  const [loading, setLoading] = useState(true);
  const [telemetry, setTelemetry] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackType, setFeedbackType] = useState("info"); // 'info' | 'success' | 'error'

  // Keys & Credentials Form
  const [groqKeyInput, setGroqKeyInput] = useState("");
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);

  // Testing AI
  const [testingGroq, setTestingGroq] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Student Query Playground
  const [playQuery, setPlayQuery] = useState("");
  const [playContext, setPlayContext] = useState("");
  const [playLoading, setPlayLoading] = useState(false);
  const [playAnswer, setPlayAnswer] = useState(null);

  const loadTelemetry = async () => {
    try {
      setLoading(true);
      const res = await api.getAiTelemetry();
      if (res && res.success) {
        setTelemetry(res);
      }
    } catch (err) {
      console.warn("[AI-ENGINE] Failed to load telemetry:", err.message);
      showNotice("Could not load AI telemetry: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTelemetry();
  }, []);

  const showNotice = (msg, type = "info") => {
    setFeedback(msg);
    setFeedbackType(type);
    setTimeout(() => setFeedback(""), 5000);
  };

  // Toggle Provider
  const handleToggle = async (provider, currentState) => {
    try {
      const nextState = !currentState;
      showNotice(`Updating ${provider.toUpperCase()} state...`, "info");
      const res = await api.updateAiToggle(provider, nextState);
      if (res && res.success) {
        setTelemetry(res.telemetry);
        showNotice(`✅ ${provider.toUpperCase()} is now ${nextState ? "ACTIVE (ON)" : "PAUSED (OFF)"}!`, "success");
      }
    } catch (err) {
      showNotice("Error toggling engine: " + err.message, "error");
    }
  };

  // Save API Keys
  const handleSaveKeys = async (e) => {
    e.preventDefault();
    if (!groqKeyInput && !geminiKeyInput) {
      showNotice("Please enter at least one API key to save.", "error");
      return;
    }
    try {
      setSavingKeys(true);
      const res = await api.updateAiKeys({
        groqApiKey: groqKeyInput.trim() || undefined,
        geminiApiKey: geminiKeyInput.trim() || undefined,
      });
      if (res && res.success) {
        setTelemetry(res.telemetry);
        setGroqKeyInput("");
        setGeminiKeyInput("");
        showNotice("✅ AI API credentials encrypted and activated successfully!", "success");
      }
    } catch (err) {
      showNotice("Failed to save credentials: " + err.message, "error");
    } finally {
      setSavingKeys(false);
    }
  };

  // Reset Counters
  const handleResetCounters = async () => {
    if (!window.confirm("Are you sure you want to reset today's AI usage counters to 0?")) return;
    try {
      const res = await api.resetAiCounters();
      if (res && res.success) {
        setTelemetry(res.telemetry);
        showNotice("✅ Daily AI usage counters reset to 0!", "success");
      }
    } catch (err) {
      showNotice("Error resetting counters: " + err.message, "error");
    }
  };

  // Test Ping Provider
  const handleTestPing = async (provider) => {
    try {
      if (provider === "groq") setTestingGroq(true);
      if (provider === "gemini") setTestingGemini(true);
      setTestResult(null);

      const res = await api.testAiConnection(provider);
      if (res && res.success) {
        setTestResult(res.testResult);
        showNotice(`⚡ ${provider.toUpperCase()} Ping Success: ${res.testResult.latencyMs}ms!`, "success");
      }
    } catch (err) {
      showNotice(`❌ ${provider.toUpperCase()} Ping Error: ${err.message}`, "error");
    } finally {
      setTestingGroq(false);
      setTestingGemini(false);
    }
  };

  // Test Student Query in Playground
  const handlePlaygroundSubmit = async (e) => {
    e.preventDefault();
    if (!playQuery.trim()) return;
    try {
      setPlayLoading(true);
      setPlayAnswer(null);
      const res = await api.askAiQuestion(playQuery, playContext);
      if (res && res.success) {
        setPlayAnswer(res);
        loadTelemetry(); // refresh usage
      } else {
        showNotice(res.message || "Failed to get AI answer", "error");
      }
    } catch (err) {
      showNotice("Playground query failed: " + err.message, "error");
    } finally {
      setPlayLoading(false);
    }
  };

  const usage = telemetry?.usage || {
    groqUsedToday: 0,
    groqRemainingToday: 14400,
    groqPercent: 0,
    geminiUsedToday: 0,
    geminiRemainingToday: 1500,
    geminiPercent: 0,
    totalDailyCapacity: 15900,
    totalDailyUsed: 0,
    totalQueriesToday: 0,
    failoversToday: 0,
    cachedHitsToday: 0,
    serverCpuImpact: "0.0%",
  };

  const settings = telemetry?.settings || {
    groqEnabled: true,
    geminiEnabled: true,
    edgeProxyEnabled: true,
    groqApiKeyConfigured: false,
    geminiApiKeyConfigured: false,
    groqKeyPreview: "Not Configured",
    geminiKeyPreview: "Not Configured",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header & Controls Banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          paddingBottom: "16px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.4rem" }}>🤖</span>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#fff", margin: 0 }}>
              AI Studio: Dual Groq LPU + Gemini 2.0 Engine
            </h3>
            <span
              style={{
                fontSize: "0.72rem",
                padding: "3px 8px",
                borderRadius: "999px",
                background: "rgba(16, 185, 129, 0.15)",
                color: "#34d399",
                border: "1px solid rgba(16, 185, 129, 0.35)",
                fontWeight: 700,
              }}
            >
              15,900 Free Queries / Day
            </span>
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", margin: "4px 0 0" }}>
            Autonomous Edge AI Proxy with automatic failover waterfall. Zero Render server CPU &amp; 100% budget phone friendly.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={loadTelemetry}
            disabled={loading}
            className="btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", padding: "7px 12px" }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleResetCounters}
            className="btn-secondary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.78rem",
              padding: "7px 12px",
              borderColor: "rgba(244, 63, 94, 0.4)",
              color: "#fb7185",
            }}
            title="Reset today's usage count back to 0"
          >
            <RotateCcw size={13} />
            <span>Reset Usage</span>
          </button>
        </div>
      </div>

      {/* Floating Notice Feedback */}
      {feedback && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: "10px",
            fontSize: "0.82rem",
            fontWeight: 600,
            background:
              feedbackType === "success"
                ? "rgba(16, 185, 129, 0.15)"
                : feedbackType === "error"
                ? "rgba(244, 63, 94, 0.15)"
                : "rgba(56, 189, 248, 0.15)",
            border: `1px solid ${
              feedbackType === "success"
                ? "rgba(16, 185, 129, 0.4)"
                : feedbackType === "error"
                ? "rgba(244, 63, 94, 0.4)"
                : "rgba(56, 189, 248, 0.4)"
            }`,
            color:
              feedbackType === "success"
                ? "#34d399"
                : feedbackType === "error"
                ? "#fb7185"
                : "#38bdf8",
          }}
        >
          {feedback}
        </div>
      )}

      {/* Top Telemetry KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "14px",
        }}
      >
        {/* Total Capacity Card */}
        <div
          style={{
            padding: "16px",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "14px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-dim)", fontSize: "0.78rem" }}>
            <span>Total Free Capacity</span>
            <Sparkles size={16} color="#38bdf8" />
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#fff", marginTop: "6px" }}>
            15,900
            <span style={{ fontSize: "0.8rem", color: "#38bdf8", marginLeft: "4px" }}>RPD</span>
          </div>
          <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "4px" }}>
            14,400 (Groq) + 1,500 (Gemini)
          </div>
        </div>

        {/* Used Today Card */}
        <div
          style={{
            padding: "16px",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "14px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-dim)", fontSize: "0.78rem" }}>
            <span>Queries Served Today</span>
            <Activity size={16} color="#34d399" />
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#34d399", marginTop: "6px" }}>
            {usage.totalQueriesToday}
            <span style={{ fontSize: "0.8rem", color: "#94a3b8", marginLeft: "6px", fontWeight: 500 }}>
              / {usage.totalDailyCapacity}
            </span>
          </div>
          <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "4px" }}>
            {usage.cachedHitsToday} served from 0ms cache
          </div>
        </div>

        {/* Failover Shield Card */}
        <div
          style={{
            padding: "16px",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "14px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-dim)", fontSize: "0.78rem" }}>
            <span>Auto-Failovers Today</span>
            <ShieldCheck size={16} color="#a78bfa" />
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#a78bfa", marginTop: "6px" }}>
            {usage.failoversToday}
          </div>
          <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "4px" }}>
            Groq 429 ➔ Gemini seamless shifts
          </div>
        </div>

        {/* Server Impact Card */}
        <div
          style={{
            padding: "16px",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "14px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-dim)", fontSize: "0.78rem" }}>
            <span>Server CPU Impact</span>
            <Cpu size={16} color="#fbbf24" />
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#fbbf24", marginTop: "6px" }}>
            0.0%
          </div>
          <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "4px" }}>
            Inference on Cloud LPU / TPU
          </div>
        </div>
      </div>

      {/* Main Dual Engine Controls (Groq & Gemini Cards) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "18px" }}>
        {/* ============================================================== */}
        {/* 1. Groq LPU Card (Primary) */}
        {/* ============================================================== */}
        <div
          style={{
            background: "rgba(15, 23, 42, 0.65)",
            border: settings.groqEnabled ? "1px solid rgba(16, 185, 129, 0.35)" : "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "16px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            position: "relative",
            boxShadow: settings.groqEnabled ? "0 10px 30px rgba(16, 185, 129, 0.08)" : "none",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "1.2rem" }}>⚡</span>
                <h4 style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", margin: 0 }}>
                  Groq Cloud LPU (Primary)
                </h4>
                <span
                  style={{
                    fontSize: "0.68rem",
                    padding: "2px 7px",
                    borderRadius: "6px",
                    background: "rgba(16, 185, 129, 0.2)",
                    color: "#34d399",
                    fontWeight: 700,
                  }}
                >
                  Model: {settings.groqModel || "llama-3.1-8b"}
                </span>
              </div>
              <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", margin: "4px 0 0" }}>
                Ultra-fast ~800 tokens/sec. 14,400 free requests per day, 30 RPM limit.
              </p>
            </div>

            {/* Toggle Switch */}
            <button
              type="button"
              onClick={() => handleToggle("groq", settings.groqEnabled)}
              style={{
                background: settings.groqEnabled ? "linear-gradient(135deg, #10b981, #059669)" : "rgba(255, 255, 255, 0.1)",
                color: "#fff",
                border: "none",
                borderRadius: "999px",
                padding: "6px 14px",
                fontSize: "0.78rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: settings.groqEnabled ? "0 2px 10px rgba(16, 185, 129, 0.4)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              <Power size={13} />
              <span>{settings.groqEnabled ? "ACTIVE" : "PAUSED"}</span>
            </button>
          </div>

          {/* Usage Meter */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem", marginBottom: "6px" }}>
              <span style={{ color: "var(--text-dim)" }}>Today's Usage Quota:</span>
              <strong style={{ color: "#34d399", fontFamily: "var(--font-mono)" }}>
                {usage.groqUsedToday} / 14,400 ({usage.groqPercent}%)
              </strong>
            </div>
            <div
              style={{
                width: "100%",
                height: "8px",
                borderRadius: "999px",
                background: "rgba(255, 255, 255, 0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, usage.groqPercent)}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #10b981, #06b6d4)",
                  borderRadius: "999px",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "4px" }}>
              <span>Remaining: {usage.groqRemainingToday} requests</span>
              <span>Speed: ~800 tps</span>
            </div>
          </div>

          {/* Status & Key Info */}
          <div
            style={{
              padding: "10px 14px",
              background: "rgba(255, 255, 255, 0.02)",
              borderRadius: "10px",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.76rem",
            }}
          >
            <div>
              <span style={{ color: "var(--text-dim)" }}>API Key: </span>
              <strong style={{ color: settings.groqApiKeyConfigured ? "#34d399" : "#fb7185", fontFamily: "var(--font-mono)" }}>
                {settings.groqKeyPreview}
              </strong>
            </div>

            <button
              type="button"
              onClick={() => handleTestPing("groq")}
              disabled={testingGroq || !settings.groqApiKeyConfigured}
              className="btn-secondary"
              style={{ padding: "4px 10px", fontSize: "0.72rem", cursor: "pointer", opacity: settings.groqApiKeyConfigured ? 1 : 0.5 }}
            >
              <Zap size={11} className={testingGroq ? "animate-spin" : ""} />
              <span>{testingGroq ? "Pinging..." : "Test Ping"}</span>
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* 2. Google Gemini 2.0 Flash Card (Secondary / Failover) */}
        {/* ============================================================== */}
        <div
          style={{
            background: "rgba(15, 23, 42, 0.65)",
            border: settings.geminiEnabled ? "1px solid rgba(56, 189, 248, 0.35)" : "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "16px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            position: "relative",
            boxShadow: settings.geminiEnabled ? "0 10px 30px rgba(56, 189, 248, 0.08)" : "none",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "1.2rem" }}>🌐</span>
                <h4 style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", margin: 0 }}>
                  Gemini 2.0 Flash (Standby Failover)
                </h4>
                <span
                  style={{
                    fontSize: "0.68rem",
                    padding: "2px 7px",
                    borderRadius: "6px",
                    background: "rgba(56, 189, 248, 0.2)",
                    color: "#38bdf8",
                    fontWeight: 700,
                  }}
                >
                  Model: {settings.geminiModel || "gemini-2.0-flash"}
                </span>
              </div>
              <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", margin: "4px 0 0" }}>
                Deep academic reasoning. 1,500 free requests per day, 15 RPM auto-standby.
              </p>
            </div>

            {/* Toggle Switch */}
            <button
              type="button"
              onClick={() => handleToggle("gemini", settings.geminiEnabled)}
              style={{
                background: settings.geminiEnabled ? "linear-gradient(135deg, #0284c7, #06b6d4)" : "rgba(255, 255, 255, 0.1)",
                color: "#fff",
                border: "none",
                borderRadius: "999px",
                padding: "6px 14px",
                fontSize: "0.78rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: settings.geminiEnabled ? "0 2px 10px rgba(2, 132, 199, 0.4)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              <Power size={13} />
              <span>{settings.geminiEnabled ? "ACTIVE" : "PAUSED"}</span>
            </button>
          </div>

          {/* Usage Meter */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem", marginBottom: "6px" }}>
              <span style={{ color: "var(--text-dim)" }}>Today's Usage Quota:</span>
              <strong style={{ color: "#38bdf8", fontFamily: "var(--font-mono)" }}>
                {usage.geminiUsedToday} / 1,500 ({usage.geminiPercent}%)
              </strong>
            </div>
            <div
              style={{
                width: "100%",
                height: "8px",
                borderRadius: "999px",
                background: "rgba(255, 255, 255, 0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, usage.geminiPercent)}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #0284c7, #8b5cf6)",
                  borderRadius: "999px",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "4px" }}>
              <span>Remaining: {usage.geminiRemainingToday} requests</span>
              <span>Role: Automatic Failover</span>
            </div>
          </div>

          {/* Status & Key Info */}
          <div
            style={{
              padding: "10px 14px",
              background: "rgba(255, 255, 255, 0.02)",
              borderRadius: "10px",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.76rem",
            }}
          >
            <div>
              <span style={{ color: "var(--text-dim)" }}>API Key: </span>
              <strong style={{ color: settings.geminiApiKeyConfigured ? "#38bdf8" : "#fb7185", fontFamily: "var(--font-mono)" }}>
                {settings.geminiKeyPreview}
              </strong>
            </div>

            <button
              type="button"
              onClick={() => handleTestPing("gemini")}
              disabled={testingGemini || !settings.geminiApiKeyConfigured}
              className="btn-secondary"
              style={{ padding: "4px 10px", fontSize: "0.72rem", cursor: "pointer", opacity: settings.geminiApiKeyConfigured ? 1 : 0.5 }}
            >
              <Zap size={11} className={testingGemini ? "animate-spin" : ""} />
              <span>{testingGemini ? "Pinging..." : "Test Ping"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Cloudflare Edge Worker Proxy Switch & Credentials Manager */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "18px" }}>
        {/* Edge Proxy Banner */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "16px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Globe size={18} color="#f59e0b" />
              <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff", margin: 0 }}>
                Cloudflare Worker Edge Proxy
              </h4>
            </div>

            <button
              type="button"
              onClick={() => handleToggle("edge", settings.edgeProxyEnabled)}
              style={{
                background: settings.edgeProxyEnabled ? "rgba(245, 158, 11, 0.15)" : "rgba(255, 255, 255, 0.05)",
                color: settings.edgeProxyEnabled ? "#fbbf24" : "#94a3b8",
                border: settings.edgeProxyEnabled ? "1px solid rgba(245, 158, 11, 0.35)" : "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                padding: "5px 12px",
                fontSize: "0.75rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {settings.edgeProxyEnabled ? "🟢 EDGE ACTIVE" : "⚪ DISABLED"}
            </button>
          </div>

          <p style={{ fontSize: "0.78rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
            When enabled, student AI requests route directly through <strong>Cloudflare Global Edge</strong> to Groq/Gemini. 
            Your Node.js Render backend experiences <strong>0 requests, 0 CPU load, and 0 bandwidth usage</strong>.
          </p>

          <div style={{ fontSize: "0.72rem", color: "#64748b", fontFamily: "var(--font-mono)" }}>
            Edge Route: CF_WORKER /api/ai/ask ➔ Groq / Gemini ➔ Student Browser
          </div>
        </div>

        {/* Configure / Update API Keys Form */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "16px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Key size={18} color="#38bdf8" />
            <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff", margin: 0 }}>
              Update API Credentials
            </h4>
          </div>

          <form onSubmit={handleSaveKeys} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Groq Key Input */}
            <div style={{ position: "relative" }}>
              <input
                type={showGroqKey ? "text" : "password"}
                value={groqKeyInput}
                onChange={(e) => setGroqKeyInput(e.target.value)}
                placeholder="Paste Groq API Key (gsk_...)"
                style={{
                  width: "100%",
                  padding: "8px 36px 8px 12px",
                  fontSize: "0.78rem",
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <button
                type="button"
                onClick={() => setShowGroqKey(!showGroqKey)}
                style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                {showGroqKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {/* Gemini Key Input */}
            <div style={{ position: "relative" }}>
              <input
                type={showGeminiKey ? "text" : "password"}
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
                placeholder="Paste Gemini API Key (AIza...)"
                style={{
                  width: "100%",
                  padding: "8px 36px 8px 12px",
                  fontSize: "0.78rem",
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                {showGeminiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            <button
              type="submit"
              disabled={savingKeys}
              className="btn-primary"
              style={{ padding: "8px 14px", fontSize: "0.8rem", justifyContent: "center", cursor: "pointer" }}
            >
              <span>{savingKeys ? "Encrypting & Activating..." : "Save & Activate Credentials"}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Admin Testing Playground */}
      <div
        style={{
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Bot size={18} color="#a78bfa" />
          <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff", margin: 0 }}>
            Live Query Simulator &amp; Failover Tester
          </h4>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--text-dim)", margin: 0 }}>
          Test real-time student Q&amp;A directly. See which engine responds, response latency, and failover status.
        </p>

        <form onSubmit={handlePlaygroundSubmit} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              type="text"
              value={playQuery}
              onChange={(e) => setPlayQuery(e.target.value)}
              placeholder="Enter a student question (e.g. 'Explain Deadlock prevention with 4 conditions')..."
              style={{
                flex: 1,
                minWidth: "260px",
                padding: "9px 12px",
                fontSize: "0.82rem",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                background: "rgba(0, 0, 0, 0.3)",
                color: "#fff",
              }}
            />
            <button
              type="submit"
              disabled={playLoading || !playQuery.trim()}
              className="btn-primary"
              style={{ padding: "9px 18px", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              {playLoading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              <span>{playLoading ? "Querying..." : "Send Query"}</span>
            </button>
          </div>
        </form>

        {/* Playground Response Box */}
        {playAnswer && (
          <div
            style={{
              padding: "16px",
              background: "rgba(15, 23, 42, 0.8)",
              borderRadius: "12px",
              border: "1px solid rgba(99, 102, 241, 0.35)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.74rem", flexWrap: "wrap", gap: "6px" }}>
              <span style={{ color: "#38bdf8", fontWeight: 700 }}>
                ⚡ Engine: {playAnswer.provider?.toUpperCase()} ({playAnswer.model})
              </span>
              <div style={{ display: "flex", gap: "8px", color: "var(--text-dim)" }}>
                <span>Latency: {playAnswer.latencyMs}ms</span>
                {playAnswer.failover && <span style={{ color: "#f59e0b" }}>• Failover Active</span>}
                {playAnswer.cached && <span style={{ color: "#34d399" }}>• 0ms Cache Hit</span>}
              </div>
            </div>

            <div style={{ fontSize: "0.82rem", color: "#e2e8f0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {playAnswer.answer}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

