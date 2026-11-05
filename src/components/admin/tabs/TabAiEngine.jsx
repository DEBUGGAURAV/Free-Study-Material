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
  Flame,
  Globe,
  Download,
  FileText,
  Database,
  Search,
  Trash2,
  Users,
  MessageSquare,
  Sliders,
  Save,
  User,
  Eye,
  X,
  Filter,
  ChevronRight,
} from "lucide-react";
import { api } from "../../../api";

export default function TabAiEngine() {
  const [loading, setLoading] = useState(true);
  const [telemetry, setTelemetry] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackType, setFeedbackType] = useState("info"); // 'info' | 'success' | 'error'

  // Testing AI
  const [testingGroq, setTestingGroq] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);
  const [testingCloudflare, setTestingCloudflare] = useState(false);
  const [testingTurso, setTestingTurso] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Student Query Playground
  const [playQuery, setPlayQuery] = useState("");
  const [playContext, setPlayContext] = useState("");
  const [playLoading, setPlayLoading] = useState(false);
  const [playAnswer, setPlayAnswer] = useState(null);

  // Circle to Search Controls (ON/OFF & Limits)
  const [circleLimitInput, setCircleLimitInput] = useState("");
  const [circleCooldownInput, setCircleCooldownInput] = useState("");
  const [savingCircleConfig, setSavingCircleConfig] = useState(false);

  // Cloudflare Workers AI Controls (Limits & State)
  const [cfLimitInput, setCfLimitInput] = useState("");
  const [savingCfConfig, setSavingCfConfig] = useState(false);

  // Telegram Forum Sub-Topics
  const [settingUpTopics, setSettingUpTopics] = useState(false);

  // Turso AI Search Logs & Reports
  const [aiLogs, setAiLogs] = useState([]);
  const [loadingAiLogs, setLoadingAiLogs] = useState(false);
  const [aiSearchFilter, setAiSearchFilter] = useState("");

  // Student-wise AI Search Explorer
  const [searchViewMode, setSearchViewMode] = useState("stream"); // "stream" | "students"
  const [studentsSummary, setStudentsSummary] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentSearchFilter, setStudentSearchFilter] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null); // { userId, userName, userEmail, userMobile }
  const [studentSpecificLogs, setStudentSpecificLogs] = useState([]);
  const [loadingStudentLogs, setLoadingStudentLogs] = useState(false);

  const loadAiLogs = async (search = "") => {
    try {
      setLoadingAiLogs(true);
      const res = await api.getAiRecentSearches({ limit: 50, search });
      if (res && res.success) {
        setAiLogs(res.logs || []);
      }
    } catch (err) {
      console.warn("[AI-ENGINE] Failed to fetch AI logs:", err.message);
    } finally {
      setLoadingAiLogs(false);
    }
  };

  const loadStudentsSummary = async (search = "") => {
    try {
      setLoadingStudents(true);
      const res = await api.getAiStudentsSummary({ limit: 150, search });
      if (res && res.success) {
        setStudentsSummary(res.students || []);
      }
    } catch (err) {
      console.warn("[AI-ENGINE] Failed to fetch AI students summary:", err.message);
    } finally {
      setLoadingStudents(false);
    }
  };

  const loadStudentSpecificLogs = async (student) => {
    if (!student) return;
    try {
      setSelectedStudent(student);
      setLoadingStudentLogs(true);
      const res = await api.getAiRecentSearches({
        limit: 100,
        userId: student.userId || "",
        userEmail: student.userEmail || "",
      });
      if (res && res.success) {
        setStudentSpecificLogs(res.logs || []);
      }
    } catch (err) {
      showNotice("Failed to fetch student searches: " + err.message, "error");
    } finally {
      setLoadingStudentLogs(false);
    }
  };

  const handleSetupTelegramTopics = async () => {
    try {
      setSettingUpTopics(true);
      showNotice("Creating forum sub-topics in FSM Support Supergroup...", "info");
      const res = await api.setupAiTelegramTopics();
      if (res && res.success) {
        showNotice("✅ Telegram forum sub-topics configured successfully!", "success");
        loadTelemetry();
      } else {
        showNotice("Could not create topics: " + (res.message || "Failed"), "error");
      }
    } catch (err) {
      showNotice("Telegram topic creation error: " + err.message, "error");
    } finally {
      setSettingUpTopics(false);
    }
  };

  const handleExportReport = (format = "csv") => {
    const url = api.getAiReportDownloadUrl(format, aiSearchFilter);
    window.open(url, "_blank");
  };

  const handleExportPurgeReport = (format = "excel") => {
    const url = api.getPurgeReportDownloadUrl(format);
    window.open(url, "_blank");
  };

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
    loadAiLogs();
    loadStudentsSummary();
  }, []);

  useEffect(() => {
    if (telemetry?.settings) {
      if (circleLimitInput === "" && telemetry.settings.circleSearchDailyLimit !== undefined) {
        setCircleLimitInput(String(telemetry.settings.circleSearchDailyLimit));
      }
      if (circleCooldownInput === "" && telemetry.settings.circleSearchCooldownSec !== undefined) {
        setCircleCooldownInput(String(telemetry.settings.circleSearchCooldownSec));
      }
      if (cfLimitInput === "" && telemetry.settings.cloudflareAiLimit !== undefined) {
        setCfLimitInput(String(telemetry.settings.cloudflareAiLimit));
      }
    }
  }, [telemetry]);

  const showNotice = (msg, type = "info") => {
    setFeedback(msg);
    setFeedbackType(type);
    setTimeout(() => setFeedback(""), 5000);
  };

  // Toggle Provider
  const handleToggle = async (provider, currentState) => {
    try {
      const nextState = !currentState;
      const label = provider === "circle" ? "CIRCLE TO SEARCH" : provider.toUpperCase();
      showNotice(`Updating ${label} state...`, "info");
      const res = await api.updateAiToggle(provider, nextState);
      if (res && res.success) {
        setTelemetry(res.telemetry);
        showNotice(`✅ ${label} is now ${nextState ? "ACTIVE (ON)" : "PAUSED (OFF)"}!`, "success");
      }
    } catch (err) {
      showNotice("Error toggling engine: " + err.message, "error");
    }
  };

  // Save Circle to Search Limits
  const handleSaveCircleConfig = async (e) => {
    e.preventDefault();
    try {
      setSavingCircleConfig(true);
      const limitVal = parseInt(circleLimitInput, 10);
      const cooldownVal = parseInt(circleCooldownInput, 10);
      if (isNaN(limitVal) || limitVal <= 0) {
        showNotice("Please enter a valid positive number for Daily Circle Limit.", "error");
        return;
      }
      const res = await api.updateCircleSearchConfig({
        dailyLimit: limitVal,
        cooldownSec: isNaN(cooldownVal) ? 3 : Math.max(0, cooldownVal),
      });
      if (res && res.success) {
        setTelemetry(res.telemetry);
        showNotice(`✅ Circle to Search limits updated! Daily Limit: ${limitVal} queries, Cooldown: ${isNaN(cooldownVal) ? 3 : cooldownVal}s`, "success");
      }
    } catch (err) {
      showNotice("Failed to update Circle to Search limits: " + err.message, "error");
    } finally {
      setSavingCircleConfig(false);
    }
  };

  // Save Cloudflare Workers AI Daily Limit
  const handleSaveCfConfig = async (e) => {
    if (e) e.preventDefault();
    try {
      setSavingCfConfig(true);
      const limitVal = parseInt(cfLimitInput, 10);
      if (isNaN(limitVal) || limitVal <= 0) {
        showNotice("Please enter a valid positive number for Daily Cloudflare Limit.", "error");
        return;
      }
      const res = await api.updateCloudflareAiConfig({
        dailyLimit: limitVal,
      });
      if (res && res.success) {
        setTelemetry(res.telemetry);
        showNotice(`✅ Cloudflare Workers AI Daily Limit saved: ${limitVal} requests/day!`, "success");
      }
    } catch (err) {
      showNotice("Error saving Cloudflare limit: " + err.message, "error");
    } finally {
      setSavingCfConfig(false);
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
      if (provider === "cloudflare") setTestingCloudflare(true);
      if (provider === "turso") setTestingTurso(true);
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
      setTestingCloudflare(false);
      setTestingTurso(false);
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
    cloudflareAiUsedToday: 0,
    cloudflareAiRemainingToday: 1000,
    cloudflareAiPercent: 0,
    circleSearchUsedToday: 0,
    circleSearchRemainingToday: 2000,
    circleSearchPercent: 0,
    totalDailyCapacity: 16900,
    totalDailyUsed: 0,
    totalQueriesToday: 0,
    failoversToday: 0,
    cachedHitsToday: 0,
    serverCpuImpact: "0.0%",
  };

  const settings = telemetry?.settings || {
    groqEnabled: true,
    geminiEnabled: true,
    cloudflareAiEnabled: true,
    cloudflareAiLimit: 1000,
    edgeProxyEnabled: true,
    circleSearchEnabled: true,
    circleSearchDailyLimit: 2000,
    circleSearchCooldownSec: 3,
    groqApiKeyConfigured: false,
    geminiApiKeyConfigured: false,
    cloudflareAiConfigured: false,
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
            {(usage.totalDailyCapacity || 16900).toLocaleString()}
            <span style={{ fontSize: "0.8rem", color: "#38bdf8", marginLeft: "4px" }}>RPD</span>
          </div>
          <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "4px" }}>
            Groq (14.4k) + Gemini (1.5k) + Cloudflare ({(settings.cloudflareAiLimit || 1000).toLocaleString()})
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
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <ShieldCheck size={14} color={settings.groqApiKeyConfigured ? "#34d399" : "#fbbf24"} />
              <span style={{ color: "var(--text-dim)" }}>Security: </span>
              <strong style={{ color: settings.groqApiKeyConfigured ? "#34d399" : "#fbbf24" }}>
                {settings.groqApiKeyConfigured ? "🔒 Protected in .env (Zero-Leak)" : "⚠️ Add GROQ_API_KEY in .env"}
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
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <ShieldCheck size={14} color={settings.geminiApiKeyConfigured ? "#38bdf8" : "#fbbf24"} />
              <span style={{ color: "var(--text-dim)" }}>Security: </span>
              <strong style={{ color: settings.geminiApiKeyConfigured ? "#38bdf8" : "#fbbf24" }}>
                {settings.geminiApiKeyConfigured ? "🔒 Protected in .env (Zero-Leak)" : "⚠️ Add GEMINI_API_KEY in .env"}
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

        {/* ============================================================== */}
        {/* 3. Cloudflare Workers AI Card (Tier 2 Native Edge GPU)          */}
        {/* ============================================================== */}
        <div
          style={{
            background: "rgba(15, 23, 42, 0.65)",
            border: settings.cloudflareAiEnabled !== false ? "1px solid rgba(245, 158, 11, 0.35)" : "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "16px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            position: "relative",
            boxShadow: settings.cloudflareAiEnabled !== false ? "0 10px 30px rgba(245, 158, 11, 0.08)" : "none",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "1.2rem" }}>🔥</span>
                <h4 style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", margin: 0 }}>
                  Cloudflare Workers AI (Tier 2 Edge GPU)
                </h4>
                <span
                  style={{
                    fontSize: "0.68rem",
                    padding: "2px 7px",
                    borderRadius: "6px",
                    background: "rgba(245, 158, 11, 0.2)",
                    color: "#fbbf24",
                    fontWeight: 700,
                  }}
                >
                  Model: {settings.cloudflareModel || "@cf/meta/llama-3.1-8b-instruct"}
                </span>
              </div>
              <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", margin: "4px 0 0" }}>
                Zero-egress serverless GPU inference across 330+ global cities. 10,000 Neurons/Day FREE.
              </p>
            </div>

            {/* Toggle Switch */}
            <button
              type="button"
              onClick={() => handleToggle("cloudflare", settings.cloudflareAiEnabled !== false)}
              style={{
                background: settings.cloudflareAiEnabled !== false ? "linear-gradient(135deg, #f59e0b, #d97706)" : "rgba(255, 255, 255, 0.1)",
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
                boxShadow: settings.cloudflareAiEnabled !== false ? "0 2px 10px rgba(245, 158, 11, 0.4)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              <Power size={13} />
              <span>{settings.cloudflareAiEnabled !== false ? "ACTIVE" : "PAUSED"}</span>
            </button>
          </div>

          {/* Usage Meter */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem", marginBottom: "6px" }}>
              <span style={{ color: "var(--text-dim)" }}>Today's Usage Quota:</span>
              <strong style={{ color: "#fbbf24", fontFamily: "var(--font-mono)" }}>
                {usage.cloudflareAiUsedToday || 0} / {(settings.cloudflareAiLimit || 1000).toLocaleString()} ({usage.cloudflareAiPercent || 0}%)
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
                  width: `${Math.min(100, usage.cloudflareAiPercent || 0)}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #f59e0b, #ef4444)",
                  borderRadius: "999px",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "4px" }}>
              <span>Remaining: {(usage.cloudflareAiRemainingToday ?? (settings.cloudflareAiLimit || 1000)).toLocaleString()} requests (~10k Neurons)</span>
              <span>Latency: ~0.3s Native Edge GPU</span>
            </div>
          </div>

          {/* Daily Limit Configuration Input */}
          <form
            onSubmit={handleSaveCfConfig}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "rgba(255, 255, 255, 0.03)",
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid rgba(245, 158, 11, 0.2)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: "200px" }}>
              <Sliders size={14} color="#fbbf24" />
              <label style={{ fontSize: "0.76rem", color: "var(--text-dim)", fontWeight: 600 }}>
                Daily Quota Limit:
              </label>
              <input
                type="number"
                min="10"
                max="50000"
                value={cfLimitInput}
                onChange={(e) => setCfLimitInput(e.target.value)}
                style={{
                  width: "90px",
                  padding: "4px 8px",
                  fontSize: "0.78rem",
                  background: "rgba(0, 0, 0, 0.3)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "6px",
                  color: "#fff",
                  fontFamily: "var(--font-mono)",
                  textAlign: "center",
                }}
              />
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>req/day</span>
            </div>

            <button
              type="submit"
              disabled={savingCfConfig}
              className="btn-primary"
              style={{
                padding: "5px 12px",
                fontSize: "0.74rem",
                borderRadius: "6px",
                cursor: "pointer",
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                border: "none",
                color: "#fff",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <Save size={12} />
              <span>{savingCfConfig ? "Saving..." : "Save Limit"}</span>
            </button>
          </form>

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
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <ShieldCheck size={14} color={settings.cloudflareAiConfigured ? "#34d399" : "#38bdf8"} />
              <span style={{ color: "var(--text-dim)" }}>Routing: </span>
              <strong style={{ color: settings.cloudflareAiConfigured ? "#34d399" : "#38bdf8" }}>
                {settings.cloudflareAiConfigured ? "🔒 REST API + Native Worker (env.AI)" : "⚡ Native Worker Edge Binding (env.AI)"}
              </strong>
            </div>

            <button
              type="button"
              onClick={() => handleTestPing("cloudflare")}
              disabled={testingCloudflare}
              className="btn-secondary"
              style={{ padding: "4px 10px", fontSize: "0.72rem", cursor: "pointer" }}
            >
              <Zap size={11} className={testingCloudflare ? "animate-spin" : ""} />
              <span>{testingCloudflare ? "Pinging..." : "Test Ping"}</span>
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* 4. Turso LibSQL Edge Cache Card (Tier 0 Instant 0ms Saver)       */}
        {/* ============================================================== */}
        <div
          style={{
            background: "rgba(15, 23, 42, 0.65)",
            border: "1px solid rgba(52, 211, 153, 0.35)",
            borderRadius: "16px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            position: "relative",
            boxShadow: "0 10px 30px rgba(52, 211, 153, 0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "1.2rem" }}>⚡</span>
                <h4 style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", margin: 0 }}>
                  Turso LibSQL Edge Cache (0ms Token Saver)
                </h4>
                <span
                  style={{
                    fontSize: "0.68rem",
                    padding: "2px 7px",
                    borderRadius: "6px",
                    background: "rgba(52, 211, 153, 0.2)",
                    color: "#34d399",
                    fontWeight: 700,
                  }}
                >
                  Table: circle_search_cache
                </span>
              </div>
              <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", margin: "4px 0 0" }}>
                Sub-5ms instant delivery for repeat questions. 0 Tokens consumed. 9 Billion read rows/mo FREE.
              </p>
            </div>

            <span
              style={{
                background: "rgba(52, 211, 153, 0.15)",
                color: "#34d399",
                border: "1px solid rgba(52, 211, 153, 0.35)",
                borderRadius: "999px",
                padding: "6px 14px",
                fontSize: "0.78rem",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Database size={13} />
              <span>CACHE ACTIVE</span>
            </span>
          </div>

          {/* Cache Hits & Stats */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem", marginBottom: "6px" }}>
              <span style={{ color: "var(--text-dim)" }}>Today's 0ms Cache Hits:</span>
              <strong style={{ color: "#34d399", fontFamily: "var(--font-mono)" }}>
                {usage.cachedHitsToday || 0} Queries Saved (0 Tokens Burned)
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
                  width: "100%",
                  height: "100%",
                  background: "linear-gradient(90deg, #10b981, #38bdf8)",
                  borderRadius: "999px",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "4px" }}>
              <span>Latency: 0-4ms Sub-second</span>
              <span>TTL: 48h (Pin to Keep Forever)</span>
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
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <ShieldCheck size={14} color="#34d399" />
              <span style={{ color: "var(--text-dim)" }}>Security: </span>
              <strong style={{ color: "#34d399" }}>
                🔒 Dedicated Turso AWS-AP-South-1 Edge Cloud
              </strong>
            </div>

            <button
              type="button"
              onClick={() => handleTestPing("turso")}
              disabled={testingTurso}
              className="btn-secondary"
              style={{ padding: "4px 10px", fontSize: "0.72rem", cursor: "pointer" }}
            >
              <Zap size={11} className={testingTurso ? "animate-spin" : ""} />
              <span>{testingTurso ? "Pinging..." : "Test Ping"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. ⭕ Circle to Search & Solve Controls (ON / OFF & Limits)     */}
      {/* ============================================================== */}
      <div
        style={{
          background: "rgba(15, 23, 42, 0.65)",
          border: settings.circleSearchEnabled ? "1px solid rgba(56, 189, 248, 0.35)" : "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          position: "relative",
          boxShadow: settings.circleSearchEnabled ? "0 10px 30px rgba(56, 189, 248, 0.08)" : "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "1.2rem" }}>⭕</span>
              <h4 style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", margin: 0 }}>
                Circle to Search &amp; Solve Engine (PDFs &amp; Handwritten Notes)
              </h4>
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: settings.circleSearchEnabled ? "rgba(56, 189, 248, 0.2)" : "rgba(255, 255, 255, 0.08)",
                  color: settings.circleSearchEnabled ? "#38bdf8" : "#94a3b8",
                  fontWeight: 700,
                  border: `1px solid ${settings.circleSearchEnabled ? "rgba(56, 189, 248, 0.4)" : "rgba(255, 255, 255, 0.12)"}`,
                }}
              >
                {settings.circleSearchEnabled ? "ONLINE & ACTIVE" : "PAUSED BY ADMIN"}
              </span>
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#34d399",
                  fontWeight: 700,
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                }}
              >
                🕒 48h Vault Auto-Expire
              </span>
            </div>
            <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", margin: "4px 0 0" }}>
              Instant PDF Text extraction ➔ Client Tesseract WASM OCR ➔ Turso L2 / RAM L1 Cache ➔ Groq / Gemini AI step-by-step solver.
            </p>
          </div>

          {/* Master ON / OFF Toggle Switch */}
          <button
            type="button"
            onClick={() => handleToggle("circle", settings.circleSearchEnabled)}
            style={{
              background: settings.circleSearchEnabled
                ? "linear-gradient(135deg, #0284c7, #06b6d4)"
                : "rgba(255, 255, 255, 0.1)",
              color: "#fff",
              border: "none",
              borderRadius: "999px",
              padding: "7px 16px",
              fontSize: "0.78rem",
              fontWeight: 800,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: settings.circleSearchEnabled ? "0 2px 12px rgba(2, 132, 199, 0.45)" : "none",
              transition: "all 0.2s ease",
            }}
            title={settings.circleSearchEnabled ? "Click to Pause Circle to Search" : "Click to Enable Circle to Search"}
          >
            <Power size={13} />
            <span>{settings.circleSearchEnabled ? "ACTIVE (ON)" : "PAUSED (OFF)"}</span>
          </button>
        </div>

        {/* Usage & Quota Meter */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem", marginBottom: "6px" }}>
            <span style={{ color: "var(--text-dim)" }}>Today's Circle Searches:</span>
            <strong style={{ color: "#38bdf8", fontFamily: "var(--font-mono)" }}>
              {usage.circleSearchUsedToday || 0} / {settings.circleSearchDailyLimit || 2000} ({usage.circleSearchPercent || 0}%)
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
                width: `${Math.min(100, usage.circleSearchPercent || 0)}%`,
                height: "100%",
                background: "linear-gradient(90deg, #38bdf8, #818cf8)",
                borderRadius: "999px",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "4px" }}>
            <span>Remaining: {usage.circleSearchRemainingToday || 2000} queries today</span>
            <span>Rate Cooldown: {settings.circleSearchCooldownSec || 3}s per student</span>
          </div>
        </div>

        {/* Limits & Cooldown Controls Form */}
        <form
          onSubmit={handleSaveCircleConfig}
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "12px",
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", flex: 1 }}>
            {/* Daily Limit Input */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "0.72rem", color: "var(--text-dim)", fontWeight: 600 }}>
                Daily Query Limit (All Students):
              </label>
              <input
                type="number"
                min="10"
                max="50000"
                value={circleLimitInput}
                onChange={(e) => setCircleLimitInput(e.target.value)}
                placeholder="2000"
                style={{
                  width: "130px",
                  padding: "6px 10px",
                  fontSize: "0.8rem",
                  background: "rgba(0, 0, 0, 0.3)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  borderRadius: "6px",
                  color: "#fff",
                }}
              />
            </div>

            {/* Cooldown Sec Input */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "0.72rem", color: "var(--text-dim)", fontWeight: 600 }}>
                Student Cooldown (Seconds):
              </label>
              <input
                type="number"
                min="0"
                max="60"
                value={circleCooldownInput}
                onChange={(e) => setCircleCooldownInput(e.target.value)}
                placeholder="3"
                style={{
                  width: "110px",
                  padding: "6px 10px",
                  fontSize: "0.8rem",
                  background: "rgba(0, 0, 0, 0.3)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  borderRadius: "6px",
                  color: "#fff",
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingCircleConfig}
            className="btn-primary"
            style={{
              padding: "7px 16px",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {savingCircleConfig ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            <span>{savingCircleConfig ? "Saving..." : "Save Limit & Cooldown"}</span>
          </button>
        </form>

        {/* Telemetry Architecture Notes */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "8px",
            fontSize: "0.72rem",
            color: "var(--text-dim)",
          }}
        >
          <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
            ⚡ <strong>Turso L2 / RAM L1 Cache:</strong> Repeated questions solve in 0ms without hitting AI API quota.
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
            🕒 <strong>48h TTL Auto-Eviction:</strong> Questions auto-expire in 48h unless pinned in student profile.
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
            📱 <strong>0% Server CPU Impact:</strong> OCR runs completely inside student browser via Tesseract WASM.
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
            When enabled, student AI requests route directly through <strong>Cloudflare Global Edge</strong> (330+ Cities) to Groq/Gemini. 
            Your Node.js Render backend experiences <strong>0 requests, 0 CPU load, and 0 bandwidth usage</strong>.
          </p>

          <div style={{ padding: "8px 12px", background: "rgba(245, 158, 11, 0.08)", borderRadius: "8px", border: "1px solid rgba(245, 158, 11, 0.2)", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.74rem" }}>
              <span style={{ color: "#fbbf24", fontWeight: 700 }}>🔥 Tier 2 Native Edge GPU:</span>
              <span style={{ fontFamily: "var(--font-mono)", color: "#fff", background: "rgba(0,0,0,0.3)", padding: "2px 6px", borderRadius: "4px" }}>@cf/meta/llama-3.1-8b-instruct</span>
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
              Quota: 10,000 Neurons / Day FREE • Runs directly inside Cloudflare Data Center (Zero Network Egress)
            </div>
          </div>

          <div style={{ fontSize: "0.72rem", color: "#64748b", fontFamily: "var(--font-mono)" }}>
            Router: edge-worker/aiProxyWorker.js ➔ Groq LPU ➔ Cloudflare AI ➔ Gemini ➔ Turso Cache
          </div>
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

      {/* 5. Telegram Support Supergroup Sub-Topics */}
      <div
        className="card-cyber"
        style={{
          padding: "22px",
          background: "rgba(15, 23, 42, 0.75)",
          border: "1px solid rgba(56, 189, 248, 0.25)",
          borderRadius: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "rgba(56, 189, 248, 0.15)",
                border: "1px solid rgba(56, 189, 248, 0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#38bdf8",
              }}
            >
              <MessageSquare size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: "1.02rem", fontWeight: 700, margin: 0, color: "#f8fafc" }}>
                Telegram Support Supergroup Sub-Topics
              </h3>
              <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", margin: "2px 0 0 0" }}>
                Two dedicated forum topics in FSM Support Supergroup for real-time AI student searches & account purge audits
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSetupTelegramTopics}
            disabled={settingUpTopics}
            className="btn-primary"
            style={{
              padding: "7px 16px",
              fontSize: "0.8rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {settingUpTopics ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
            <span>{settingUpTopics ? "Configuring Topics..." : "⚡ Setup Support Topics"}</span>
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px", marginTop: "4px" }}>
          {/* Sub-Topic A */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "12px",
              background: "rgba(6, 182, 212, 0.08)",
              border: "1px solid rgba(6, 182, 212, 0.25)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.86rem", fontWeight: 700, color: "#38bdf8" }}>
                🤖 Sub-Topic 1: AI Search Logs & Student Queries
              </span>
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  fontWeight: 700,
                  background: telemetry?.settings?.aiSearchTopicId ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                  color: telemetry?.settings?.aiSearchTopicId ? "#34d399" : "#fbbf24",
                  border: `1px solid ${telemetry?.settings?.aiSearchTopicId ? "rgba(16, 185, 129, 0.4)" : "rgba(245, 158, 11, 0.4)"}`,
                }}
              >
                {telemetry?.settings?.aiSearchTopicId ? `Thread #${telemetry.settings.aiSearchTopicId}` : "Not Created"}
              </span>
            </div>
            <p style={{ fontSize: "0.74rem", color: "var(--text-dim)", margin: 0 }}>
              Live stream of student questions, student identity (Name, Email, Mobile), engine latency, and lecture note context.
            </p>
          </div>

          {/* Sub-Topic B */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "12px",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.86rem", fontWeight: 700, color: "#f87171" }}>
                🔥 Sub-Topic 2: Firebase & Turso Purge Logs
              </span>
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  fontWeight: 700,
                  background: telemetry?.settings?.purgeAuditTopicId ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                  color: telemetry?.settings?.purgeAuditTopicId ? "#34d399" : "#fbbf24",
                  border: `1px solid ${telemetry?.settings?.purgeAuditTopicId ? "rgba(16, 185, 129, 0.4)" : "rgba(245, 158, 11, 0.4)"}`,
                }}
              >
                {telemetry?.settings?.purgeAuditTopicId ? `Thread #${telemetry.settings.purgeAuditTopicId}` : "Not Created"}
              </span>
            </div>
            <p style={{ fontSize: "0.74rem", color: "var(--text-dim)", margin: 0 }}>
              Audit dossier sent whenever a user is deleted from Firebase Firestore, confirming Turso AI rows and data purge.
            </p>
            <div style={{ display: "flex", gap: "8px", marginTop: "4px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => handleExportPurgeReport("excel")}
                className="btn-secondary"
                style={{
                  padding: "5px 10px",
                  fontSize: "0.74rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid rgba(16, 185, 129, 0.35)",
                  color: "#34d399",
                }}
                title="Download full Cascade Account Purge History as Excel (.csv)"
              >
                <Download size={12} />
                <span>Excel Purge History</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportPurgeReport("pdf")}
                className="btn-secondary"
                style={{
                  padding: "5px 10px",
                  fontSize: "0.74rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  color: "#f87171",
                }}
                title="Download formatted Cascade Account Purge Dossier as PDF (.pdf)"
              >
                <FileText size={12} />
                <span>PDF Purge Dossier</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Turso AI Search Logs & Report Generator */}
      <div
        className="card-cyber"
        style={{
          padding: "22px",
          background: "rgba(15, 23, 42, 0.75)",
          border: "1px solid rgba(99, 102, 241, 0.25)",
          borderRadius: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "rgba(99, 102, 241, 0.15)",
                border: "1px solid rgba(99, 102, 241, 0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#818cf8",
              }}
            >
              <Database size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: "1.02rem", fontWeight: 700, margin: 0, color: "#f8fafc" }}>
                AI Search Logs & Reports (Turso Edge Database)
              </h3>
              <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", margin: "2px 0 0 0" }}>
                Persistent search logs stored in LibSQL. Auto-purged if student account is deleted from Firebase.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => handleExportReport("excel")}
              className="btn-secondary"
              style={{
                padding: "7px 14px",
                fontSize: "0.78rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.35)",
                color: "#34d399",
              }}
              title="Download AI Search Query History in Microsoft Excel (.csv)"
            >
              <Download size={14} />
              <span>Excel (.csv)</span>
            </button>
            <button
              type="button"
              onClick={() => handleExportReport("pdf")}
              className="btn-secondary"
              style={{
                padding: "7px 14px",
                fontSize: "0.78rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.35)",
                color: "#f87171",
              }}
              title="Download branded AI Search Query History Report as PDF (.pdf)"
            >
              <FileText size={14} />
              <span>PDF Report (.pdf)</span>
            </button>
            <button
              type="button"
              onClick={() => handleExportReport("json")}
              className="btn-secondary"
              style={{
                padding: "7px 14px",
                fontSize: "0.78rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(56, 189, 248, 0.15)",
                border: "1px solid rgba(56, 189, 248, 0.35)",
                color: "#38bdf8",
              }}
            >
              <FileText size={14} />
              <span>JSON</span>
            </button>
            <button
              type="button"
              onClick={() => loadAiLogs(aiSearchFilter)}
              disabled={loadingAiLogs}
              className="btn-secondary"
              style={{ padding: "7px 12px", fontSize: "0.78rem" }}
              title="Refresh logs"
            >
              <RefreshCw size={14} className={loadingAiLogs ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* View Mode Switcher: All Stream vs Student-Wise Explorer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", gap: "8px", background: "rgba(0, 0, 0, 0.3)", padding: "4px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <button
              type="button"
              onClick={() => {
                setSearchViewMode("stream");
                setSelectedStudent(null);
              }}
              style={{
                background: searchViewMode === "stream" && !selectedStudent ? "linear-gradient(135deg, #0284c7, #06b6d4)" : "transparent",
                color: searchViewMode === "stream" && !selectedStudent ? "#fff" : "var(--text-dim)",
                border: "none",
                borderRadius: "8px",
                padding: "6px 14px",
                fontSize: "0.78rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.2s ease",
              }}
            >
              <Activity size={14} />
              <span>All Searches Stream ({aiLogs.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchViewMode("students");
                setSelectedStudent(null);
                loadStudentsSummary(studentSearchFilter);
              }}
              style={{
                background: searchViewMode === "students" || selectedStudent ? "linear-gradient(135deg, #8b5cf6, #6366f1)" : "transparent",
                color: searchViewMode === "students" || selectedStudent ? "#fff" : "var(--text-dim)",
                border: "none",
                borderRadius: "8px",
                padding: "6px 14px",
                fontSize: "0.78rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.2s ease",
              }}
            >
              <Users size={14} />
              <span>Student-Wise Explorer ({studentsSummary.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              loadAiLogs(aiSearchFilter);
              loadStudentsSummary(studentSearchFilter);
              if (selectedStudent) loadStudentSpecificLogs(selectedStudent);
            }}
            disabled={loadingAiLogs || loadingStudents || loadingStudentLogs}
            className="btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.76rem" }}
            title="Refresh logs & students"
          >
            <RefreshCw size={13} className={(loadingAiLogs || loadingStudents || loadingStudentLogs) ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>

        {/* ============================================================== */}
        {/* 1. DEDICATED STUDENT DOSSIER VIEW (When a student is inspected) */}
        {/* ============================================================== */}
        {selectedStudent && (
          <div
            style={{
              background: "rgba(139, 92, 246, 0.08)",
              border: "1px solid rgba(139, 92, 246, 0.35)",
              borderRadius: "14px",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              boxShadow: "0 8px 24px rgba(139, 92, 246, 0.12)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <User size={18} color="#a78bfa" />
                  <h4 style={{ fontSize: "1.05rem", fontWeight: 800, color: "#fff", margin: 0 }}>
                    {selectedStudent.userName || "Student Scholar"}
                  </h4>
                  <span
                    style={{
                      background: "rgba(139, 92, 246, 0.25)",
                      color: "#c4b5fd",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                    }}
                  >
                    {studentSpecificLogs.length} Questions Asked
                  </span>
                </div>
                <div style={{ display: "flex", gap: "14px", fontSize: "0.76rem", color: "var(--text-dim)", marginTop: "4px", flexWrap: "wrap" }}>
                  <span>📧 <code>{selectedStudent.userEmail || "anonymous"}</code></span>
                  {selectedStudent.userMobile && <span>📱 <code>{selectedStudent.userMobile}</code></span>}
                  {selectedStudent.userId && <span>🆔 <code>{selectedStudent.userId}</code></span>}
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setSelectedStudent(null)}
                  className="btn-secondary"
                  style={{
                    padding: "6px 14px",
                    fontSize: "0.76rem",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    background: "rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <X size={13} />
                  <span>Close Dossier</span>
                </button>
              </div>
            </div>

            {/* Student Specific Logs Table */}
            <div style={{ overflowX: "auto", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.08)", background: "rgba(0,0,0,0.25)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "rgba(255, 255, 255, 0.04)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", color: "var(--text-dim)" }}>
                    <th style={{ padding: "8px 12px" }}>Time (UTC)</th>
                    <th style={{ padding: "8px 12px" }}>Student Query / Circled Formula</th>
                    <th style={{ padding: "8px 12px" }}>Engine & Model</th>
                    <th style={{ padding: "8px 12px" }}>Latency</th>
                    <th style={{ padding: "8px 12px" }}>Document Context</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingStudentLogs ? (
                    <tr>
                      <td colSpan={5} style={{ padding: "24px", textAlign: "center", color: "var(--text-dim)" }}>
                        <RefreshCw size={16} className="animate-spin" style={{ margin: "0 auto 6px auto", display: "block" }} />
                        Loading student query history...
                      </td>
                    </tr>
                  ) : studentSpecificLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: "24px", textAlign: "center", color: "var(--text-dim)" }}>
                        No searches recorded for this student yet.
                      </td>
                    </tr>
                  ) : (
                    studentSpecificLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                          {log.createdAt ? log.createdAt.replace("T", " ").slice(0, 19) : "Just now"}
                        </td>
                        <td style={{ padding: "8px 12px", maxWidth: "420px" }}>
                          <div style={{ color: "#e2e8f0", wordBreak: "break-word", fontWeight: 500 }}>{log.query}</div>
                        </td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontSize: "0.68rem",
                              fontWeight: 700,
                              background: log.provider === "groq" ? "rgba(249, 115, 22, 0.15)" : log.provider === "gemini" ? "rgba(99, 102, 241, 0.15)" : (log.provider?.includes("cloudflare") ? "rgba(245, 158, 11, 0.15)" : "rgba(16, 185, 129, 0.15)"),
                              color: log.provider === "groq" ? "#fb923c" : log.provider === "gemini" ? "#818cf8" : (log.provider?.includes("cloudflare") ? "#fbbf24" : "#34d399"),
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                            }}
                          >
                            {String(log.provider).toUpperCase()} ({log.model || "Default"})
                          </span>
                        </td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                          {log.cached ? <span style={{ color: "#34d399" }}>0ms (cache)</span> : `${log.latencyMs || 0}ms`}
                        </td>
                        <td style={{ padding: "8px 12px", maxWidth: "160px", color: "var(--text-dim)", fontSize: "0.72rem" }}>
                          {log.noteTitle ? <span title={log.noteTitle}>📄 {log.noteTitle.slice(0, 24)}...</span> : "General"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 2. STUDENT-WISE DIRECTORY VIEW (List of all students)           */}
        {/* ============================================================== */}
        {!selectedStudent && searchViewMode === "students" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Student Search Bar */}
            <div style={{ display: "flex", gap: "8px" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <Search size={14} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
                <input
                  type="text"
                  value={studentSearchFilter}
                  onChange={(e) => setStudentSearchFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") loadStudentsSummary(studentSearchFilter);
                  }}
                  placeholder="Search student by name, email, or mobile number..."
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 34px",
                    fontSize: "0.8rem",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    background: "rgba(0, 0, 0, 0.25)",
                    color: "#fff",
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => loadStudentsSummary(studentSearchFilter)}
                className="btn-primary"
                style={{ padding: "8px 16px", fontSize: "0.8rem" }}
              >
                Search Students
              </button>
            </div>

            {/* Students Table */}
            <div style={{ overflowX: "auto", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "rgba(255, 255, 255, 0.04)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", color: "var(--text-dim)" }}>
                    <th style={{ padding: "10px 12px" }}>Student Profile</th>
                    <th style={{ padding: "10px 12px" }}>Contact Info</th>
                    <th style={{ padding: "10px 12px" }}>Total Queries</th>
                    <th style={{ padding: "10px 12px" }}>0ms Cache Saved</th>
                    <th style={{ padding: "10px 12px" }}>Engines Used</th>
                    <th style={{ padding: "10px 12px" }}>Last Search</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingStudents ? (
                    <tr>
                      <td colSpan={7} style={{ padding: "30px", textAlign: "center", color: "var(--text-dim)" }}>
                        <RefreshCw size={18} className="animate-spin" style={{ margin: "0 auto 8px auto", display: "block" }} />
                        Loading student directory...
                      </td>
                    </tr>
                  ) : studentsSummary.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: "30px", textAlign: "center", color: "var(--text-dim)" }}>
                        No students have queried AI yet. When students use Circle to Search or Ask AI, their profiles will appear here.
                      </td>
                    </tr>
                  ) : (
                    studentsSummary.map((st, idx) => (
                      <tr
                        key={st.studentKey || idx}
                        style={{
                          borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                          transition: "background 0.15s ease",
                        }}
                      >
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontWeight: 700, color: "#f8fafc", display: "flex", alignItems: "center", gap: "6px" }}>
                            <User size={14} color="#38bdf8" />
                            <span>{st.userName || "Student Scholar"}</span>
                          </div>
                          {st.userId && <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>ID: {st.userId}</div>}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontSize: "0.72rem", color: "#e2e8f0" }}>{st.userEmail || "anonymous"}</div>
                          {st.userMobile && <div style={{ fontSize: "0.68rem", color: "#34d399" }}>📱 {st.userMobile}</div>}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <strong style={{ color: "#38bdf8", fontSize: "0.85rem" }}>{st.totalQueries}</strong> searches
                        </td>
                        <td style={{ padding: "10px 12px", color: "#34d399" }}>
                          {st.cachedQueries > 0 ? `🎯 ${st.cachedQueries} (0ms)` : "0"}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                            {String(st.enginesUsed || "groq").split(",").map((eng, eIdx) => (
                              <span
                                key={eIdx}
                                style={{
                                  fontSize: "0.65rem",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background: "rgba(255, 255, 255, 0.06)",
                                  color: "#94a3b8",
                                  fontWeight: 600,
                                }}
                              >
                                {eng.trim().toUpperCase()}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                          {st.lastSearchAt ? st.lastSearchAt.replace("T", " ").slice(0, 16) : "N/A"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => loadStudentSpecificLogs(st)}
                            className="btn-primary"
                            style={{
                              padding: "4px 12px",
                              fontSize: "0.74rem",
                              borderRadius: "6px",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
                            }}
                          >
                            <Eye size={12} />
                            <span>View Searches ({st.totalQueries})</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 3. ALL SEARCHES STREAM TABLE (With inline View Searches button) */}
        {/* ============================================================== */}
        {!selectedStudent && searchViewMode === "stream" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Search Bar Filter */}
            <div style={{ display: "flex", gap: "8px" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <Search size={14} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
                <input
                  type="text"
                  value={aiSearchFilter}
                  onChange={(e) => setAiSearchFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") loadAiLogs(aiSearchFilter);
                  }}
                  placeholder="Search by student name, email, query keyword, or note title..."
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 34px",
                    fontSize: "0.8rem",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    background: "rgba(0, 0, 0, 0.25)",
                    color: "#fff",
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => loadAiLogs(aiSearchFilter)}
                className="btn-primary"
                style={{ padding: "8px 16px", fontSize: "0.8rem" }}
              >
                Search
              </button>
            </div>

            {/* Turso AI Logs Table */}
            <div style={{ overflowX: "auto", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "rgba(255, 255, 255, 0.04)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", color: "var(--text-dim)" }}>
                    <th style={{ padding: "10px 12px" }}>Time (UTC)</th>
                    <th style={{ padding: "10px 12px" }}>Student Details</th>
                    <th style={{ padding: "10px 12px" }}>Query / Question</th>
                    <th style={{ padding: "10px 12px" }}>Engine & Model</th>
                    <th style={{ padding: "10px 12px" }}>Latency</th>
                    <th style={{ padding: "10px 12px" }}>Doc Context</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAiLogs ? (
                    <tr>
                      <td colSpan={6} style={{ padding: "30px", textAlign: "center", color: "var(--text-dim)" }}>
                        <RefreshCw size={18} className="animate-spin" style={{ margin: "0 auto 8px auto", display: "block" }} />
                        Loading Turso search logs...
                      </td>
                    </tr>
                  ) : aiLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: "30px", textAlign: "center", color: "var(--text-dim)" }}>
                        No AI search logs found in Turso table. Student searches will appear here in real-time.
                      </td>
                    </tr>
                  ) : (
                    aiLogs.map((log) => (
                      <tr
                        key={log.id}
                        style={{
                          borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                          transition: "background 0.15s ease",
                        }}
                      >
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                          {log.createdAt ? log.createdAt.replace("T", " ").slice(0, 19) : "Just now"}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            <div style={{ fontWeight: 600, color: "#f8fafc" }}>{log.userName || "Student"}</div>
                            <button
                              type="button"
                              onClick={() => {
                                loadStudentSpecificLogs({
                                  userId: log.userId,
                                  userName: log.userName,
                                  userEmail: log.userEmail,
                                  userMobile: log.userMobile,
                                });
                              }}
                              title="Inspect this student's full search history"
                              style={{
                                background: "rgba(139, 92, 246, 0.15)",
                                border: "1px solid rgba(139, 92, 246, 0.35)",
                                color: "#c4b5fd",
                                borderRadius: "6px",
                                padding: "2px 7px",
                                fontSize: "0.68rem",
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                              }}
                            >
                              <Eye size={10} />
                              <span>View Searches</span>
                            </button>
                          </div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>{log.userEmail || "anonymous"}</div>
                          {log.userMobile && <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>📱 {log.userMobile}</div>}
                        </td>
                        <td style={{ padding: "10px 12px", maxWidth: "300px" }}>
                          <div style={{ color: "#e2e8f0", wordBreak: "break-word" }}>{log.query}</div>
                        </td>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontSize: "0.68rem",
                              fontWeight: 700,
                              background: log.provider === "groq" ? "rgba(249, 115, 22, 0.15)" : log.provider === "gemini" ? "rgba(99, 102, 241, 0.15)" : (log.provider?.includes("cloudflare") ? "rgba(245, 158, 11, 0.15)" : "rgba(16, 185, 129, 0.15)"),
                              color: log.provider === "groq" ? "#fb923c" : log.provider === "gemini" ? "#818cf8" : (log.provider?.includes("cloudflare") ? "#fbbf24" : "#34d399"),
                              border: `1px solid ${log.provider === "groq" ? "rgba(249, 115, 22, 0.35)" : log.provider === "gemini" ? "rgba(99, 102, 241, 0.35)" : "rgba(16, 185, 129, 0.35)"}`,
                            }}
                          >
                            {String(log.provider).toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                          {log.cached ? <span style={{ color: "#34d399" }}>0ms (cache)</span> : `${log.latencyMs || 0}ms`}
                        </td>
                        <td style={{ padding: "10px 12px", maxWidth: "160px", color: "var(--text-dim)", fontSize: "0.72rem" }}>
                          {log.noteTitle ? <span title={log.noteTitle}>📄 {log.noteTitle.slice(0, 24)}...</span> : "General"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

