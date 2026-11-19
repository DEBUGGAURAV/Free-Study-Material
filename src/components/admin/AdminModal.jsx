import { useState, useEffect, useRef, lazy, Suspense } from "react";
import {
  X, Shield, UserCheck, ChevronLeft, ChevronRight, Save, RefreshCw, Cpu, Globe,
  Download, Upload, Zap, ShieldCheck, ShieldAlert, Power, Wifi, Sliders, Lock,
  LayoutGrid, Search, ChevronDown, BookOpen, Users, HelpCircle, Bell, Server,
  Rocket, Activity, Database, RotateCcw, MessageSquare, Bot, Sparkles,
  AlertTriangle
} from "lucide-react";
import { api, getAuthToken } from "../../api";
import { BACKEND_CLUSTER_URLS } from "../../config/clientConfig";
import { getNotePdfFileName } from "../../utils/formatUtils";
import { DEFAULT_TECH_SETTINGS } from "../../utils/hardwareAdaptiveEngine";

const VirtualPdfReader = lazy(() => import("../VirtualPdfReader"));
import AdminSubModal from "./AdminSubModal";

// Modular Tab Components (Code-split via React.lazy for faster Admin Studio startup)
const TabNotes = lazy(() => import("./tabs/TabNotes"));
const TabStudents = lazy(() => import("./tabs/TabStudents"));
const TabHardware = lazy(() => import("./tabs/TabHardware"));
const TabSoftware = lazy(() => import("./tabs/TabSoftware"));
const TabPipeline = lazy(() => import("./tabs/TabPipeline"));
const TabPerformance = lazy(() => import("./tabs/TabPerformance"));
const TabDatabase = lazy(() => import("./tabs/TabDatabase"));
const TabRestoreVault = lazy(() => import("./tabs/TabRestoreVault"));
const TabSecurityBot = lazy(() => import("./tabs/TabSecurityBot"));
const TabTechNexus = lazy(() => import("./tabs/TabTechNexus"));
const TabCommunityChat = lazy(() => import("./tabs/TabCommunityChat"));
const TabTurso = lazy(() => import("./tabs/TabTurso"));
const TabActivities = lazy(() => import("./tabs/TabActivities"));
const TabHelpDesk = lazy(() => import("./tabs/TabHelpDesk"));
const TabWebSecurity = lazy(() => import("./tabs/TabWebSecurity"));
const TabNotices = lazy(() => import("./tabs/TabNotices"));
const TabAiEngine = lazy(() => import("./tabs/TabAiEngine"));

function AdminModuleFallback({ label = "Loading module telemetry..." }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "14px",
        padding: "64px 20px",
        color: "#475569",
        fontSize: "0.88rem",
        fontWeight: 600,
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "14px",
          background: "#f1f5f9",
          border: "1.5px solid #cbd5e1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)",
        }}
      >
        <RefreshCw size={22} className="spin" style={{ color: "#2563eb" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", textAlign: "center" }}>
        <span style={{ color: "#0f172a", fontWeight: 750, fontSize: "0.95rem" }}>{label}</span>
        <span style={{ fontSize: "0.76rem", color: "#64748b" }}>Streaming secure telemetry from edge cluster...</span>
      </div>
    </div>
  );
}


function AdminStatCard({ label, badge, badgeBg, badgeColor, val, valColor = "#0f172a", subVal, icon: Icon, iconBg, iconBorder, iconColor }) {
  return (
    <div className="adm-stat-card">
      <div>
        <div className="adm-stat-meta">
          <span className="adm-stat-label">{label}</span>
          {badge && <span className="adm-stat-badge" style={{ background: badgeBg, color: badgeColor }}>{badge}</span>}
        </div>
        <div className="adm-stat-val" style={{ color: valColor }}>{val}</div>
        {subVal && <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: "2px", fontWeight: 600 }}>{subVal}</div>}
      </div>
      <div className="adm-stat-icon-wrap" style={{ background: iconBg, border: `1.5px solid ${iconBorder}`, color: iconColor }}>
        <Icon size={18} />
      </div>
    </div>
  );
}

export default function AdminModal({
  isOpen,
  onClose,
  currentUser,
  onLoginSuccess,
  notes = [],
  onRefreshNotes,
  onDeleteNote,
  branches = [],
  allowNotesDownload,
  onToggleDownloadAllowed,
  onToggleNoteDownload,
  maintenanceState,
  onMaintenanceChange,
}) {
  const [activeTab, setActiveTab] = useState("notes");
  const [showKpis, setShowKpis] = useState(() => typeof window !== "undefined" && window.innerWidth > 768);
  const [deletedNoteIds, setDeletedNoteIds] = useState(new Set());
  const isHalfAdmin = currentUser?.role === "half_admin";

  // 📥 1-Click Offline Catalog Backup (100% Client-Side, 0 Server Load)
  const handleExportJsonBackup = () => {
    try {
      const backupData = {
        exportedAt: new Date().toISOString(),
        exportedBy: currentUser?.email || "admin",
        totalNotes: notes.length,
        catalog: notes,
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `academic-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn("Failed to export backup", e);
    }
  };

  const restoreFileInputRef = useRef(null);
  const [jsonImporting, setJsonImporting] = useState(false);

  // 📤 Restore / Import Notes Catalog from offline JSON backup
  const handleImportJsonBackup = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setJsonImporting(true);
      const text = await file.text();
      const data = JSON.parse(text);
      const notesList = Array.isArray(data?.catalog)
        ? data.catalog
        : Array.isArray(data?.notes)
        ? data.notes
        : Array.isArray(data)
        ? data
        : null;

      if (!notesList || notesList.length === 0) {
        alert("Invalid backup file: No notes catalog array found in JSON.");
        return;
      }

      if (!window.confirm(`📥 Restore ${notesList.length} notes from JSON backup "${file.name}" into live database?`)) {
        return;
      }

      const res = await api.importNotesJsonBackup(data);
      alert(res.message || `Successfully restored ${res.count || notesList.length} notes!`);
      if (onRefreshNotes) onRefreshNotes();
      window.dispatchEvent(new CustomEvent("fsm:notes-updated"));
      loadDatabaseOverview();
    } catch (err) {
      alert("Failed to restore from JSON backup: " + err.message);
    } finally {
      setJsonImporting(false);
      if (restoreFileInputRef.current) restoreFileInputRef.current.value = "";
    }
  };

  // Platform Maintenance Mode State (Declared before DASHBOARD_TABS)
  const [maintenanceMode, setMaintenanceMode] = useState(maintenanceState?.active || false);
  const [maintenanceTitle, setMaintenanceTitle] = useState(maintenanceState?.title || "Scheduled System Upgrade in Progress");
  const [maintenanceMessage, setMaintenanceMessage] = useState(maintenanceState?.message || "We are currently performing scheduled platform upgrades. Free Study Material will be back online shortly!");
  const [maintenanceEstimatedEnd, setMaintenanceEstimatedEnd] = useState(maintenanceState?.estimatedEnd || "15 minutes");
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceFeedback, setMaintenanceFeedback] = useState("");

  // Dashboard Modules Catalog (Clean, Unnumbered & Grouped by Function with Dedicated Lucide Vector Icons)
  const DASHBOARD_TABS = [
    { id: "notes", group: "Core Workspace", accent: "#38bdf8", icon: BookOpen, label: "Notes Vault", title: "Notes Vault & Academic Catalog", desc: "Manage study materials, syllabus units, OCR tags & student access permissions" },
    { id: "students", group: "Core Workspace", accent: "#818cf8", icon: Users, label: "Student Registry", title: "Student Registry & Directory", desc: "Directory of enrolled learners, academic branches, verification & roles" },
    { id: "help_desk", group: "Core Workspace", accent: "#34d399", icon: HelpCircle, label: "Support Desk", title: "Help & Support Tickets Desk", desc: "Resolve student inquiries, exam help queries & academic feedback" },
    { id: "notices_board", group: "Core Workspace", accent: "#fbbf24", icon: Bell, label: "Notice Board & Alerts", title: "Global Notice Board & Broadcast Studio", desc: "Publish priority announcements, exam schedules & real-time student alerts" },
    { id: "hardware", group: "Cloud & Infra", accent: "#2dd4bf", icon: Server, label: "Server Hardware", title: "Server Hardware & Core Telemetry", desc: "CPU load, RAM allocation, core temperature & virtualization metrics" },
    { id: "software", group: "Cloud & Infra", accent: "#60a5fa", icon: Sliders, label: maintenanceMode ? "Software & Maint. (PAUSED)" : "Software & Maintenance", title: "Software Infrastructure & Server Maintenance", desc: "Control live platform upgrades, runtime dependencies & maintenance locks" },
    { id: "pipeline", group: "Cloud & Infra", accent: "#22d3ee", icon: Rocket, label: "Upload Pipeline", title: "Upload Pipeline & Document Processing", desc: "Multi-stage upload queues, PDF compression, OCR extraction & CDN mirrors" },
    { id: "performance", group: "Cloud & Infra", accent: "#facc15", icon: Activity, label: "CDN & Performance", title: "Edge CDN & Acceleration Network", desc: "Global edge hit ratio, bandwidth offload, cache TTL & Cloudflare workers" },
    { id: "database", group: "Data & Realtime", accent: "#38bdf8", icon: Database, label: isHalfAdmin ? "Database (Restricted)" : "Database Studio", title: "Database Studio & Collections Inspector", desc: "Direct collection inspector, record viewer, retention policies & indexes" },
    { id: "turso", group: "Data & Realtime", accent: "#06b6d4", icon: Zap, label: "Turso Database", title: "Turso LibSQL Edge Database", desc: "Sub-5ms SQLite edge replicas, sync logs & distributed query engine" },
    { id: "recycle_bin", group: "Data & Realtime", accent: "#fbbf24", icon: RotateCcw, label: "Restore Vault", title: "Restore Vault & Recycle Bin", desc: "Restore deleted study materials, undo mistakes & purge expired documents" },
    { id: "community_chat", group: "Data & Realtime", accent: "#10b981", icon: MessageSquare, label: "Community Chat", title: "Live Community Chat & Moderation Hub", desc: "Monitor real-time study discussions, active peers & chatroom telemetry" },
    { id: "security_bot", group: "Security & AI", accent: "#c084fc", icon: Bot, label: "Security Bot", title: "AI Sentinel & Security Bot Controls", desc: "Telegram bridge alerts, rate-limit enforcement & bot countermeasures" },
    { id: "web_security", group: "Security & AI", accent: "#f43f5e", icon: ShieldAlert, label: "Web Security & IP Jail", title: "Real-Time Web Security & IP Jail Defense Hub", desc: "Live threat defense, IP quarantine jail, DDoS mitigation & strike logs" },
    { id: "tech_nexus", group: "Security & AI", accent: "#ec4899", icon: Sparkles, label: maintenanceMode ? "Tech Nexus (PAUSED)" : "Next-Gen Tech", title: "Next-Gen Tech Nexus", desc: "Toggle WebRTC P2P Mesh, Mermaid diagrams, Canvas Cards & VAPID Push" },
    { id: "ai_engine", group: "Security & AI", accent: "#a78bfa", icon: Cpu, label: "AI Studio (Groq / Gemini)", title: "AI Studio (Groq LPU + Gemini 2.0 Failover)", desc: "Configure LLM failover, API keys, student quiz prompts & tokens quota" },
  ];

  const [quickJumpOpen, setQuickJumpOpen] = useState(false);
  const [quickJumpQuery, setQuickJumpQuery] = useState("");
  const tabButtonRefs = useRef({});
  const quickJumpInputRef = useRef(null);

  const MASTER_ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase();
  const isMasterAdminUser = (u) => {
    if (!u) return false;
    if (u.isMainAdmin || u.isMasterAdmin) return true;
    if (MASTER_ADMIN_EMAIL && u.email && u.email.toLowerCase() === MASTER_ADMIN_EMAIL) return true;
    return false;
  };
  const isMasterAdmin = isMasterAdminUser(currentUser);
  const userAllowedTabs = Array.isArray(currentUser?.allowedTabs) && currentUser.allowedTabs.length > 0 ? currentUser.allowedTabs : null;
  const VISIBLE_TABS = (!isMasterAdmin && userAllowedTabs)
    ? DASHBOARD_TABS.filter((t) => userAllowedTabs.includes(t.id))
    : DASHBOARD_TABS;

  const currentTabIndex = VISIBLE_TABS.findIndex((t) => t.id === activeTab);
  const slideNext = () => {
    const nextIdx = currentTabIndex === -1 ? 0 : (currentTabIndex + 1) % VISIBLE_TABS.length;
    selectAdminTab(VISIBLE_TABS[nextIdx].id);
  };
  const slidePrev = () => {
    const prevIdx = currentTabIndex === -1 ? 0 : (currentTabIndex - 1 + VISIBLE_TABS.length) % VISIBLE_TABS.length;
    selectAdminTab(VISIBLE_TABS[prevIdx].id);
  };

  useEffect(() => {
    if (!isOpen) {
      setQuickJumpOpen(false);
      return;
    }
    const activeEl = tabButtonRefs.current[activeTab];
    if (activeEl && typeof activeEl.scrollIntoView === "function") {
      activeEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (quickJumpOpen) {
      const timer = setTimeout(() => quickJumpInputRef.current?.focus(), 40);
      return () => clearTimeout(timer);
    }
  }, [quickJumpOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuickJumpOpen((prev) => !prev);
        return;
      }
      if (e.key === "Escape" && quickJumpOpen) {
        e.stopPropagation();
        setQuickJumpOpen(false);
        return;
      }
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName)) return;
      if (e.key === "/") {
        e.preventDefault();
        setQuickJumpOpen(true);
        return;
      }
      if (e.key === "ArrowRight") slideNext();
      if (e.key === "ArrowLeft") slidePrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentTabIndex, quickJumpOpen]);

  // Global KPIs & Telemetry
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);

  // Search & Filters
  const [adminNoteSearch, setAdminNoteSearch] = useState("");
  const [noteOverrides, setNoteOverrides] = useState({});
  const [currentAllowNotesDownload, setCurrentAllowNotesDownload] = useState(allowNotesDownload !== false);
  const [downloadGateLoading, setDownloadGateLoading] = useState(false);

  useEffect(() => {
    setCurrentAllowNotesDownload(allowNotesDownload !== false);
  }, [allowNotesDownload]);

  // CDN & Performance
  const [cdnStats, setCdnStats] = useState(null);
  const [retentionDays, setRetentionDays] = useState(7);
  const [cdnFiles, setCdnFiles] = useState([]);
  const [ssdDiskStats, setSsdDiskStats] = useState(null);
  const [manualNoteIdToPurge, setManualNoteIdToPurge] = useState("");
  const [cdnFilesLoading, setCdnFilesLoading] = useState(false);
  const [cdnSearch, setCdnSearch] = useState("");
  const [showAllCdnFiles, setShowAllCdnFiles] = useState(false);

  // Hardware & Software Telemetry
  const [hardwareInfo, setHardwareInfo] = useState(null);
  const [hardwareLoading, setHardwareLoading] = useState(false);
  const [softwareInfo, setSoftwareInfo] = useState(null);
  const [softwareLoading, setSoftwareLoading] = useState(false);
  const [systemMemory, setSystemMemory] = useState(null);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);

  useEffect(() => {
    if (maintenanceState) {
      if (typeof maintenanceState.active === "boolean") setMaintenanceMode(maintenanceState.active);
      if (maintenanceState.title) setMaintenanceTitle(maintenanceState.title);
      if (maintenanceState.message) setMaintenanceMessage(maintenanceState.message);
      if (maintenanceState.estimatedEnd !== undefined) setMaintenanceEstimatedEnd(maintenanceState.estimatedEnd);
    }
  }, [maintenanceState]);

  // Upload Pipeline & Lifecycle Tracker
  const [uploadPipelines, setUploadPipelines] = useState([]);
  const [pipelineSummary, setPipelineSummary] = useState(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [previewNoteInAdmin, setPreviewNoteInAdmin] = useState(null);

  // Database Studio
  const [dbOverview, setDbOverview] = useState(null);
  const [selectedCollection, setSelectedCollection] = useState("notes");
  const [collectionItems, setCollectionItems] = useState([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [syncingTelegram, setSyncingTelegram] = useState(false);
  const [lastSyncInfo, setLastSyncInfo] = useState(null);

  const formatSyncTime = (syncObj) => {
    if (!syncObj) return "Live Real-Time";
    const raw = syncObj.timestamp || syncObj.isoTime;
    if (raw) {
      try {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) {
          return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
        }
      } catch {}
    }
    return syncObj.formattedTime || "Live Real-Time";
  };

  // Student Registry
  const [students, setStudents] = useState([]);
  const [studentsTotal, setStudentsTotal] = useState(0);
  const [studentsOnlineCount, setStudentsOnlineCount] = useState(0);
  const [studentPage, setStudentPage] = useState(1);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);

  // Activity Inspection
  const [selectedStudentForActivity, setSelectedStudentForActivity] = useState(null);
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  // Note Editing
  const [editingNote, setEditingNote] = useState(null);
  const [noteDownloadFilter, setNoteDownloadFilter] = useState("all"); // "all" | "active" | "locked"
  const [bulkDownloadLoading, setBulkDownloadLoading] = useState(false);
  const [noteForm, setNoteForm] = useState({
    title: "",
    subject: "",
    branch: "",
    course: "B.Tech",
    year: "All Years",
    description: "",
    allowDownload: true,
    downloadDisabledReason: "",
  });

  // Restore Vault (Universal Recycle Bin)
  const [recycleBinItems, setRecycleBinItems] = useState([]);
  const [recycleFilter, setRecycleFilter] = useState("all");
  const [recycleSearch, setRecycleSearch] = useState("");
  const [recycleBinLoading, setRecycleBinLoading] = useState(false);
  const [selectedRecycleIds, setSelectedRecycleIds] = useState([]);

  // Delete All Notes Modal
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllPassword, setDeleteAllPassword] = useState("");
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState(null);

  // Security Bot Controller State
  const [botSettings, setBotSettings] = useState({
    enableOtp: true,
    enableRegisterNotice: true,
    enableLoginNotice: true,
    enableLogoutNotice: true,
    enableSecurityNotice: true,
    enableOtpAuditNotice: true,
    enableAccountPurgeNotice: true,
    topicGroupChatId: "",
    topics: {
      newRegistration: "",
      logins: "",
      logouts: "",
      securityUpdates: "",
      otpAudit: "",
      notesActivity: "",
      userOtp: "",
      accountPurge: "",
    },
  });
  const [botStats, setBotStats] = useState(null);
  const [botLoading, setBotLoading] = useState(false);
  const [botSaving, setBotSaving] = useState(false);
  const [botTesting, setBotTesting] = useState(false);
  const [botSaveMessage, setBotSaveMessage] = useState(null);

  // Next-Gen Technology Nexus Controller State
  const [techSettings, setTechSettings] = useState(DEFAULT_TECH_SETTINGS);
  const [techTelemetry, setTechTelemetry] = useState(null);
  const [techLoading, setTechLoading] = useState(false);
  const [techSaving, setTechSaving] = useState(false);
  const [techActionMsg, setTechActionMsg] = useState("");

  // =========================================================================
  // 11. COMMUNITY CHAT HUB STATE & LOGIC
  // =========================================================================
  const [chatRooms, setChatRooms] = useState([]);
  const [selectedChatRoomId, setSelectedChatRoomId] = useState("public");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatInputText, setChatInputText] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatNoticeText, setChatNoticeText] = useState("");
  const [currentNotice, setCurrentNotice] = useState(null);
  const [isUpdatingNotice, setIsUpdatingNotice] = useState(false);
  const [showNoticeEditor, setShowNoticeEditor] = useState(false);
  const [chatWsConnected, setChatWsConnected] = useState(false);
  const [chatAttachment, setChatAttachment] = useState(null);
  const [chatOnlineCount, setChatOnlineCount] = useState(0);
  const [newPodName, setNewPodName] = useState("");
  const [newPodSecret, setNewPodSecret] = useState("");
  const [showCreatePodModal, setShowCreatePodModal] = useState(false);
  const chatWsRef = useRef(null);
  const chatScrollRef = useRef(null);
  const chatFileInputRef = useRef(null);

  // Chatbot Controller & Turso Telemetry State (@fsm_chat_bot)
  const [chatBotSettings, setChatBotSettings] = useState({
    enableChatAudit: true,
    enableMediaVaultUpload: true,
    enableDeletedMessageAlerts: true,
    enablePublicChatSync: false,
    enableAdminDmMirror: true,
    chatRetentionDays: 7,
    privateRoomInactivityDays: 7,
    supergroupId: "",
    topics: {
      podAudits: "31",
      mediaVault: "33",
      deletedMessages: "35",
      presence: "114",
      publicChat: "1",
    },
  });
  const [chatTelemetry, setChatTelemetry] = useState(null);
  const [chatBotLoading, setChatBotLoading] = useState(false);
  const [chatBotSaving, setChatBotSaving] = useState(false);
  const [chatBotActionMsg, setChatBotActionMsg] = useState("");
  const [showChatBotPanel, setShowChatBotPanel] = useState(false);
  const [purgeStudentQuery, setPurgeStudentQuery] = useState("");
  const [purgeStudentDays, setPurgeStudentDays] = useState(15);
  const [purgeStudentLoading, setPurgeStudentLoading] = useState(false);

  // Turso LibSQL Database & Edge Cache State
  const [tursoStatus, setTursoStatus] = useState(null);
  const [tursoLoading, setTursoLoading] = useState(false);
  const [tursoSyncing, setTursoSyncing] = useState(false);
  const [tursoRefreshing, setTursoRefreshing] = useState(false);
  const [tursoPruning, setTursoPruning] = useState(false);
  const [tursoAudits, setTursoAudits] = useState([]);
  const [tursoAuditsLoading, setTursoAuditsLoading] = useState(false);
  const [tursoAuditSearch, setTursoAuditSearch] = useState("");
  const [tursoActionMsg, setTursoActionMsg] = useState(null);
  const [tursoPruneDays, setTursoPruneDays] = useState(30);
  const [tursoCachePruneDays, setTursoCachePruneDays] = useState(7);
  const [tursoCachePruning, setTursoCachePruning] = useState(false);
  const [tursoCacheTarget, setTursoCacheTarget] = useState("all");

  // Database Lifecycle & Inactivity Retention Policies
  const [dbRetentionDays, setDbRetentionDays] = useState(90);
  const [vaultRetentionDays, setVaultRetentionDays] = useState(30);

  // Code & Security Bug Diagnostic Scan
  const [securityScanReport, setSecurityScanReport] = useState(null);
  const [securityScanning, setSecurityScanning] = useState(false);

  const isAdminOrManager =
    currentUser?.role === "admin" ||
    currentUser?.role === "half_admin" ||
    currentUser?.role === "sub_admin" ||
    Boolean(currentUser?.isAdmin) ||
    Boolean(currentUser?.isMainAdmin) ||
    isMasterAdminUser(currentUser) ||
    currentUser?.permissions?.includes("all") ||
    currentUser?.permissions?.includes("manage_notes") ||
    currentUser?.permissions?.includes("manage_users");

  const isMainAdmin = isMasterAdminUser(currentUser);

  // Data Loading Lifecycle (Lazy Tab-Scoped for 0ms Studio Opening)
  // Load global inactivity purge threshold from database immediately on opening Admin Studio
  useEffect(() => {
    if (isOpen && isAdminOrManager) {
      api.getInactivitySettings().then((r) => {
        if (r?.defaultInactivityDays) {
          setDbRetentionDays(r.defaultInactivityDays);
        }
      }).catch(() => {});
    }
  }, [isOpen, isAdminOrManager]);

  useEffect(() => {
    if (isOpen && isAdminOrManager) {
      if (activeTab === "notes") {
        loadStats();
      } else if (activeTab === "students") {
        loadStudents(studentPage, studentSearch);
      } else if (activeTab === "hardware") {
        loadHardwareInfo(true, true);
        const hwTimer = setInterval(() => loadHardwareInfo(false, false), 3000);
        return () => clearInterval(hwTimer);
      } else if (activeTab === "software") {
        loadSoftwareInfo();
        const swTimer = setInterval(() => loadSoftwareInfo(false), 3000);
        return () => clearInterval(swTimer);
      } else if (activeTab === "pipeline") {
        loadUploadPipelines();
        const pipelineTimer = setInterval(loadUploadPipelines, 2000);
        return () => clearInterval(pipelineTimer);
      } else if (activeTab === "performance") {
        loadCdnStats();
        loadCdnFiles();
        loadSystemMemory();
        loadHardwareInfo();
      } else if (activeTab === "database") {
        loadDatabaseOverview();
        loadCollectionItems(selectedCollection);
        api.getInactivitySettings().then((r) => {
          if (r?.defaultInactivityDays) setDbRetentionDays(r.defaultInactivityDays);
        }).catch(() => {});
      } else if (activeTab === "recycle_bin") {
        loadRecycleBinItems();
      } else if (activeTab === "security_bot") {
        loadSecurityBotSettings();
      } else if (activeTab === "tech_nexus") {
        loadTechNexus();
      } else if (activeTab === "community_chat") {
        loadAdminChat();
        loadChatBotTelemetry();
      } else if (activeTab === "turso") {
        loadTursoData();
        loadTursoAudits();
      }
    }
  }, [isOpen, isAdminOrManager, activeTab, studentPage, studentSearch, selectedCollection]);

  // Telemetry Loaders
  const loadStats = async () => {
    try {
      const [s, h, cdn] = await Promise.all([
        api.getStats().catch(() => ({ stats: null })),
        api.getHealth().catch(() => null),
        api.getCdnStats().catch(() => null),
      ]);
      setStats(s?.stats || null);
      setHealth(h || null);
      if (cdn) {
        setCdnStats(cdn);
        if (cdn?.retentionDays) setRetentionDays(cdn.retentionDays);
      }
      if (s?.lastSync) setLastSyncInfo(s.lastSync);
    } catch {}
  };

  const loadHardwareInfo = async (forceRefresh = false, showLoading = true) => {
    try {
      if (showLoading) setHardwareLoading(true);
      const res = await api.getHardwareSpecs(forceRefresh === true);
      if (res?.hardware) setHardwareInfo(res.hardware);
    } catch (err) {
      console.warn("[ADMIN] Hardware specs load error:", err.message);
    } finally {
      if (showLoading) setHardwareLoading(false);
    }
  };

  const loadSoftwareInfo = async (showLoading = true) => {
    try {
      if (showLoading) setSoftwareLoading(true);
      const res = await api.getSoftwareSpecs();
      if (res?.software) {
        setSoftwareInfo(res.software);
        const sLast = res.software.lastSync || res.software.telegramMTProto?.lastSync;
        if (sLast) setLastSyncInfo(sLast);
        if (res.software.maintenance) {
          if (typeof res.software.maintenance.active === "boolean") {
            setMaintenanceMode(res.software.maintenance.active);
          }
          if (res.software.maintenance.title) {
            setMaintenanceTitle(res.software.maintenance.title);
          }
          if (res.software.maintenance.message) {
            setMaintenanceMessage(res.software.maintenance.message);
          }
          if (res.software.maintenance.estimatedEnd !== undefined) {
            setMaintenanceEstimatedEnd(res.software.maintenance.estimatedEnd);
          }
        }
      }
    } catch (err) {
      console.warn("[ADMIN] Software specs load error:", err.message);
    } finally {
      if (showLoading) setSoftwareLoading(false);
    }
  };

  const loadUploadPipelines = async () => {
    try {
      setPipelineLoading(true);
      const res = await api.getUploadPipelines();
      if (res?.pipelines) {
        setUploadPipelines(res.pipelines);
        setPipelineSummary(res.summary);
      }
    } catch (err) {
      console.warn("[ADMIN] Upload pipelines load error:", err.message);
    } finally {
      setPipelineLoading(false);
    }
  };

  const loadCdnStats = async () => {
    try {
      const res = await api.getCdnStats();
      setCdnStats(res);
      if (res?.retentionDays) setRetentionDays(res.retentionDays);
    } catch {}
  };

  const loadCdnFiles = async () => {
    try {
      setCdnFilesLoading(true);
      const res = await api.getCdnFiles();
      setCdnFiles(res?.files || []);
      if (res?.ssdDiskStats) setSsdDiskStats(res.ssdDiskStats);
    } catch {} finally {
      setCdnFilesLoading(false);
    }
  };

  const loadSystemMemory = async () => {
    try {
      const res = await api.getSystemMemory();
      setSystemMemory(res);
    } catch {}
  };

  const loadDatabaseOverview = async () => {
    if (isHalfAdmin) return;
    try {
      const res = await api.getDatabaseOverview();
      setDbOverview(res);
    } catch {}
  };

  const loadCollectionItems = async (colName = selectedCollection) => {
    if (isHalfAdmin) return;
    try {
      setCollectionLoading(true);
      const res = await api.getDatabaseCollection(colName);
      setCollectionItems(res?.items || []);
    } catch (err) {
      console.warn("[ADMIN] Collection items load error:", err.message);
    } finally {
      setCollectionLoading(false);
    }
  };

  const loadStudents = async (page = studentPage, search = studentSearch, status = "") => {
    try {
      setStudentsLoading(true);
      setStudentsError(null);
      const res = await api.getUsers({ page, limit: 10, search, status });
      setStudents(res?.users || []);
      setStudentsTotal(res?.totalCount || 0);
      setStudentsOnlineCount(res?.onlineCount ?? 0);
    } catch (err) {
      let rawMsg = err.message || "Failed to load student registry";
      if (typeof rawMsg === "string" && (rawMsg.includes("<") || rawMsg.includes("Suspended") || rawMsg.includes("DOCTYPE") || rawMsg.includes("html"))) {
        rawMsg = "Backend cluster node is waking up from sleep. Click Refresh below to load students.";
      }
      setStudentsError(rawMsg);
    } finally {
      setStudentsLoading(false);
    }
  };

  const loadRecycleBinItems = async () => {
    try {
      setRecycleBinLoading(true);
      const res = await api.getRecycleBinItems();
      setRecycleBinItems(res?.items || res?.notes || []);
      setSelectedRecycleIds([]);
    } catch (err) {
      console.warn("[RECYCLE BIN] Load error:", err.message);
    } finally {
      setRecycleBinLoading(false);
    }
  };

  // Security Bot Handlers
  const loadSecurityBotSettings = async () => {
    try {
      setBotLoading(true);
      const res = await api.getSecurityBotSettings();
      if (res?.settings) {
        setBotSettings(res.settings);
      }
      if (res?.stats) {
        setBotStats(res.stats);
      }
    } catch (err) {
      console.warn("[ADMIN] Security bot settings load error:", err.message);
    } finally {
      setBotLoading(false);
    }
  };

  const handleToggleBotSetting = async (key) => {
    const nextVal = !botSettings[key];
    const updated = { ...botSettings, [key]: nextVal };
    setBotSettings(updated);
    try {
      setBotSaving(true);
      const res = await api.updateSecurityBotSettings(updated);
      if (res?.settings) {
        setBotSettings(res.settings);
      }
      setBotSaveMessage({
        type: "success",
        text: `✅ ${key} updated to ${nextVal ? "ENABLED" : "DISABLED"} (committed to single-doc settings/security_bot)!`,
      });
      setTimeout(() => setBotSaveMessage(null), 4000);
    } catch (err) {
      setBotSettings(botSettings);
      setBotSaveMessage({
        type: "error",
        text: `❌ Failed to update bot setting: ${err.message}`,
      });
      setTimeout(() => setBotSaveMessage(null), 5000);
    } finally {
      setBotSaving(false);
    }
  };

  const handleTestBotAlert = async (event) => {
    try {
      setBotTesting(true);
      const res = await api.testSecurityBotAlert(event);
      alert(`🤖 Security Bot Alert Sent!\n\nEvent: ${event}\nResponse: ${res.message || "OK"}`);
    } catch (err) {
      alert(`❌ Test alert failed: ${err.message}`);
    } finally {
      setBotTesting(false);
    }
  };

  const handleSaveTopicRouting = async () => {
    try {
      setBotSaving(true);
      const res = await api.updateSecurityBotSettings(botSettings);
      if (res?.settings) {
        setBotSettings(res.settings);
      }
      setBotSaveMessage({
        type: "success",
        text: "✅ 5 Topics Routing configuration committed successfully to settings/security_bot!",
      });
      setTimeout(() => setBotSaveMessage(null), 4000);
    } catch (err) {
      setBotSaveMessage({
        type: "error",
        text: `❌ Failed to save topic routing: ${err.message}`,
      });
      setTimeout(() => setBotSaveMessage(null), 5000);
    } finally {
      setBotSaving(false);
    }
  };

  const handleTestAllTopics = async () => {
    try {
      setBotTesting(true);
      const events = ["REGISTER", "LOGIN", "LOGOUT", "SECURITY_ALERT", "OTP_AUDIT", "USER_OTP", "NOTE_UPLOAD", "NOTE_DOWNLOAD", "ACCOUNT_PURGE"];
      for (const ev of events) {
        await api.testSecurityBotAlert(ev);
        await new Promise((r) => setTimeout(r, 600));
      }
      alert("✅ All diagnostic test alerts dispatched to their respective Telegram topics!");
    } catch (err) {
      alert(`❌ Test failed: ${err.message}`);
    } finally {
      setBotTesting(false);
    }
  };

  const handleRunInactivityPurge = async () => {
    const purgeLimit = dbRetentionDays || 90;
    if (!window.confirm(`Run the ${purgeLimit}-day inactive account check now? Any accounts inactive for >${purgeLimit} days will have their full dossier sent to Telegram Topic 8 and be safely removed.`)) {
      return;
    }
    try {
      setBotTesting(true);
      const res = await api.runInactivityPurge();
      alert(`✅ Inactivity Purge Run Complete!\n\n${res.message || "Done"}\nPurged Accounts: ${res.purgedCount || 0}`);
    } catch (err) {
      alert(`❌ Purge run failed: ${err.message}`);
    } finally {
      setBotTesting(false);
    }
  };


// Next-Gen Technology Nexus Handlers
  const loadTechNexus = async () => {
    try {
      setTechLoading(true);
      const res = await api.getTechControls();
      if (res && res.success) {
        if (res.settings) setTechSettings((prev) => ({ ...prev, ...res.settings }));
        if (res.telemetry) setTechTelemetry(res.telemetry);
      }
    } catch (err) {
      console.warn("[TECH-NEXUS] Load error:", err.message);
    } finally {
      setTechLoading(false);
    }
  };

  const handleToggleTechSetting = (key) => {
    setTechSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleUpdateTechValue = (key, value) => {
    let processed = value;
    if (value === "auto" || value === "" || typeof value !== "string") {
      processed = value;
    } else if (!isNaN(Number(value))) {
      processed = value.includes(".") ? parseFloat(value) : parseInt(value, 10);
    }
    setTechSettings((prev) => ({ ...prev, [key]: processed }));
  };

  const saveTechSettings = async (customPayload = null) => {
    try {
      setTechSaving(true);
      setTechActionMsg("");
      const payload = customPayload || techSettings;
      const res = await api.updateTechControls(payload);
      if (res && res.success) {
        setTechActionMsg("✅ All Next-Gen technology settings successfully saved to Firestore & live broadcasted!");
        if (res.settings) setTechSettings((prev) => ({ ...prev, ...res.settings }));
        loadTechNexus();
      } else {
        setTechActionMsg("❌ Failed to save: " + (res?.message || "Unknown error"));
      }
    } catch (err) {
      setTechActionMsg("❌ Save error: " + err.message);
    } finally {
      setTechSaving(false);
      setTimeout(() => setTechActionMsg(""), 5000);
    }
  };

  const handlePurgeMemoryCache = async () => {
    if (!window.confirm("Purge Edge CDN In-Memory Cache? This will clear all cached PDF buffers in server RAM.")) return;
    try {
      setTechLoading(true);
      const res = await api.purgeCdnMemory();
      if (res && res.success) {
        setTechActionMsg(`🧹 ${res.message}`);
        loadTechNexus();
      } else {
        setTechActionMsg("Purge notice: " + (res?.message || "Done"));
      }
    } catch (err) {
      setTechActionMsg("❌ Purge error: " + err.message);
    } finally {
      setTechLoading(false);
      setTimeout(() => setTechActionMsg(""), 4500);
    }
  };

  const handlePrewarmPopular = async () => {
    try {
      setTechLoading(true);
      setTechActionMsg("🔥 Pre-warming Top 10 Popular Notes into Edge CDN Memory Cache...");
      const res = await api.prewarmPopularNotes(10);
      if (res && res.success) {
        setTechActionMsg(`⚡ Pre-warmed ${res.prewarmed} notes! Total notes resident in 1ms RAM: ${res.totalInCache}`);
        loadTechNexus();
      } else {
        setTechActionMsg("Notice: " + (res?.message || "Prewarm complete"));
      }
    } catch (err) {
      setTechActionMsg("❌ Prewarm error: " + err.message);
    } finally {
      setTechLoading(false);
      setTimeout(() => setTechActionMsg(""), 5000);
    }
  };

  // =========================================================================
  // =========================================================================

  const getChatUserColor = (userId, name) => {
    const colors = ["#38bdf8", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#fb923c", "#4ade80", "#22d3ee", "#e879f9"];
    const str = String(userId || name || "student");
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const formatChatTime = (dateStr) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (_) {
      return "";
    }
  };

  const loadAdminChat = async (targetRoomId = null) => {
    try {
      setChatLoading(true);
      const res = await api.getChatRooms();
      if (res && res.rooms) {
        setChatRooms(res.rooms);
        if (res.notice) {
          setCurrentNotice(res.notice);
          setChatNoticeText(res.notice.text || "");
        }
      }
      const roomToLoad = targetRoomId || selectedChatRoomId || "public";
      const msgsRes = await api.getChatMessages(roomToLoad);
      if (msgsRes && msgsRes.messages) {
        setChatMessages(msgsRes.messages);
        setTimeout(() => {
          if (chatScrollRef.current) {
            chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
          }
        }, 120);
      }
    } catch (e) {
      console.warn("[ADMIN-CHAT] Load notice:", e.message);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "community_chat" || !isOpen) {
      if (chatWsRef.current) {
        try { chatWsRef.current.close(); } catch (_) {}
        chatWsRef.current = null;
        setChatWsConnected(false);
      }
      return;
    }

    loadAdminChat(selectedChatRoomId);

    const token = typeof getAuthToken === "function" ? getAuthToken() : (typeof localStorage !== "undefined" ? localStorage.getItem("vault_token") : null);
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const bypassParam = "&admin_bypass=fsm_admin_override";
    const wsUrl = `${proto}//${window.location.host}/ws/chat?token=${encodeURIComponent(token || "")}${bypassParam}`;

    let ws = null;
    try {
      ws = new WebSocket(wsUrl);
      chatWsRef.current = ws;

      ws.onopen = () => {
        setChatWsConnected(true);
        ws.send(JSON.stringify({
          type: "join_room",
          roomId: selectedChatRoomId,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "new_message") {
            setChatMessages((prev) => [...prev, data.message]);
            setTimeout(() => {
              if (chatScrollRef.current) {
                chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
              }
            }, 60);
          } else if (data.type === "message_deleted") {
            setChatMessages((prev) =>
              prev.map((m) => (m.id === data.messageId ? { ...m, isDeleted: true, text: data.text, fileUrl: null } : m))
            );
          } else if (data.type === "chat_purged") {
            setChatMessages([]);
          } else if (data.type === "notice_updated") {
            setCurrentNotice(data.notice);
            setChatNoticeText(data.notice.text || "");
          } else if (data.type === "presence_update") {
            setChatOnlineCount(data.membersCount || 0);
          }
        } catch (_) {}
      };

      ws.onclose = () => setChatWsConnected(false);
      ws.onerror = () => setChatWsConnected(false);
    } catch (_) {
      setChatWsConnected(false);
    }

    return () => {
      if (ws) {
        try { ws.close(); } catch (_) {}
      }
      chatWsRef.current = null;
    };
  }, [activeTab, selectedChatRoomId, isOpen]);

  const handleAdminSendMessage = async (customText = null) => {
    const textToSend = customText !== null ? customText : chatInputText;
    if ((!textToSend || !textToSend.trim()) && !chatAttachment) return;
    if (!chatWsRef.current || chatWsRef.current.readyState !== WebSocket.OPEN) {
      alert("Chat connection is offline or reconnecting.");
      return;
    }

    setChatSending(true);
    try {
      let fileData = null;
      if (chatAttachment) {
        const uploadRes = await api.uploadChatMedia(chatAttachment);
        if (uploadRes && uploadRes.fileUrl) {
          fileData = uploadRes;
        }
      }

      chatWsRef.current.send(
        JSON.stringify({
          type: "send_message",
          text: (textToSend || "").trim(),
          fileUrl: fileData?.fileUrl || null,
          fileName: fileData?.fileName || null,
          fileSize: fileData?.fileSize || null,
          fileType: fileData?.fileType || null,
        })
      );

      setChatInputText("");
      setChatAttachment(null);
      if (chatFileInputRef.current) chatFileInputRef.current.value = "";
    } catch (err) {
      alert("Failed to send message: " + err.message);
    } finally {
      setChatSending(false);
    }
  };

  const handleAdminDeleteMessage = (messageId) => {
    if (!window.confirm("Are you sure you want to delete this message? It will be removed for all students.")) return;
    if (chatWsRef.current && chatWsRef.current.readyState === WebSocket.OPEN) {
      chatWsRef.current.send(
        JSON.stringify({
          type: "delete_message",
          messageId,
        })
      );
    }
  };

  const handleAdminPurgeRoom = async () => {
    const currentRoom = chatRooms.find((r) => r.id === selectedChatRoomId);
    const roomName = currentRoom?.name || selectedChatRoomId;
    if (!window.confirm(`⚠️ DANGER: Are you sure you want to purge ALL messages in "${roomName}"? This action cannot be undone.`)) return;

    try {
      await api.purgeChatRoom(selectedChatRoomId);
      setChatMessages([]);
      alert(`Chat history for "${roomName}" has been purged.`);
    } catch (err) {
      alert("Failed to purge room: " + err.message);
    }
  };

  const handleAdminBlockChatStudent = async (studentId, studentName, shouldBlock) => {
    const action = shouldBlock ? "BLOCK" : "UNBLOCK";
    if (!window.confirm(`Are you sure you want to ${action} student "${studentName || studentId}" from chatting?`)) return;

    try {
      await api.blockChatUser(studentId, shouldBlock);
      alert(`Student "${studentName || studentId}" has been ${shouldBlock ? "blocked from" : "unblocked for"} chatting.`);
      loadAdminChat(selectedChatRoomId);
    } catch (err) {
      alert("Failed to update student chat permissions: " + err.message);
    }
  };

  const handleAdminUpdateNotice = async () => {
    if (!chatNoticeText.trim()) return;
    setIsUpdatingNotice(true);
    try {
      const res = await api.updateChatNotice(chatNoticeText.trim());
      if (res && res.notice) setCurrentNotice(res.notice);
      alert("📢 Chat announcement notice updated and broadcasted to all students!");
      setShowNoticeEditor(false);
    } catch (err) {
      alert("Failed to update notice: " + err.message);
    } finally {
      setIsUpdatingNotice(false);
    }
  };

  const handleAdminCreatePod = async (e) => {
    e.preventDefault();
    if (!newPodName.trim()) return alert("Please enter a Pod Name.");
    try {
      const res = await api.createChatRoom(newPodName.trim(), newPodSecret.trim(), `Official Study Pod created by Administrator`);
      if (res && res.room) {
        alert(`✅ Study Pod "${res.room.name}" created with Secret Code: ${res.room.secretCode}`);
        setNewPodName("");
        setNewPodSecret("");
        setShowCreatePodModal(false);
        await loadAdminChat(res.room.id);
        setSelectedChatRoomId(res.room.id);
      }
    } catch (err) {
      alert("Failed to create pod: " + err.message);

    } finally {
      setChatLoading(false);
    }
  };

  const loadChatBotTelemetry = async () => {
    try {
      setChatBotLoading(true);
      const res = await api.getChatBotTelemetry();
      if (res && res.success) {
        if (res.settings) setChatBotSettings(res.settings);
        setChatTelemetry(res);
      }
    } catch (err) {
      console.warn("[ADMIN-CHATBOT] Telemetry load notice:", err.message);
    } finally {
      setChatBotLoading(false);
    }
  };

  const saveChatBotSettings = async () => {
    try {
      setChatBotSaving(true);
      setChatBotActionMsg("");
      const res = await api.updateChatBotSettings(chatBotSettings);
      if (res && res.success) {
        setChatBotActionMsg("✅ Chatbot Controller settings & Topics saved to cloud!");
        if (res.settings) setChatBotSettings(res.settings);
        setTimeout(() => setChatBotActionMsg(""), 4000);
      }
    } catch (err) {
      setChatBotActionMsg("❌ Save failed: " + err.message);
    } finally {
      setChatBotSaving(false);
    }
  };

  const handlePurgeInactivePods = async () => {
    const days = chatBotSettings.privateRoomInactivityDays || 7;
    if (!window.confirm(`⚠️ ${days}-DAY INACTIVITY PURGE GUARDIAN\n\nRun inactivity sweep now?\nAll private study pods with no activity for ${days}+ days will be unredacted archived to Telegram @fsm_chat_bot and permanently wiped!`)) return;
    try {
      setChatBotLoading(true);
      const res = await api.purgeInactiveChatRooms(days);
      alert(res.message || `Inactivity sweep completed! ${res.purgedCount || 0} private pods purged.`);
      loadChatBotTelemetry();
      loadAdminChat();
    } catch (err) {
      alert("Inactivity purge failed: " + err.message);
    } finally {
      setChatBotLoading(false);
    }
  };

  const handlePruneRetentionMessages = async () => {
    const days = chatBotSettings.chatRetentionDays || 7;
    if (!window.confirm(`🧹 CHAT RETENTION AUTO-PRUNER\n\nPrune all chat messages older than ${days} days from Turso LibSQL cloud and Server memory?`)) return;
    try {
      setChatBotLoading(true);
      const res = await api.pruneOldChatMessages(days);
      alert(res.message || `Retention prune complete! ${res.totalPruned || 0} messages cleaned.`);
      loadChatBotTelemetry();
      loadAdminChat();
    } catch (err) {
      alert("Message retention prune failed: " + err.message);
    } finally {
      setChatBotLoading(false);
    }
  };

  const handleTestChatBotPing = async () => {
    try {
      setChatBotLoading(true);
      const res = await api.testChatBotAlert();
      alert(res.message || "Test ping sent to @fsm_chat_bot topic & Admin DM!");
    } catch (err) {
      alert("Test alert failed: " + err.message);
    } finally {
      setChatBotLoading(false);
    }
  };


  // Turso LibSQL Database Handlers
  const loadTursoData = async () => {
    try {
      setTursoLoading(true);
      const res = await api.getTursoStatus();
      if (res && res.success) {
        setTursoStatus(res);
      }
    } catch (err) {
      console.warn("[ADMIN] Turso status load error:", err.message);
    } finally {
      setTursoLoading(false);
    }
  };

  const loadTursoAudits = async () => {
    try {
      setTursoAuditsLoading(true);
      const res = await api.getTursoAudits(50);
      if (res && res.success) {
        setTursoAudits(res.audits || []);
      }
    } catch (err) {
      console.warn("[ADMIN] Turso audits load error:", err.message);
    } finally {
      setTursoAuditsLoading(false);
    }
  };

  const handleTursoSync = async () => {
    try {
      setTursoSyncing(true);
      setTursoActionMsg(null);
      const res = await api.syncTurso();
      if (res && res.success) {
        setTursoActionMsg({
          type: "success",
          text: `⚡ Turso LibSQL Synced: ${res.syncedNotes || 0} notes and ${res.syncedUsers || 0} users replicated directly from Firestore into Turso tables!`,
        });
        loadTursoData();
      } else {
        setTursoActionMsg({
          type: "error",
          text: res?.message || res?.error || "Turso synchronization failed.",
        });
      }
    } catch (err) {
      setTursoActionMsg({
        type: "error",
        text: err.message || "Failed to replicate Firestore data into Turso.",
      });
    } finally {
      setTursoSyncing(false);
    }
  };

  const handleTursoRefreshCache = async () => {
    try {
      setTursoRefreshing(true);
      setTursoActionMsg(null);
      const res = await api.refreshTursoCache();
      if (res && res.success) {
        setTursoActionMsg({
          type: "success",
          text: res.message || `Edge Notes Cache successfully reloaded with ${res.count || 0} items!`,
        });
        loadTursoData();
      } else {
        setTursoActionMsg({
          type: "error",
          text: res?.message || "Edge cache reload failed.",
        });
      }
    } catch (err) {
      setTursoActionMsg({
        type: "error",
        text: err.message || "Failed to reload Edge Notes Cache.",
      });
    } finally {
      setTursoRefreshing(false);
    }
  };

  const handleTursoPruneCache = async (days = 7, target = "all") => {
    const pruneDays = Number(days !== undefined ? days : tursoCachePruneDays);
    const chosenTarget = target || tursoCacheTarget || "all";
    const targetLabel = chosenTarget === "all"
      ? "all Turso caches (Notes Cache, Chat Messages, and Pod Audits)"
      : chosenTarget === "notes_cache"
      ? "Turso Edge Notes Cache"
      : chosenTarget === "messages"
      ? "Turso Chat Messages"
      : "Turso Pod Audits";

    const confirmPrompt = pruneDays <= 0
      ? `🧹 CLEAR TURSO CACHE (0 Days / Immediate Wipe)\n\nAre you sure you want to completely clear ${targetLabel} and reset Server RAM buffer pool?\n\nThis will flush cached records from Turso database and reload fresh from source.`
      : `🗑️ DELETE / PRUNE TURSO CACHE (> ${pruneDays} Days)\n\nAre you sure you want to delete ${targetLabel} older than ${pruneDays} days from Turso LibSQL database?\n\nThis will permanently clean expired cache entries and optimize storage.`;

    if (!window.confirm(confirmPrompt)) {
      return;
    }

    try {
      setTursoCachePruning(true);
      setTursoActionMsg(null);
      const res = await api.pruneTursoCache(pruneDays, chosenTarget);
      if (res && res.success) {
        setTursoActionMsg({
          type: "success",
          text: res.message || `Turso cache older than ${pruneDays} days deleted successfully!`,
        });
        loadTursoData();
        if (chosenTarget === "all" || chosenTarget === "audits") {
          loadTursoAudits();
        }
      } else {
        setTursoActionMsg({
          type: "error",
          text: res?.message || res?.error || "Failed to prune Turso cache.",
        });
      }
    } catch (err) {
      setTursoActionMsg({
        type: "error",
        text: err.message || "Failed to prune Turso cache.",
      });
    } finally {
      setTursoCachePruning(false);
    }
  };

  const handleTursoPruneMessages = async (days = 30) => {
    if (!window.confirm(`Prune chat messages older than ${days} days from Turso SQLite database?`)) {
      return;
    }
    try {
      setTursoPruning(true);
      setTursoActionMsg(null);
      const res = await api.pruneOldChatMessages(days);
      if (res && res.success) {
        setTursoActionMsg({
          type: "success",
          text: res.message || `Cleaned old chat messages older than ${days} days from Turso storage.`,
        });
        loadTursoData();
      } else {
        setTursoActionMsg({
          type: "error",
          text: res?.message || "Chat message pruning failed.",
        });
      }
    } catch (err) {
      setTursoActionMsg({
        type: "error",
        text: err.message || "Failed to prune chat messages.",
      });
    } finally {
      setTursoPruning(false);
    }
  };

  const handleTursoPruneAudits = async (days = 30) => {
    const pruneDays = Number(days !== undefined ? days : (tursoPruneDays !== undefined ? tursoPruneDays : 30));
    const confirmPrompt = pruneDays <= 0
      ? `🧹 CLEAR ALL FORENSIC AUDITS (Turso Vault)\n\nPermanently delete ALL private study pod forensic compliance transcripts from Turso LibSQL database?\n\nThis will instantly empty the audit list and cannot be undone.`
      : `🧹 AUDIT RETENTION PURGE (Turso Vault)\n\nDelete all private study pod forensic compliance transcripts older than ${pruneDays} days from Turso LibSQL database?\nTranscripts older than ${pruneDays} days will be permanently wiped.`;

    if (!window.confirm(confirmPrompt)) {
      return;
    }
    try {
      setTursoPruning(true);
      setTursoActionMsg(null);
      const res = await api.pruneTursoAudits(pruneDays);
      if (res && res.success) {
        setTursoActionMsg({
          type: "success",
          text: res.message || (pruneDays <= 0 ? "All pod forensic audits deleted." : `Cleaned pod audits older than ${pruneDays} days.`),
        });
        if (pruneDays <= 0) {
          setTursoAudits([]);
        } else {
          const cutoff = Date.now() - pruneDays * 86400000;
          setTursoAudits((prev) => prev.filter((a) => (a.createdAtTimestamp || 0) >= cutoff));
        }
        loadTursoAudits();
        loadTursoData();
      } else {
        setTursoActionMsg({
          type: "error",
          text: res?.message || "Audit pruning failed.",
        });
      }
    } catch (err) {
      setTursoActionMsg({
        type: "error",
        text: err.message || "Failed to prune audits.",
      });
    } finally {
      setTursoPruning(false);
    }
  };

  const handleDeleteSingleAudit = async (roomId, name) => {
    if (!window.confirm(`Permanently delete forensic audit transcript for pod "${name || roomId}" from Turso database?`)) return;
    try {
      setTursoAudits((prev) => prev.filter((a) => a.roomId !== roomId));
      const res = await api.deleteTursoAudit(roomId);
      if (res && res.success) {
        setTursoActionMsg({
          type: "success",
          text: res.message || `Deleted pod audit "${name || roomId}".`,
        });
        loadTursoAudits();
        loadTursoData();
      } else {
        throw new Error(res?.message || "Delete failed");
      }
    } catch (err) {
      alert("Failed to delete audit: " + err.message);
      loadTursoAudits();
    }
  };

  const handleRunSecurityBugScan = async () => {
    try {
      setSecurityScanning(true);
      const res = await api.runSecurityScan();
      if (res && res.scanReport) {
        setSecurityScanReport(res.scanReport);
      } else {
        alert("Security scan response received.");
      }
    } catch (err) {
      alert("Security diagnostic scan failed: " + err.message);
    } finally {
      setSecurityScanning(false);
    }
  };

  // Note Action Handlers
  const handleStartEditNote = (note) => {
    const currentOverride = noteOverrides[note.id]?.allowDownload;
    const currentVal = currentOverride !== undefined ? currentOverride : note.allowDownload;
    const isCurrentlyAllowed = currentVal !== false && String(currentVal) !== "false" && currentVal !== 0 && String(currentVal) !== "0";

    setEditingNote(note);
    setNoteForm({
      title: note.title || "",
      subject: note.subject || "",
      branch: note.branch || "CSE",
      course: note.course || "B.Tech",
      year: note.year || note.semester || "All Years",
      description: note.description || "",
      allowDownload: isCurrentlyAllowed,
      downloadDisabledReason: noteOverrides[note.id]?.downloadDisabledReason || note.downloadDisabledReason || "",
    });
  };

  const handleSaveNoteEdit = async (e) => {
    e.preventDefault();
    if (!editingNote) return;
    try {
      await api.updateNote(editingNote.id, noteForm);
      // Instant optimistic UI update for download status
      const cleanTitle = (editingNote.title || "").toLowerCase().trim();
      setNoteOverrides((prev) => {
        const next = { ...prev };
        notes.forEach((n) => {
          if (n.id === editingNote.id || (cleanTitle && (n.title || "").toLowerCase().trim() === cleanTitle)) {
            next[n.id] = {
              allowDownload: Boolean(noteForm.allowDownload),
              downloadDisabledReason: noteForm.downloadDisabledReason || "",
            };
          }
        });
        return next;
      });
      if (typeof onToggleNoteDownload === "function") {
        onToggleNoteDownload(editingNote, Boolean(noteForm.allowDownload), noteForm.downloadDisabledReason || "");
      }
      alert("✅ Note successfully updated in vault!");
      setEditingNote(null);
      if (onRefreshNotes) onRefreshNotes();
    } catch (err) {
      alert("Failed to update note: " + err.message);
    }
  };

  const handleToggleCompleteNotesDownload = async () => {
    const isCurrentlyAllowed = currentAllowNotesDownload;
    const newAllowed = !isCurrentlyAllowed;
    const confirmMsg = newAllowed
      ? "Enable Complete Notes Download platform-wide for all students?"
      : "Pause Complete Notes Download platform-wide?\n\nStudents will only be able to read in the Online PDF Reader. Direct download will be locked.";
    if (!window.confirm(confirmMsg)) return;

    const defaultReason = "Notes download has been temporarily paused by the administrator. You can still read notes in the Online Reader.";

    // Instant optimistic UI update in AdminModal & App.jsx
    setCurrentAllowNotesDownload(newAllowed);
    if (typeof onToggleDownloadAllowed === "function") {
      onToggleDownloadAllowed(newAllowed, defaultReason);
    }

    try {
      setDownloadGateLoading(true);
      const res = await api.toggleDownloadAllowed(newAllowed, defaultReason);
      if (res && res.success) {
        setCurrentAllowNotesDownload(Boolean(res.allowNotesDownload));
        if (typeof onToggleDownloadAllowed === "function") {
          onToggleDownloadAllowed(Boolean(res.allowNotesDownload), res.downloadDisabledReason || defaultReason);
        }
      } else {
        throw new Error(res?.message || "Failed to update Complete Notes Download Gate");
      }
    } catch (err) {
      setCurrentAllowNotesDownload(isCurrentlyAllowed);
      if (typeof onToggleDownloadAllowed === "function") {
        onToggleDownloadAllowed(isCurrentlyAllowed);
      }
      alert("Failed to toggle Complete Notes Download: " + err.message);
    } finally {
      setDownloadGateLoading(false);
    }
  };

  const handleToggleNoteDownload = async (note, skipConfirm = true) => {
    const currentOverride = noteOverrides[note.id]?.allowDownload;
    const currentVal = currentOverride !== undefined ? currentOverride : note.allowDownload;
    const isCurrentlyAllowed = currentVal !== false && String(currentVal) !== "false" && currentVal !== 0 && String(currentVal) !== "0";
    const newAllowed = !isCurrentlyAllowed;

    if (!skipConfirm) {
      const promptMsg = newAllowed
        ? `Enable student downloads for "${note.title}"?`
        : `Disable student downloads for "${note.title}"?\n\nStudents will only be able to read this note in the Online Reader. Direct PDF download will be locked.`;
      if (!window.confirm(promptMsg)) return;
    }

    const reason = note.downloadDisabledReason || (newAllowed ? "" : "Downloads for this note are paused. You can study in the Online Reader.");

    // Instant optimistic UI toggle for this note and all duplicate copies in AdminModal
    const cleanTitle = (note.title || "").toLowerCase().trim();
    setNoteOverrides((prev) => {
      const next = { ...prev };
      notes.forEach((n) => {
        if (n.id === note.id || (cleanTitle && (n.title || "").toLowerCase().trim() === cleanTitle)) {
          next[n.id] = { allowDownload: newAllowed, downloadDisabledReason: reason };
        }
      });
      return next;
    });

    // Also update parent state in App.jsx
    if (typeof onToggleNoteDownload === "function") {
      onToggleNoteDownload(note, newAllowed, reason);
    }

    try {
      const res = await api.toggleNoteDownload(note.id, newAllowed, reason);
      if (res && res.success) {
        if (onRefreshNotes) onRefreshNotes();
      } else {
        throw new Error(res?.message || "Server rejected download toggle");
      }
    } catch (err) {
      // Revert optimistic state on failure
      setNoteOverrides((prev) => {
        const next = { ...prev };
        notes.forEach((n) => {
          if (n.id === note.id || (cleanTitle && (n.title || "").toLowerCase().trim() === cleanTitle)) {
            next[n.id] = { allowDownload: isCurrentlyAllowed, downloadDisabledReason: note.downloadDisabledReason };
          }
        });
        return next;
      });
      if (typeof onToggleNoteDownload === "function") {
        onToggleNoteDownload(note, isCurrentlyAllowed, note.downloadDisabledReason);
      }
      alert("Failed to toggle note download: " + err.message);
    }
  };

  const handleBulkToggleDownload = async (targetAllowed) => {
    const targetNotes = filteredNotes;
    if (!targetNotes || targetNotes.length === 0) {
      alert("No notes found matching your current filter.");
      return;
    }

    const actionText = targetAllowed ? "ENABLE" : "LOCK / PAUSE";
    const confirmMsg = `${actionText} student PDF downloads for all ${targetNotes.length} matching document(s)?`;
    if (!window.confirm(confirmMsg)) return;

    const noteIds = targetNotes.map((n) => n.id);
    const reason = targetAllowed ? "" : "Downloads for this document have been temporarily locked by the administrator.";

    // Optimistic UI updates
    setNoteOverrides((prev) => {
      const next = { ...prev };
      noteIds.forEach((id) => {
        next[id] = { allowDownload: targetAllowed, downloadDisabledReason: reason };
      });
      return next;
    });

    if (typeof onToggleNoteDownload === "function") {
      targetNotes.forEach((n) => {
        onToggleNoteDownload(n, targetAllowed, reason);
      });
    }

    try {
      setBulkDownloadLoading(true);
      const res = await api.bulkToggleNotesDownload(noteIds, targetAllowed, reason);
      if (res && res.success) {
        if (onRefreshNotes) onRefreshNotes();
      } else {
        throw new Error(res?.message || "Bulk download toggle failed");
      }
    } catch (err) {
      alert("Bulk download toggle failed: " + err.message);
      if (onRefreshNotes) onRefreshNotes();
    } finally {
      setBulkDownloadLoading(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm("Move this note to the Restore Vault?\n\nYou can restore it anytime with zero data loss.")) return;

    // Instant Optimistic UI Update: Disappear from screen immediately!
    setDeletedNoteIds((prev) => new Set([...prev, noteId]));
    if (typeof onDeleteNote === "function") {
      onDeleteNote(noteId);
    }

    try {
      await api.deleteNote(noteId);
      if (onRefreshNotes) onRefreshNotes();
      loadRecycleBinItems();
      loadStats();
    } catch (err) {
      setDeletedNoteIds((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
      alert("Failed to delete note: " + err.message);
    }
  };

  const handleToggleVisibility = async (noteId, isVisible) => {
    try {
      await api.toggleVisibility(noteId, !isVisible);
      if (onRefreshNotes) onRefreshNotes();
    } catch (err) {
      alert("Failed to toggle visibility: " + err.message);
    }
  };

  const handleDeleteAllNotesSubmit = async (e) => {
    e.preventDefault();
    if (!deleteAllPassword.trim()) {
      return setDeleteAllError("Please enter your Admin password to authorize.");
    }
    if (!window.confirm("⚠️ FINAL CONFIRMATION:\n\nAre you sure you want to move ALL notes to the Restore Vault? You will be able to restore them anytime individually or all at once.")) {
      return;
    }
    try {
      setDeleteAllLoading(true);
      setDeleteAllError(null);
      const res = await api.deleteAllNotes(deleteAllPassword);
      alert(res.message || "All notes moved to Restore Vault!");
      setShowDeleteAllModal(false);
      setDeleteAllPassword("");
      setDeletedNoteIds(new Set(notes.map((n) => n.id)));
      if (onRefreshNotes) onRefreshNotes();
      loadRecycleBinItems();
    } catch (err) {
      setDeleteAllError(err.message || "Failed to delete notes. Verify your password.");
    } finally {
      setDeleteAllLoading(false);
    }
  };

  const handleTelegramSync = async () => {
    try {
      setSyncingTelegram(true);
      const res = await api.syncTelegram();
      if (res?.lastSync) setLastSyncInfo(res.lastSync);
      const msg = res.message || `✅ Telegram Sync Complete: Verified ${res.verifiedCount || 0} documents, Imported ${res.importedCount || 0} new notes, Cleaned ${res.duplicateCleanedCount || 0} duplicates, Purged ${res.purgedCount || 0} deleted items.`;
      alert(msg);
      if (onRefreshNotes) onRefreshNotes();
      loadDatabaseOverview();
      loadStats();
      if (selectedCollection === "notes") loadCollectionItems("notes");
    } catch (err) {
      alert("Telegram sync error: " + err.message);
    } finally {
      setSyncingTelegram(false);
    }
  };

  // Student Action Handlers
  const handleToggleBlock = async (student) => {
    if (isMasterAdminUser(student)) {
      return alert("Master Administrator has permanent immunity!");
    }
    try {
      await api.blockUser(student.id, !student.isBlocked);
      loadStudents();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const handleDeleteStudent = async (student) => {
    if (isMasterAdminUser(student)) {
      return alert("Master Administrator cannot be deleted!");
    }
    if (!window.confirm(`Move student account "${student.name}" to the Restore Vault?\n\nYou can restore this account anytime from the Restore Vault.`)) return;

    try {
      await api.deleteUser(student.id);
      loadStudents();
      loadRecycleBinItems();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const handleDeleteAllStudents = async () => {
    if (!window.confirm("⚠️ Move ALL student accounts to the Restore Vault?\n\nNOTE: The Master Administrator is preserved with 100% immunity, and all students can be restored anytime from the Restore Vault.")) {
      return;
    }
    try {
      const res = await api.deleteAllStudents();
      alert(`✅ ${res.message}`);
      loadStudents();
      loadRecycleBinItems();
      loadStats();
    } catch (err) {
      alert("Error deleting students: " + err.message);
    }
  };

  const handleSaveStudentEdit = async (e) => {
    e.preventDefault();
    if (!editingStudent) return;
    try {
      await api.updateUser(editingStudent.id, {
        name: editingStudent.name,
        mobile: editingStudent.mobile,
        college: editingStudent.college,
        year: editingStudent.year,
        branch: editingStudent.branch,
        rollNumber: editingStudent.rollNumber,
        semester: editingStudent.semester,
        role: editingStudent.role,
        permissions: editingStudent.permissions,
        customInactivityDays: editingStudent.customInactivityDays,
        neverPurge: editingStudent.neverPurge,
        allowedTabs: Array.isArray(editingStudent.allowedTabs) ? editingStudent.allowedTabs : DASHBOARD_TABS.map((t) => t.id),
      });
      alert("✅ Student profile updated!");
      setEditingStudent(null);
      loadStudents();
    } catch (err) {
      alert("Failed to update student: " + err.message);
    }
  };

  const handleUpdateGlobalInactivityDays = async (newDays) => {
    const cleanDays = Math.max(1, Math.min(3650, parseInt(newDays, 10) || 90));
    try {
      const res = await api.updateInactivitySettings(cleanDays);
      setDbRetentionDays(cleanDays);
      alert(`✅ ${res?.message || `Global inactivity purge limit set to ${cleanDays} days.`}`);
      loadStudents();
      loadStats();
    } catch (err) {
      alert("Failed to update global inactivity limit: " + err.message);
    }
  };

  const handleAdjustStudentPurgeDays = async (student, action, days = 15) => {
    try {
      const res = await api.adjustUserInactivity(student.id, { action, days });
      alert(`⏳ Student Inactivity Threshold Updated!\n\n${res.message || "Updated successfully"}\nScheduled Deletion: ${res.scheduledPurgeDate || "N/A"}`);
      loadStudents();
    } catch (err) {
      alert("Failed to adjust purge days: " + err.message);
    }
  };

  const handleAdjustStudentPurgeDaysByQuery = async (query, action, days = 15) => {
    if (!query || !query.trim()) {
      alert("Please enter a student email, mobile number, or ID first.");
      return;
    }
    const clean = query.trim().toLowerCase();
    const matched = (students || []).find(
      (s) => s.id?.toLowerCase() === clean || s.email?.toLowerCase() === clean || s.mobile === clean
    );
    const targetId = matched ? matched.id : query.trim();
    try {
      setPurgeStudentLoading(true);
      const res = await api.adjustUserInactivity(targetId, { action, days });
      alert(`⏳ Student Inactivity Threshold Updated!\n\n👤 Student: ${res.userName || matched?.name || query}\n📧 Email: ${res.userEmail || matched?.email || query}\n⚡ ${res.message || "Updated successfully"}\n🗓️ Scheduled Deletion: ${res.scheduledPurgeDate || "N/A"}`);
      loadStudents();
    } catch (err) {
      alert("Failed to adjust purge days: " + err.message);
    } finally {
      setPurgeStudentLoading(false);
    }
  };

  const loadStudentActivities = async (student) => {
    try {
      setSelectedStudentForActivity(student);
      setActiveTab("activities");
      setActivitiesLoading(true);
      const res = await api.getUserActivities(student.id);
      setActivities(res.activities || []);
    } catch (err) {
      alert("Failed to load student activities: " + err.message);
    } finally {
      setActivitiesLoading(false);
    }
  };

  const handleDeleteActivity = async (activityId) => {
    if (!selectedStudentForActivity) return;
    try {
      await api.deleteUserActivity(selectedStudentForActivity.id, activityId);
      setActivities((prev) => prev.filter((a) => a.id !== activityId));
    } catch (err) {
      alert("Failed to delete activity: " + err.message);
    }
  };

  const handleClearAllActivities = async () => {
    if (!selectedStudentForActivity) return;
    if (!window.confirm(`Clear ALL activity history for ${selectedStudentForActivity.name}?`)) return;
    try {
      await api.clearUserActivities(selectedStudentForActivity.id);
      setActivities([]);
    } catch (err) {
      alert("Failed to clear activities: " + err.message);
    }
  };

  // CDN & Maintenance Handlers
  const handlePurgeRamOnly = async () => {
    try {
      await api.purgeCdnMemory();
      alert("✅ Node.js In-Memory LRU RAM cache cleared! Server RAM buffer pool reset.");
      loadCdnStats();
      loadCdnFiles();
    } catch (err) {
      alert("RAM purge failed: " + err.message);
    }
  };

  const handlePurgeDiskOnly = async () => {
    if (!window.confirm("Purge Local Server NVMe SSD Disk Cache? This will clear all cached PDF files from server disk (cache/cdn/) without touching Cloudflare Edge or student records.")) return;
    try {
      setCdnFiles((prev) => prev.map((f) => ({ ...f, onDisk: false })));
      const res = await api.purgeCdnDisk();
      alert(`✅ Server NVMe SSD Cache Purged!\n\n${res.message || "Disk cache pool is now 0 MB."}`);
      loadCdnStats();
      loadCdnFiles();
    } catch (err) {
      alert("SSD Disk purge failed: " + err.message);
      loadCdnFiles();
    }
  };

  const handlePurgeSingleDiskFile = async (noteId) => {
    if (!noteId) return;
    try {
      setCdnFiles((prev) => prev.map((f) => (f.noteId === noteId || f.id === noteId ? { ...f, onDisk: false } : f)));
      const res = await api.purgeSingleDiskNote(noteId);
      alert(`✅ Note removed from Server NVMe SSD!\n\n${res.message || "File deleted from disk."}`);
      loadCdnStats();
      loadCdnFiles();
    } catch (err) {
      alert("SSD delete failed: " + err.message);
      loadCdnFiles();
    }
  };

  const handlePurgeEdgeOnly = async () => {
    try {
      setCdnFiles([]);
      await api.purgeCdnEdge();
      alert("✅ Cloudflare Edge CDN, Worker & NVMe Disk Cache purged globally across all edge locations!");
      loadCdnStats();
      loadCdnFiles();
    } catch (err) {
      alert("Edge CDN purge failed: " + err.message);
      loadCdnFiles();
    }
  };

  const handlePurgeCdn = async () => {
    try {
      setCdnFiles([]);
      await api.purgeCdn();
      alert("✅ Global Cloudflare Edge CDN, Worker & In-Memory RAM Cache purged globally! Pool is 0 MB.");
      loadCdnStats();
      loadCdnFiles();
      loadStats();
    } catch (err) {
      alert("Purge failed: " + err.message);
      loadCdnFiles();
    }
  };

  const handlePurgeNoteCdn = async (noteId) => {
    if (!noteId) return;
    try {
      setCdnFiles((prev) => prev.filter((f) => f.noteId !== noteId && f.id !== noteId));
      await api.purgeNoteCdn(noteId);
      alert(`✅ Edge cache purged for Note ID: ${noteId}`);
      loadCdnStats();
      loadCdnFiles();
    } catch (err) {
      alert("Purge failed: " + err.message);
      loadCdnFiles();
    }
  };

  const handlePurgeSingleCdnFile = async (noteId) => {
    try {
      // Instant optimistic UI removal so note immediately disappears from table
      setCdnFiles((prev) => prev.filter((f) => f.noteId !== noteId && f.id !== noteId));
      await api.purgeNoteCdn(noteId);
      alert(`✅ Edge CDN cache successfully purged for Note ID: ${noteId}`);
      loadCdnStats();
      loadCdnFiles();
    } catch (err) {
      alert("Purge failed: " + err.message);
      loadCdnFiles();
    }
  };

  const handleSaveRetention = async (overrideDays) => {
    const daysToSave = typeof overrideDays === "number" ? overrideDays : retentionDays;
    try {
      await api.setCdnRetention(daysToSave);
      setRetentionDays(daysToSave);
      const label = daysToSave >= 365 ? "365 days (1 Full Year 🌟)" : `${daysToSave} days`;
      alert(`✅ Edge CDN Cache retention set to ${label}!`);
      loadCdnStats();
    } catch (err) {
      alert("Failed to update retention: " + err.message);
    }
  };

  const handleSystemCleanup = async () => {
    try {
      setCleaningUp(true);
      const res = await api.cleanupSystem();
      alert(`✅ ${res.message}`);
      loadSystemMemory();
      loadHardwareInfo();
      loadStats();
    } catch (err) {
      alert("Cleanup failed: " + err.message);
    } finally {
      setCleaningUp(false);
    }
  };

  const handleTestSmtp = async () => {
    try {
      setTestingSmtp(true);
      const res = await api.testSmtp();
      alert("✅ " + res.message);
      loadSoftwareInfo();
    } catch (err) {
      alert("SMTP test notice: " + err.message);
    } finally {
      setTestingSmtp(false);
    }
  };

  // Platform Maintenance Mode Handlers
  const handleToggleMaintenanceMode = async (forceState) => {
    try {
      setMaintenanceLoading(true);
      setMaintenanceFeedback("");
      const nextActive = typeof forceState === "boolean" ? forceState : !maintenanceMode;
      const payload = {
        active: nextActive,
        title: maintenanceTitle.trim() || "Scheduled System Upgrade in Progress",
        message: maintenanceMessage.trim() || "We are currently performing scheduled platform upgrades. Free Study Material will be back online shortly!",
        estimatedEnd: maintenanceEstimatedEnd.trim() || "",
      };

      // 1. Primary API call (via Edge router)
      const res = await api.toggleMaintenanceMode(payload);

      if (res && res.success) {
        setMaintenanceMode(Boolean(res.maintenanceMode));
        if (typeof onMaintenanceChange === "function") {
          onMaintenanceChange({
            active: Boolean(res.maintenanceMode),
            title: payload.title,
            message: payload.message,
            estimatedEnd: payload.estimatedEnd,
          });
        }
        setMaintenanceFeedback(res.message || (nextActive ? "✅ Maintenance Mode ACTIVATED Across All 3 Servers (Teeno Servers Connected)" : "✅ Platform Live Across All 3 Servers"));
      }
    } catch (err) {
      alert("Failed to toggle maintenance mode: " + err.message);
    } finally {
      setMaintenanceLoading(false);
    }
  };

  const handleUpdateMaintenanceNotice = async () => {
    try {
      setMaintenanceLoading(true);
      setMaintenanceFeedback("");
      const payload = {
        active: maintenanceMode,
        title: maintenanceTitle.trim() || "Scheduled System Upgrade in Progress",
        message: maintenanceMessage.trim() || "We are currently performing scheduled platform upgrades. Free Study Material will be back online shortly!",
        estimatedEnd: maintenanceEstimatedEnd.trim() || "",
      };

      // 1. Primary API call
      const res = await api.toggleMaintenanceMode(payload);

      if (res && res.success) {
        if (typeof onMaintenanceChange === "function") {
          onMaintenanceChange({
            active: Boolean(res.maintenanceMode),
            title: payload.title,
            message: payload.message,
            estimatedEnd: payload.estimatedEnd,
          });
        }
        setMaintenanceFeedback("✅ Maintenance banner details updated & synced across ALL 3 Servers!");
      }
    } catch (err) {
      alert("Failed to update notice: " + err.message);
    } finally {
      setMaintenanceLoading(false);
    }
  };

  // 🛠️ Pure English Server Maintenance Mode Control Card (Tab 10 - Tech Controls)
  const renderMaintenanceControlCard = (locationTag = "Tab 10") => (
    <div
      style={{
        background: maintenanceMode
          ? "linear-gradient(135deg, rgba(239, 68, 68, 0.16) 0%, rgba(245, 158, 11, 0.12) 100%)"
          : "linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 182, 212, 0.08) 100%)",
        border: maintenanceMode ? "2px solid rgba(239, 68, 68, 0.6)" : "1.5px solid rgba(16, 185, 129, 0.35)",
        borderRadius: "var(--radius-lg)",
        padding: "18px 20px",
        marginBottom: "18px",
        boxShadow: maintenanceMode ? "0 8px 30px rgba(239, 68, 68, 0.22)" : "0 6px 24px rgba(0, 0, 0, 0.35)",
        transition: "all 0.3s ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              background: maintenanceMode ? "rgba(239, 68, 68, 0.25)" : "rgba(16, 185, 129, 0.2)",
              color: maintenanceMode ? "#f87171" : "#34d399",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: maintenanceMode ? "0 0 16px rgba(239, 68, 68, 0.35)" : "none",
              flexShrink: 0,
            }}
          >
            {maintenanceMode ? <ShieldAlert size={24} /> : <ShieldCheck size={24} />}
          </div>
          <div>
            <div style={{ fontSize: "1.08rem", fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span>Server Maintenance Mode (Emergency Server Maintenance Control)</span>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  padding: "3px 9px",
                  borderRadius: "999px",
                  background: maintenanceMode ? "#fef2f2" : "#ecfdf5",
                  color: maintenanceMode ? "#b91c1c" : "#047857",
                  border: `1.5px solid ${maintenanceMode ? "#fca5a5" : "#a7f3d0"}`,
                }}
              >
                ● {maintenanceMode ? "MAINTENANCE ACTIVE (STUDENTS PAUSED)" : "PLATFORM LIVE (100% PUBLIC ACCESS)"}
              </span>
            </div>
            <div style={{ fontSize: "0.78rem", color: "#334155", fontWeight: 500, marginTop: "3px" }}>
              One-click platform shield: pauses student traffic with a professional maintenance screen while keeping Render, LibSQL, MTProto, and Admin Studio 100% operational in the background.
            </div>
          </div>
        </div>

        {/* Master 1-Click Action Button */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            onClick={() => handleToggleMaintenanceMode()}
            disabled={maintenanceLoading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              borderRadius: "10px",
              fontWeight: 800,
              fontSize: "0.88rem",
              cursor: maintenanceLoading ? "not-allowed" : "pointer",
              border: "none",
              color: "#fff",
              background: maintenanceMode
                ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                : "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
              boxShadow: maintenanceMode
                ? "0 4px 16px rgba(16, 185, 129, 0.4)"
                : "0 4px 16px rgba(239, 68, 68, 0.4)",
              transition: "all 0.2s ease",
            }}
          >
            <Power size={16} className={maintenanceLoading ? "spinner" : ""} />
            <span>
              {maintenanceLoading
                ? "Switching..."
                : maintenanceMode
                ? "🟢 TURN OFF MAINTENANCE (GO LIVE)"
                : "🔒 ACTIVATE MAINTENANCE MODE"}
            </span>
          </button>
        </div>
      </div>

      {/* Quick Safety Info Pills */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "10px", marginBottom: "14px" }}>
        <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: "10px", padding: "12px 14px", boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)" }}>
          <div style={{ fontSize: "0.72rem", color: "#0284c7", fontWeight: 800, textTransform: "uppercase" }}>🛡️ Admin Studio Bypass</div>
          <div style={{ fontSize: "0.82rem", color: "#0f172a", marginTop: "3px", fontWeight: 700 }}>Unrestricted Admin Access</div>
          <div style={{ fontSize: "0.72rem", color: "#334155", fontWeight: 500, marginTop: "2px" }}>Admins &amp; Half-Admins always pass through via session token</div>
        </div>
        <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: "10px", padding: "12px 14px", boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)" }}>
          <div style={{ fontSize: "0.72rem", color: "#047857", fontWeight: 800, textTransform: "uppercase" }}>⚡ Zero Server Downtime</div>
          <div style={{ fontSize: "0.82rem", color: "#0f172a", marginTop: "3px", fontWeight: 700 }}>Daemon Kept 100% Online</div>
          <div style={{ fontSize: "0.72rem", color: "#334155", fontWeight: 500, marginTop: "2px" }}>Render daemon, Express, MTProto &amp; LibSQL remain connected</div>
        </div>
        <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: "10px", padding: "12px 14px", boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)" }}>
          <div style={{ fontSize: "0.72rem", color: "#b45309", fontWeight: 800, textTransform: "uppercase" }}>🚀 Instant Restoration</div>
          <div style={{ fontSize: "0.82rem", color: "#0f172a", marginTop: "3px", fontWeight: 700 }}>Sub-Second Live Unpause</div>
          <div style={{ fontSize: "0.72rem", color: "#334155", fontWeight: 500, marginTop: "2px" }}>Turning off instantly restores public browsing with zero build delays</div>
        </div>
      </div>

      {/* 🛰️ All 3-Server Cluster Connection & Live Sync Indicator */}
      <div
        style={{
          background: "#f0fdf4",
          border: "1.5px solid #86efac",
          borderRadius: "10px",
          padding: "12px 16px",
          marginBottom: "14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <Wifi size={16} style={{ color: "#059669" }} />
          <span style={{ fontSize: "0.84rem", fontWeight: 800, color: "#065f46" }}>
            All 3 Backend Servers Connected (Teeno Servers Synchronized):
          </span>
          <span style={{ fontSize: "0.74rem", color: "#047857", fontWeight: 600 }}>
            Emergency pause shield is active across all 3 backend instances
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {/* Server #1 Connected */}
          <span
            style={{
              background: "#dcfce7",
              border: "1px solid #86efac",
              color: "#166534",
              padding: "4px 10px",
              borderRadius: "6px",
              fontSize: "0.72rem",
              fontWeight: 800,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
            title={`${BACKEND_CLUSTER_URLS[0] || "Backend 1"} is connected to Maintenance Mode`}
          >
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }}></span>
            Server #1 CONNECTED
          </span>

          {/* Server #2 Connected */}
          <span
            style={{
              background: "#dcfce7",
              border: "1px solid #86efac",
              color: "#166534",
              padding: "4px 10px",
              borderRadius: "6px",
              fontSize: "0.72rem",
              fontWeight: 800,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
            title={`${BACKEND_CLUSTER_URLS[1] || "Backend 2"} is connected to Maintenance Mode`}
          >
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }}></span>
            Server #2 CONNECTED
          </span>

          {/* Server #3 Connected (if 3-node cluster) */}
          {BACKEND_CLUSTER_URLS[2] && (
            <span
              style={{
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.45)",
                color: "#34d399",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "0.72rem",
                fontWeight: 800,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
              title={`${BACKEND_CLUSTER_URLS[2] || "Backend 3"} is connected to Maintenance Mode`}
            >
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }}></span>
              Server #3 CONNECTED
            </span>
          )}
        </div>
      </div>

      {/* Maintenance Customization Drawer */}
      <div style={{ background: "rgba(11, 19, 43, 0.65)", border: "1px solid rgba(255, 255, 255, 0.07)", borderRadius: "10px", padding: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
            <Sliders size={14} style={{ color: "var(--accent-cyan)" }} />
            <span>Maintenance Screen Display Notice (Custom Message for Students)</span>
          </span>
          {maintenanceFeedback && (
            <span style={{ fontSize: "0.72rem", color: "#34d399", fontWeight: 700 }}>
              {maintenanceFeedback}
            </span>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px", marginBottom: "10px" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: "4px", fontWeight: 600 }}>
              Notice Title:
            </label>
            <input
              type="text"
              value={maintenanceTitle}
              onChange={(e) => setMaintenanceTitle(e.target.value)}
              placeholder="e.g. Scheduled System Upgrade in Progress"
              style={{
                width: "100%",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "6px",
                color: "#fff",
                padding: "8px 10px",
                fontSize: "0.78rem",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: "4px", fontWeight: 600 }}>
              Estimated Completion / Return Time:
            </label>
            <input
              type="text"
              value={maintenanceEstimatedEnd}
              onChange={(e) => setMaintenanceEstimatedEnd(e.target.value)}
              placeholder="e.g. 15 minutes, 11:30 PM, or 1 hour"
              style={{
                width: "100%",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "6px",
                color: "#fff",
                padding: "8px 10px",
                fontSize: "0.78rem",
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: "4px", fontWeight: 600 }}>
            Notice Message (Shown on Student Screen):
          </label>
          <textarea
            rows={2}
            value={maintenanceMessage}
            onChange={(e) => setMaintenanceMessage(e.target.value)}
            placeholder="We are currently upgrading server engines and running cloud migrations. Free Study Material will be back online shortly!"
            style={{
              width: "100%",
              background: "rgba(15, 23, 42, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "6px",
              color: "#fff",
              padding: "8px 10px",
              fontSize: "0.78rem",
              resize: "vertical",
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", alignItems: "center" }}>
          <button
            type="button"
            onClick={handleUpdateMaintenanceNotice}
            disabled={maintenanceLoading}
            className="btn-secondary"
            style={{ fontSize: "0.74rem", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <Save size={13} />
            <span>Save Notice Changes</span>
          </button>
        </div>
      </div>
    </div>
  );

  // Database Handlers
  const handleDeleteCollectionDoc = async (docId) => {
    if (!window.confirm(`Move document "${docId}" from "${selectedCollection}" to the Restore Vault?`)) return;
    try {
      const res = await api.deleteDatabaseItem(selectedCollection, docId);
      alert(res.message || "✅ Document safely moved to Restore Vault!");
      loadCollectionItems(selectedCollection);
      loadDatabaseOverview();
      loadRecycleBinItems();
      if (selectedCollection === "notes" && onRefreshNotes) onRefreshNotes();
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  };

  const handleBulkPurgeCollection = async (colName) => {
    if (!window.confirm(`⚠️ Move ALL items in "${colName}" collection to the Restore Vault?\n\nYou can restore them anytime individually or all at once.`)) return;
    try {
      const res = await api.clearDatabaseCollection(colName);
      alert(`✅ ${res.message}`);
      loadCollectionItems(colName);
      loadDatabaseOverview();
      loadRecycleBinItems();
      if (colName === "notes" && onRefreshNotes) onRefreshNotes();
    } catch (err) {
      alert("Bulk purge failed: " + err.message);
    }
  };

  // Restore Vault Handlers
  const handleRestoreItem = async (itemId) => {
    try {
      const res = await api.restoreItem(itemId);
      alert(res.message || "Item restored successfully!");
      setDeletedNoteIds((prev) => {
        const next = new Set(prev);
        const origId = itemId.replace(/^(notes_|users_|notices_)/, "");
        next.delete(itemId);
        next.delete(origId);
        return next;
      });
      loadRecycleBinItems();
      if (onRefreshNotes) onRefreshNotes();
      window.dispatchEvent(new CustomEvent("fsm:notes-updated"));
      loadStudents();
      loadDatabaseOverview();
    } catch (err) {
      alert("Failed to restore item: " + err.message);
    }
  };

  const handlePermanentDeleteItem = async (itemId) => {
    if (!window.confirm("⚠️ DANGER: Permanently delete this item from the Restore Vault?\n\nThis cannot be undone!")) return;
    try {
      const res = await api.deletePermanentItem(itemId);
      alert(res.message || "Item permanently purged from Restore Vault.");
      loadRecycleBinItems();
      loadDatabaseOverview();
    } catch (err) {
      alert("Failed to purge item: " + err.message);
    }
  };

  const handleRestoreAllItems = async () => {
    if (!window.confirm("♻️ Restore ALL items from Restore Vault back to the live database?")) return;
    try {
      const res = await api.restoreAllItems();
      alert(res.message || "All items restored successfully!");
      setDeletedNoteIds(new Set());
      loadRecycleBinItems();
      if (onRefreshNotes) onRefreshNotes();
      window.dispatchEvent(new CustomEvent("fsm:notes-updated"));
      loadStudents();
      loadDatabaseOverview();
    } catch (err) {
      alert("Failed to restore all items: " + err.message);
    }
  };

  const handlePermanentDeleteAllItems = async () => {
    if (recycleBinItems.length === 0) return;
    if (!window.confirm(`⚠️ PERMANENT PURGE WARNING:\n\nAre you sure you want to permanently delete ALL ${recycleBinItems.length} items from the Restore Vault?\n\nThis will purge them forever and CANNOT be undone!`)) return;
    try {
      setRecycleBinLoading(true);
      const res = await api.deleteAllRecycleBinItems();
      alert(res.message || "Restore Vault successfully emptied!");
      loadRecycleBinItems();
      loadDatabaseOverview();
    } catch (err) {
      alert("Failed to empty Restore Vault: " + err.message);
    } finally {
      setRecycleBinLoading(false);
    }
  };

  const toggleSelectRecycleItem = (id) => {
    setSelectedRecycleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleBatchRestore = async () => {
    if (selectedRecycleIds.length === 0) return;
    if (!window.confirm(`Restore ${selectedRecycleIds.length} selected items back to live database?`)) return;
    try {
      let successCount = 0;
      for (const id of selectedRecycleIds) {
        try {
          await api.restoreItem(id);
          successCount++;
        } catch (_) {}
      }
      alert(`✅ Successfully restored ${successCount} of ${selectedRecycleIds.length} items!`);
      setSelectedRecycleIds([]);
      loadRecycleBinItems();
      if (onRefreshNotes) onRefreshNotes();
      loadStudents();
      loadDatabaseOverview();
    } catch (err) {
      alert("Batch restore error: " + err.message);
    }
  };

  const handleBatchPurge = async () => {
    if (selectedRecycleIds.length === 0) return;
    if (!window.confirm(`⚠️ Permanently purge ${selectedRecycleIds.length} selected items?\n\nThis CANNOT be undone!`)) return;
    try {
      for (const id of selectedRecycleIds) {
        await api.deletePermanentItem(id).catch(() => {});
      }
      alert(`🗑️ Permanently purged ${selectedRecycleIds.length} items!`);
      setSelectedRecycleIds([]);
      loadRecycleBinItems();
      loadDatabaseOverview();
    } catch (err) {
      alert("Batch purge error: " + err.message);
    }
  };

  if (!isOpen) return null;

  // Filter Notes Vault
  const filteredNotes = notes.filter((n) => {
    if (deletedNoteIds.has(n.id)) return false;
    const override = noteOverrides[n.id];
    const currentAllow = override?.allowDownload !== undefined ? override.allowDownload : n.allowDownload;
    const isLocked = currentAllow === false || String(currentAllow) === "false" || currentAllow === 0 || String(currentAllow) === "0";

    if (noteDownloadFilter === "active" && isLocked) return false;
    if (noteDownloadFilter === "locked" && !isLocked) return false;

    const q = adminNoteSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      (n.title || "").toLowerCase().includes(q) ||
      (n.subject || "").toLowerCase().includes(q) ||
      (n.branch || "").toLowerCase().includes(q) ||
      (n.course || "").toLowerCase().includes(q) ||
      (n.id || "").toLowerCase().includes(q)
    );
  });

  // Calculate download stats across all vault notes
  const activeDownloadsCount = notes.filter((n) => {
    if (deletedNoteIds.has(n.id)) return false;
    const override = noteOverrides[n.id];
    const currentAllow = override?.allowDownload !== undefined ? override.allowDownload : n.allowDownload;
    return !(currentAllow === false || String(currentAllow) === "false" || currentAllow === 0 || String(currentAllow) === "0");
  }).length;

  const totalActiveNotesCount = notes.filter((n) => !deletedNoteIds.has(n.id)).length;
  const lockedDownloadsCount = Math.max(0, totalActiveNotesCount - activeDownloadsCount);

  // Filter Recycle Bin Items
  const filteredRecycleItems = recycleBinItems.filter((item) => {
    const col = (item.collectionName || item.originalCollection || "").toLowerCase();
    const id = String(item.id || item.originalId || "");
    const tl = String(item.typeLabel || "").toLowerCase();

    let itemType = "notes";
    if (col === "users" || col === "students" || id.startsWith("users_") || tl.includes("student") || tl.includes("user") || item.email || item.rollNumber) {
      itemType = "users";
    } else if (col === "notices" || id.startsWith("notices_") || tl.includes("notice")) {
      itemType = "notices";
    } else {
      itemType = "notes";
    }

    if (recycleFilter === "notes" && itemType !== "notes") return false;
    if (recycleFilter === "users" && itemType !== "users") return false;
    if (recycleFilter === "notices" && itemType !== "notices") return false;

    const q = recycleSearch.toLowerCase().trim();
    if (!q) return true;
    const name = item.title || item.name || item.originalName || item.id || "";
    const subject = item.subject || item.email || item.branch || item.content || item.description || "";
    return name.toLowerCase().includes(q) || subject.toLowerCase().includes(q);
  });

  const tabProps = {
    DASHBOARD_TABS,
    activeDownloadsCount,
    activities,
    activitiesLoading,
    adminNoteSearch,
    botLoading,
    botSaveMessage,
    botSaving,
    botSettings,
    botStats,
    botTesting,
    bulkDownloadLoading,
    cdnFiles,
    cdnSearch,
    cdnStats,
    chatAttachment,
    chatBotActionMsg,
    chatBotLoading,
    chatBotSaving,
    chatBotSettings,
    chatFileInputRef,
    chatInputText,
    chatLoading,
    chatMessages,
    chatNoticeText,
    chatOnlineCount,
    chatRooms,
    chatScrollRef,
    chatSending,
    chatTelemetry,
    chatWsConnected,
    cleaningUp,
    collectionItems,
    collectionLoading,
    currentAllowNotesDownload,
    currentNotice,
    dbOverview,
    dbRetentionDays,
    downloadGateLoading,
    filteredNotes,
    filteredRecycleItems,
    formatChatTime,
    formatSyncTime,
    getChatUserColor,
    handleAdjustStudentPurgeDays,
    handleAdjustStudentPurgeDaysByQuery,
    handleAdminBlockChatStudent,
    handleAdminCreatePod,
    handleAdminDeleteMessage,
    handleAdminPurgeRoom,
    handleAdminSendMessage,
    handleAdminUpdateNotice,
    handleBatchPurge,
    handleBatchRestore,
    handleBulkPurgeCollection,
    handleBulkToggleDownload,
    handleClearAllActivities,
    handleDeleteActivity,
    handleDeleteAllStudents,
    handleDeleteCollectionDoc,
    handleDeleteNote,
    handleDeleteSingleAudit,
    handleDeleteStudent,
    handlePermanentDeleteAllItems,
    handlePermanentDeleteItem,
    handlePrewarmPopular,
    handlePruneRetentionMessages,
    handlePurgeCdn,
    handlePurgeDiskOnly,
    handlePurgeEdgeOnly,
    handlePurgeInactivePods,
    handlePurgeMemoryCache,
    handlePurgeNoteCdn,
    handlePurgeRamOnly,
    handlePurgeSingleCdnFile,
    handlePurgeSingleDiskFile,
    handleRestoreAllItems,
    handleRestoreItem,
    handleRunInactivityPurge,
    handleRunSecurityBugScan,
    handleSaveRetention,
    handleSaveTopicRouting,
    handleStartEditNote,
    handleSystemCleanup,
    handleTelegramSync,
    handleTestAllTopics,
    handleTestBotAlert,
    handleTestChatBotPing,
    handleTestSmtp,
    handleToggleBlock,
    handleToggleBotSetting,
    handleToggleCompleteNotesDownload,
    handleToggleNoteDownload,
    handleToggleTechSetting,
    handleToggleVisibility,
    handleTursoPruneAudits,
    handleTursoPruneCache,
    handleTursoPruneMessages,
    handleTursoRefreshCache,
    handleTursoSync,
    handleUpdateGlobalInactivityDays,
    handleUpdateRetention: handleSaveRetention,
    handleUpdateTechValue,
    hardwareInfo,
    hardwareLoading,
    isHalfAdmin,
    isUpdatingNotice,
    lastSyncInfo,
    loadAdminChat,
    loadChatBotTelemetry,
    loadCollectionItems,
    loadHardwareInfo,
    loadSecurityBotSettings,
    loadSoftwareInfo,
    loadStudentActivities,
    loadStudents,
    loadTechNexus,
    loadTursoAudits,
    loadTursoData,
    loadUploadPipelines,
    lockedDownloadsCount,
    maintenanceMode,
    manualNoteIdToPurge,
    newPodName,
    newPodSecret,
    noteDownloadFilter,
    noteOverrides,
    notes,
    pipelineLoading,
    pipelineSummary,
    purgeStudentDays,
    purgeStudentLoading,
    purgeStudentQuery,
    recycleBinItems,
    recycleBinLoading,
    recycleFilter,
    recycleSearch,
    renderMaintenanceControlCard,
    retentionDays,
    saveChatBotSettings,
    saveTechSettings,
    securityScanReport,
    securityScanning,
    selectedChatRoomId,
    selectedCollection,
    selectedRecycleIds,
    selectedStudentForActivity,
    setActiveTab,
    setAdminNoteSearch,
    setBotSettings,
    setCdnSearch,
    setChatAttachment,
    setChatBotSettings,
    setChatInputText,
    setChatNoticeText,
    setEditingStudent,
    setManualNoteIdToPurge,
    setNewPodName,
    setNewPodSecret,
    setNoteDownloadFilter,
    setPreviewNoteInAdmin,
    setPurgeStudentDays,
    setPurgeStudentQuery,
    setRecycleFilter,
    setRecycleSearch,
    setRetentionDays,
    setSelectedChatRoomId,
    setSelectedCollection,
    setSelectedRecycleIds,
    setShowAllCdnFiles,
    setShowChatBotPanel,
    setShowCreatePodModal,
    setShowDeleteAllModal,
    setShowNoticeEditor,
    setStudentPage,
    setStudentSearch,
    setTechActionMsg,
    setTechSettings,
    setTursoActionMsg,
    setTursoAuditSearch,
    setTursoCachePruneDays,
    setTursoCacheTarget,
    setTursoPruneDays,
    setVaultRetentionDays,
    showAllCdnFiles,
    showChatBotPanel,
    showCreatePodModal,
    showNoticeEditor,
    softwareInfo,
    softwareLoading,
    ssdDiskStats,
    stats,
    studentPage,
    studentSearch,
    students,
    studentsError,
    studentsLoading,
    studentsTotal,
    studentsOnlineCount,
    syncingTelegram,
    techActionMsg,
    techLoading,
    techSaving,
    techSettings,
    techTelemetry,
    testingSmtp,
    toggleSelectRecycleItem,
    tursoActionMsg,
    tursoAuditSearch,
    tursoAudits,
    tursoAuditsLoading,
    tursoCachePruneDays,
    tursoCachePruning,
    tursoCacheTarget,
    tursoLoading,
    tursoPruneDays,
    tursoPruning,
    tursoRefreshing,
    tursoStatus,
    tursoSyncing,
    uploadPipelines,
    vaultRetentionDays,
  };

  /**
   * Switches active admin module and triggers its telemetry refresh loaders.
   */
  const selectAdminTab = (tabId) => {
    setActiveTab(tabId);
    setQuickJumpOpen(false);
    setQuickJumpQuery("");
    if (tabId === "students") {
      setSelectedStudentForActivity(null);
      loadStudents(studentPage, studentSearch);
    } else if (tabId === "hardware") {
      loadHardwareInfo();
    } else if (tabId === "software") {
      loadSoftwareInfo();
    } else if (tabId === "pipeline") {
      loadUploadPipelines();
    } else if (tabId === "performance") {
      loadCdnStats();
      loadCdnFiles();
      loadSystemMemory();
    } else if (tabId === "database") {
      loadDatabaseOverview();
    } else if (tabId === "recycle_bin") {
      loadRecycleBinItems();
    } else if (tabId === "security_bot") {
      loadSecurityBotSettings();
    } else if (tabId === "tech_nexus") {
      loadTechNexus();
    } else if (tabId === "community_chat") {
      loadAdminChat();
      loadChatBotTelemetry();
    } else if (tabId === "turso") {
      loadTursoData();
      loadTursoAudits();
    }
  };

  const getTabBadgeText = (tabId) => {
    if (tabId === "notes") return `${notes.filter((n) => !deletedNoteIds.has(n.id)).length}`;
    if (tabId === "students") return `${studentsTotal || stats?.totalStudents || 0}`;
    if (tabId === "hardware") return "Live";
    if (tabId === "pipeline") {
      return `${uploadPipelines.filter((p) => p.status === "processing" || (p.currentStage && p.currentStage < 6)).length}`;
    }
    if (tabId === "recycle_bin") return `${recycleBinItems.length}`;
    if (tabId === "security_bot") return botSettings?.enableOtp ? "Live" : "Paused";
    if (tabId === "tech_nexus") return techTelemetry?.meshOnline ? "Mesh" : "Active";
    if (tabId === "community_chat") return chatOnlineCount > 0 ? `${chatOnlineCount}` : "Live";
    if (tabId === "turso") return tursoStatus?.connected ? (tursoStatus?.isCloud ? "Cloud" : "Standby") : "";
    return "";
  };

  const activeTabMeta = VISIBLE_TABS.find((t) => t.id === activeTab) || VISIBLE_TABS[0];
  const filteredQuickJumpTabs = VISIBLE_TABS.filter((t) => {
    const q = quickJumpQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      t.label.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      (t.group || "").toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
    );
  });

  const quickJumpGroups = ["Core Workspace", "Cloud & Infra", "Data & Realtime", "Security & AI"]
    .map((groupName) => ({
      groupName,
      items: filteredQuickJumpTabs.filter((t) => t.group === groupName),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="modal-overlay admin-modal-overlay-wrap" onClick={onClose} style={{ zIndex: 10000 }}>
      <div
        className="modal-content admin-modal-container"
        style={{
          maxWidth: "min(1480px, 98vw)",
          width: "98vw",
          height: "95vh",
          display: "flex",
          flexDirection: "column",
          padding: "0",
          overflow: "hidden",
          borderRadius: "18px",
          background: "#ffffff",
          border: "1.5px solid #cbd5e1",
          boxShadow: "0 25px 70px -15px rgba(15, 23, 42, 0.16)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Executive Header */}
        <div
          className="admin-modal-header"
          style={{
            padding: "14px 24px",
            background: "#ffffff",
            borderBottom: "1.5px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)",
                border: "1.5px solid rgba(56, 189, 248, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                boxShadow: "0 4px 14px rgba(79, 70, 229, 0.3)",
                flexShrink: 0,
              }}
            >
              <Shield size={23} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <h2 style={{ fontSize: "1.22rem", fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.02em" }}>
                  Academic Cloud Studio &amp; Control Center
                </h2>
                <span
                  style={{
                    background: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                    color: "#059669",
                    fontSize: "0.68rem",
                    fontWeight: 750,
                    padding: "2px 9px",
                    borderRadius: "999px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
                  {health?.status === "online" ? "LIVE ENGINE v3.2 • ZERO-LATENCY EDGE" : "ONLINE • EDGE SHIELD ACTIVE"}
                </span>
              </div>
              <div className="admin-user-info-row" style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "3px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span>Signed in as: <strong style={{ color: "#0f172a", fontWeight: 700 }}>{currentUser?.name || currentUser?.email}</strong></span>
                {isMainAdmin && (
                  <span style={{ background: "#fef3c7", color: "#92400e", padding: "1px 8px", borderRadius: "6px", fontWeight: 800, fontSize: "0.7rem", border: "1px solid #fde68a" }}>
                    👑 MASTER ADMIN
                  </span>
                )}
                {isHalfAdmin && (
                  <span style={{ background: "#f3e8ff", color: "#6b21a8", padding: "1px 8px", borderRadius: "6px", fontWeight: 700, fontSize: "0.7rem", border: "1px solid #e9d5ff" }}>
                    ⚡ MODERATOR ADMIN
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="adm-header-actions" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setShowKpis((prev) => !prev)}
              className="btn-icon"
              style={{
                width: "38px",
                height: "38px",
                background: showKpis ? "#eff6ff" : "#f8fafc",
                borderRadius: "9px",
                border: `1.5px solid ${showKpis ? "#93c5fd" : "#cbd5e1"}`,
                color: showKpis ? "#2563eb" : "#64748b",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title={showKpis ? "Hide KPIs (Maximize Workspace)" : "Show Global KPIs"}
            >
              <Activity size={16} />
            </button>
            <button
              type="button"
              onClick={handleExportJsonBackup}
              className="adm-header-backup-btn"
              style={{
                height: "38px",
                width: "auto",
                minWidth: "max-content",
                padding: "0 12px",
                background: "#f0fdf4",
                borderRadius: "9px",
                border: "1.5px solid #86efac",
                color: "#16a34a",
                cursor: "pointer",
                display: "inline-flex",
                flexDirection: "row",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.78rem",
                fontWeight: 700,
                whiteSpace: "nowrap",
                flexShrink: 0,
                transition: "all 0.15s ease",
              }}
              title="1-Click JSON Backup: Export entire notes catalog offline (0 Server Load)"
            >
              <Download size={14} style={{ flexShrink: 0, color: "#16a34a" }} />
              <span className="adm-backup-label" style={{ color: "#16a34a", fontWeight: 700, whiteSpace: "nowrap" }}>
                Backup JSON
              </span>
            </button>
            <input
              type="file"
              ref={restoreFileInputRef}
              accept=".json"
              style={{ display: "none" }}
              onChange={handleImportJsonBackup}
            />
            <button
              type="button"
              onClick={() => restoreFileInputRef.current?.click()}
              disabled={jsonImporting}
              className="adm-header-restore-btn"
              style={{
                height: "38px",
                width: "auto",
                minWidth: "max-content",
                padding: "0 12px",
                background: "#f0f9ff",
                borderRadius: "9px",
                border: "1.5px solid #7dd3fc",
                color: "#0284c7",
                cursor: "pointer",
                display: "inline-flex",
                flexDirection: "row",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.78rem",
                fontWeight: 700,
                whiteSpace: "nowrap",
                flexShrink: 0,
                transition: "all 0.15s ease",
              }}
              title="Restore / Import Notes Catalog from offline JSON backup"
            >
              <Upload size={14} style={{ flexShrink: 0, color: "#0284c7" }} />
              <span className="adm-restore-label" style={{ color: "#0284c7", fontWeight: 700, whiteSpace: "nowrap" }}>
                {jsonImporting ? "Restoring..." : "Restore JSON"}
              </span>
            </button>
            <button
              onClick={() => {
                loadStats();
                if (activeTab === "notes") onRefreshNotes?.();
                if (activeTab === "students") loadStudents();
                if (activeTab === "hardware") loadHardwareInfo(true);
                if (activeTab === "software") loadSoftwareInfo();
                if (activeTab === "pipeline") loadUploadPipelines();
                if (activeTab === "performance") { loadCdnStats(); loadCdnFiles(); }
                if (activeTab === "database") { loadDatabaseOverview(); loadCollectionItems(); }
                if (activeTab === "recycle_bin") loadRecycleBinItems();
                if (activeTab === "security_bot") loadSecurityBotSettings();
                if (activeTab === "tech_nexus") loadTechNexus();
                if (activeTab === "community_chat") { loadAdminChat(selectedChatRoomId); loadChatBotTelemetry(); }
                if (activeTab === "turso") { loadTursoData(); loadTursoAudits(); }
              }}
              className="btn-icon"
              style={{
                width: "38px",
                height: "38px",
                background: "#f8fafc",
                borderRadius: "9px",
                border: "1.5px solid #cbd5e1",
                color: "#0284c7",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title="Refresh Current Telemetry"
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="modal-close-btn"
              onClick={onClose}
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "9px",
                border: "1.5px solid #fecaca",
                background: "#fef2f2",
                color: "#ef4444",
                cursor: "pointer",
              }}
              title="Close Admin Studio"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Global KPIs Bar (Compact Pure White Studio Telemetry Cards) */}
        {showKpis && (
          <div className="adm-stat-grid admin-kpis-strip">
          <AdminStatCard
            label="Vault Materials"
            badge="CATALOG"
            badgeBg="#eef2ff"
            badgeColor="#4f46e5"
            val={notes.filter((n) => !deletedNoteIds.has(n.id)).length}
            icon={BookOpen}
            iconBg="#eef2ff"
            iconBorder="#c7d2fe"
            iconColor="#4f46e5"
          />
          <AdminStatCard
            label="Verified Students"
            badge="LEARNERS"
            badgeBg="#e0f2fe"
            badgeColor="#0284c7"
            val={studentsTotal || stats?.totalStudents || 0}
            valColor="#0284c7"
            icon={Users}
            iconBg="#e0f2fe"
            iconBorder="#bae6fd"
            iconColor="#0284c7"
          />
          <AdminStatCard
            label="Bandwidth Saved"
            badge="ZERO-COST"
            badgeBg="#ecfdf5"
            badgeColor="#059669"
            val={stats?.formattedSaved && stats.formattedSaved !== "0.00 MB" ? stats.formattedSaved : (cdnStats?.edgeCdn?.totalBandwidthSaved || stats?.formattedSaved || "0.00 MB")}
            valColor="#059669"
            icon={Zap}
            iconBg="#ecfdf5"
            iconBorder="#a7f3d0"
            iconColor="#059669"
          />
          <AdminStatCard
            label="RAM Consumption"
            badge={
              (hardwareInfo?.clusterMemory?.activeNodesCount || 1) > 1
                ? `${hardwareInfo.clusterMemory.activeNodesCount} NODES ACTIVE`
                : (hardwareInfo?.containerMemory?.limitMB ? `${hardwareInfo.containerMemory.usagePercent || 0}% QUOTA` : "1MS CACHE")
            }
            badgeBg="#fffbeb"
            badgeColor="#d97706"
            val={(() => {
              const used = Number(
                hardwareInfo?.containerMemory?.usedMB ??
                hardwareInfo?.containerMemory?.rssMB ??
                hardwareInfo?.v8ProcessMemory?.rssMB ??
                health?.memoryUsageMB ??
                195
              );
              const limit = Number(hardwareInfo?.containerMemory?.limitMB || 512);
              const activeNodes = Number(hardwareInfo?.clusterMemory?.activeNodesCount || 1);

              if (activeNodes > 1 && hardwareInfo?.clusterMemory?.totalClusterLimitMB) {
                const clusterUsed = Number(hardwareInfo.clusterMemory.totalClusterUsedMB || used);
                const clusterLimit = Number(hardwareInfo.clusterMemory.totalClusterLimitMB);
                return `${clusterUsed} / ${clusterLimit} MB`;
              }
              return `${used} / ${limit} MB`;
            })()}
            subVal={(() => {
              const hostGB = hardwareInfo?.memory?.totalGB || "30.65";
              const activeNodes = Number(hardwareInfo?.clusterMemory?.activeNodesCount || 1);
              const totalNodes = Number(hardwareInfo?.clusterMemory?.totalConfiguredNodes || 1);

              if (activeNodes > 1 && hardwareInfo?.clusterMemory?.totalClusterLimitGB) {
                return `Cluster: ${hardwareInfo.clusterMemory.totalClusterLimitGB} GB (${activeNodes} Backends) • Host: ${hostGB} GB`;
              }
              if (totalNodes > 1) {
                return `Node: ${hardwareInfo?.containerMemory?.limitMB || 512} MB • Cluster: ${(totalNodes * 0.5).toFixed(1)} GB Max • Host: ${hostGB} GB`;
              }
              return `Host: ${hostGB} GB Physical • Dynamic Auto-Scale`;
            })()}
            valColor="#d97706"
            icon={Cpu}
            iconBg="#fffbeb"
            iconBorder="#fde68a"
            iconColor="#d97706"
          />
          <AdminStatCard
            label="Edge CDN Cache"
            badge="HIT RATIO"
            badgeBg="#f5f3ff"
            badgeColor="#7c3aed"
            val={cdnStats?.hitRatio ?? "0.0%"}
            valColor="#7c3aed"
            icon={Globe}
            iconBg="#f5f3ff"
            iconBorder="#ddd6fe"
            iconColor="#7c3aed"
          />
        </div>
        )}

        {/* Tab Navigation Strip + Command Launcher Dock */}
        <div
          className="admin-tab-nav-strip"
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#ffffff",
            borderBottom: "1.5px solid #e2e8f0",
            padding: "8px 16px",
            gap: "12px",
            flexWrap: "nowrap",
          }}
        >
          {/* All Dashboard Tabs (Unnumbered Clean Scrollable Pills) */}
          <div
            className="admin-tab-buttons-scroll"
            style={{
              display: "flex",
              gap: "7px",
              flexWrap: "nowrap",
              overflowX: "auto",
              alignItems: "center",
              flex: 1,
              scrollbarWidth: "none",
              paddingBottom: "1px",
            }}
          >
            {VISIBLE_TABS.map((tab) => {
              const isSelected = activeTab === tab.id;
              const badgeText = getTabBadgeText(tab.id);
              const accentColor = tab.accent || "#2563eb";
              const TabIcon = tab.icon || BookOpen;

              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabButtonRefs.current[tab.id] = el;
                  }}
                  type="button"
                  className={`filter-tab ${isSelected ? "active" : ""}`}
                  onClick={() => selectAdminTab(tab.id)}
                  style={{
                    fontSize: "0.78rem",
                    padding: "6px 12px",
                    borderRadius: "10px",
                    whiteSpace: "nowrap",
                    fontWeight: isSelected ? 800 : 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    border: isSelected
                      ? `1.5px solid ${accentColor}`
                      : "1px solid #e2e8f0",
                    background: isSelected
                      ? "#ffffff"
                      : "#f8fafc",
                    color: isSelected ? "#0f172a" : "#475569",
                    boxShadow: isSelected ? `0 2px 10px ${accentColor}25` : "none",
                    transition: "all 0.16s ease",
                    cursor: "pointer",
                  }}
                  title={`${tab.group} • ${tab.title}`}
                >
                  <span
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "6px",
                      background: isSelected ? accentColor : `${accentColor}18`,
                      color: isSelected ? "#ffffff" : accentColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: isSelected ? `0 2px 8px ${accentColor}44` : "none",
                      flexShrink: 0,
                    }}
                  >
                    <TabIcon size={12} />
                  </span>
                  <span style={{ fontWeight: isSelected ? 800 : 600 }}>{tab.label}</span>
                  {badgeText && (
                    <span
                      style={{
                        fontSize: "0.66rem",
                        fontWeight: 800,
                        padding: "1px 6px",
                        borderRadius: "999px",
                        background: isSelected ? `${accentColor}18` : "#f1f5f9",
                        color: isSelected ? accentColor : "#64748b",
                        border: `1px solid ${isSelected ? accentColor : "#cbd5e1"}`,
                      }}
                    >
                      {badgeText}
                    </span>
                  )}
                </button>
              );
            })}

            {selectedStudentForActivity && (
              <button
                type="button"
                className={`filter-tab ${activeTab === "activities" ? "active" : ""}`}
                onClick={() => selectAdminTab("activities")}
                style={{
                  whiteSpace: "nowrap",
                  fontSize: "0.78rem",
                  padding: "6px 12px",
                  borderRadius: "10px",
                  color: "#0f172a",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                📊 Activity: {selectedStudentForActivity.name}
              </button>
            )}
          </div>

          {/* Unique Unnumbered Quick-Jump Command Dock */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              flexShrink: 0,
              background: "#ffffff",
              padding: "3px",
              borderRadius: "11px",
              border: "1.5px solid #cbd5e1",
              boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)",
            }}
          >
            <button
              type="button"
              onClick={slidePrev}
              style={{
                background: "transparent",
                border: "none",
                color: "#475569",
                cursor: "pointer",
                padding: "5px 6px",
                display: "flex",
                alignItems: "center",
                borderRadius: "7px",
              }}
              title="Previous Module (ArrowLeft)"
            >
              <ChevronLeft size={15} />
            </button>

            <button
              type="button"
              className="adm-quickjump-btn"
              onClick={() => setQuickJumpOpen((prev) => !prev)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                padding: "5px 10px",
                borderRadius: "8px",
                border: `1.5px solid ${quickJumpOpen ? "#2563eb" : "#e2e8f0"}`,
                background: quickJumpOpen
                  ? "#eff6ff"
                  : "#f8fafc",
                color: "#0f172a",
                cursor: "pointer",
                fontSize: "0.74rem",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
              title="Open Quick-Jump Module Grid (Ctrl+K or /)"
            >
              <LayoutGrid size={14} style={{ color: activeTabMeta?.accent || "#2563eb" }} />
              <span>Quick Jump</span>
              <span
                style={{
                  fontSize: "0.62rem",
                  padding: "1px 5px",
                  borderRadius: "4px",
                  background: "#e2e8f0",
                  color: "#475569",
                  fontFamily: "var(--font-mono)",
                }}
              >
                ⌘K
              </span>
              <ChevronDown
                size={13}
                style={{
                  color: "#64748b",
                  transform: quickJumpOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.15s ease",
                }}
              />
            </button>

            <button
              type="button"
              onClick={slideNext}
              style={{
                background: "transparent",
                border: "none",
                color: "#475569",
                cursor: "pointer",
                padding: "5px 6px",
                display: "flex",
                alignItems: "center",
                borderRadius: "7px",
              }}
              title="Next Module (ArrowRight)"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Categorized Floating Quick-Jump Command Drawer */}
          {quickJumpOpen && (
            <>
              <div
                onClick={() => setQuickJumpOpen(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(2, 6, 23, 0.45)",
                  zIndex: 90,
                }}
              />
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: "16px",
                  left: "16px",
                  maxWidth: "960px",
                  marginLeft: "auto",
                  zIndex: 100,
                  background: "#ffffff",
                  border: "1.5px solid #cbd5e1",
                  borderRadius: "16px",
                  padding: "14px",
                  boxShadow: "0 25px 60px rgba(15, 23, 42, 0.2)",
                  backdropFilter: "blur(20px)",
                  maxHeight: "min(68vh, 520px)",
                  overflowY: "auto",
                }}
              >
                {/* Search Header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 12px",
                    borderRadius: "10px",
                    background: "#f8fafc",
                    border: "1.5px solid #cbd5e1",
                    marginBottom: "12px",
                  }}
                >
                  <Search size={15} style={{ color: "#2563eb", flexShrink: 0 }} />
                  <input
                    ref={quickJumpInputRef}
                    type="text"
                    value={quickJumpQuery}
                    onChange={(e) => setQuickJumpQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && filteredQuickJumpTabs.length > 0) {
                        selectAdminTab(filteredQuickJumpTabs[0].id);
                      }
                    }}
                    placeholder="Instant jump to module (Notes, Students, Hardware, AI, Turso, Security...)"
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: "#0f172a",
                      fontSize: "0.84rem",
                    }}
                  />
                  {quickJumpQuery && (
                    <button
                      type="button"
                      onClick={() => setQuickJumpQuery("")}
                      style={{
                        background: "#e2e8f0",
                        border: "none",
                        borderRadius: "6px",
                        color: "#475569",
                        fontSize: "0.7rem",
                        padding: "2px 7px",
                        cursor: "pointer",
                      }}
                    >
                      Clear
                    </button>
                  )}
                  <span style={{ fontSize: "0.68rem", color: "#64748b", fontFamily: "var(--font-mono)" }}>
                    ESC
                  </span>
                </div>

                {/* Categorized Grid */}
                {quickJumpGroups.length === 0 ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "0.82rem" }}>
                    No matching modules for "{quickJumpQuery}".
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                      gap: "12px",
                    }}
                  >
                    {quickJumpGroups.map(({ groupName, items }) => (
                      <div
                        key={groupName}
                        style={{
                          background: "#ffffff",
                          border: "1.5px solid #e2e8f0",
                          borderRadius: "12px",
                          padding: "10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            textTransform: "uppercase",
                            letterSpacing: "0.6px",
                            color: "#475569",
                            padding: "0 4px 4px",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          {groupName}
                        </div>

                        {items.map((tab) => {
                          const isSelected = activeTab === tab.id;
                          const badgeText = getTabBadgeText(tab.id);
                          const accentColor = tab.accent || "#2563eb";
                          const TabIcon = tab.icon || BookOpen;

                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => selectAdminTab(tab.id)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "10px",
                                width: "100%",
                                textAlign: "left",
                                padding: "8px 10px",
                                borderRadius: "9px",
                                border: isSelected
                                  ? `1.5px solid ${accentColor}`
                                  : "1px solid #e2e8f0",
                                borderLeft: `3.5px solid ${accentColor}`,
                                background: isSelected
                                  ? "#eff6ff"
                                  : "#f8fafc",
                                color: isSelected ? "#0f172a" : "#334155",
                                fontSize: "0.79rem",
                                fontWeight: isSelected ? 800 : 600,
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                                <div
                                  style={{
                                    width: "26px",
                                    height: "26px",
                                    borderRadius: "7px",
                                    background: isSelected ? accentColor : `${accentColor}18`,
                                    color: isSelected ? "#ffffff" : accentColor,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxShadow: isSelected ? `0 2px 8px ${accentColor}44` : "none",
                                    flexShrink: 0,
                                  }}
                                >
                                  <TabIcon size={13} />
                                </div>
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {tab.label}
                                </span>
                              </div>
                              {badgeText && (
                                <span
                                  style={{
                                    fontSize: "0.66rem",
                                    fontWeight: 800,
                                    padding: "2px 7px",
                                    borderRadius: "999px",
                                    background: `${accentColor}18`,
                                    color: accentColor,
                                    border: `1px solid ${accentColor}55`,
                                    flexShrink: 0,
                                  }}
                                >
                                  {badgeText}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Dynamic Tab Body */}
        <div className="admin-tab-body" style={{ flex: 1, overflowY: "auto", padding: "18px 24px", position: "relative" }}>
          {/* Active Module HUD Command Banner */}
          <div
            className="adm-hud-banner"
            style={{
              padding: "14px 18px",
              borderRadius: "14px",
              background: "#ffffff",
              border: "1.5px solid #e2e8f0",
              borderLeft: `4px solid ${activeTabMeta?.accent || "#2563eb"}`,
              boxShadow: "0 2px 10px rgba(15, 23, 42, 0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "18px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "12px",
                  background: `${activeTabMeta?.accent || "#2563eb"}15`,
                  border: `1.5px solid ${activeTabMeta?.accent || "#2563eb"}44`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: activeTabMeta?.accent || "#2563eb",
                  boxShadow: `0 2px 10px ${activeTabMeta?.accent || "#2563eb"}25`,
                  flexShrink: 0,
                }}
              >
                {(() => {
                  const ActiveIcon = activeTabMeta?.icon || BookOpen;
                  return <ActiveIcon size={21} />;
                })()}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0, fontSize: "1.08rem", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.01em" }}>
                    {activeTabMeta?.title || activeTabMeta?.label}
                  </h3>
                  <span
                    style={{
                      fontSize: "0.64rem",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.6px",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: `${activeTabMeta?.accent || "#2563eb"}18`,
                      color: activeTabMeta?.accent || "#2563eb",
                      border: `1px solid ${activeTabMeta?.accent || "#2563eb"}55`,
                    }}
                  >
                    {activeTabMeta?.group || "SYSTEM MODULE"}
                  </span>
                </div>
                <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#334155", fontWeight: 500, lineHeight: 1.4 }}>
                  {activeTabMeta?.desc || "Active enterprise telemetry and control surface"}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  loadStats();
                  if (activeTab === "notes") onRefreshNotes?.();
                  if (activeTab === "students") loadStudents();
                  if (activeTab === "hardware") loadHardwareInfo(true);
                  if (activeTab === "software") loadSoftwareInfo();
                  if (activeTab === "pipeline") loadUploadPipelines();
                  if (activeTab === "performance") { loadCdnStats(); loadCdnFiles(); }
                  if (activeTab === "database") { loadDatabaseOverview(); loadCollectionItems(); }
                  if (activeTab === "recycle_bin") loadRecycleBinItems();
                  if (activeTab === "security_bot") loadSecurityBotSettings();
                  if (activeTab === "tech_nexus") loadTechNexus();
                  if (activeTab === "community_chat") { loadAdminChat(selectedChatRoomId); loadChatBotTelemetry(); }
                  if (activeTab === "turso") { loadTursoData(); loadTursoAudits(); }
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 13px",
                  borderRadius: "8px",
                  background: "#f8fafc",
                  border: "1.5px solid #cbd5e1",
                  color: "#0f172a",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                title="Refresh Current Module Telemetry"
              >
                <RefreshCw size={13} style={{ color: activeTabMeta?.accent || "#2563eb" }} />
                <span>Refresh Module</span>
              </button>

              <button
                type="button"
                onClick={() => setQuickJumpOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 12px",
                  borderRadius: "8px",
                  background: "#eff6ff",
                  border: "1.5px solid #bfdbfe",
                  color: "#1d4ed8",
                  fontSize: "0.75rem",
                  fontWeight: 750,
                  cursor: "pointer",
                }}
                title="Quick Switch Module (Ctrl+K or /)"
              >
                <Search size={13} style={{ color: "#2563eb" }} />
                <span>Quick Jump (⌘K)</span>
              </button>
            </div>
          </div>
          <Suspense fallback={<AdminModuleFallback />}>
            {activeTab === "notes" && <TabNotes {...tabProps} />}
            {activeTab === "students" && <TabStudents {...tabProps} />}
            {activeTab === "hardware" && <TabHardware {...tabProps} />}
            {activeTab === "software" && <TabSoftware {...tabProps} />}
            {activeTab === "pipeline" && <TabPipeline {...tabProps} />}
            {activeTab === "performance" && <TabPerformance {...tabProps} />}
            {activeTab === "database" && <TabDatabase {...tabProps} />}
            {activeTab === "recycle_bin" && <TabRestoreVault {...tabProps} />}
            {activeTab === "security_bot" && <TabSecurityBot {...tabProps} />}
            {activeTab === "tech_nexus" && <TabTechNexus {...tabProps} />}
            {activeTab === "community_chat" && <TabCommunityChat {...tabProps} />}
            {activeTab === "turso" && <TabTurso {...tabProps} />}
            {activeTab === "help_desk" && <TabHelpDesk {...tabProps} />}
            {activeTab === "web_security" && <TabWebSecurity {...tabProps} />}
            {activeTab === "notices_board" && <TabNotices {...tabProps} currentUser={currentUser} />}
            {activeTab === "ai_engine" && <TabAiEngine {...tabProps} currentUser={currentUser} />}
            {activeTab === "activities" && (
              selectedStudentForActivity ? (
                <TabActivities {...tabProps} />
              ) : (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-dim)" }}>
                  <div style={{ fontSize: "2rem", marginBottom: "12px" }}>📊</div>
                  <h4 style={{ color: "#0f172a", marginBottom: "8px" }}>Student Activity & Session Inspector</h4>
                  <p style={{ fontSize: "0.85rem", maxWidth: "460px", margin: "0 auto 16px auto" }}>
                    Please select a student from the <strong>Students</strong> tab (click the ⚡ Activity icon on any student row) to inspect their active devices, termination options, and security history.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("students")}
                    className="btn-primary"
                    style={{ padding: "8px 18px", fontSize: "0.84rem" }}
                  >
                    Go to Students Directory
                  </button>
                </div>
              )
            )}
          </Suspense>
        </div>

        {/* SUB-MODAL 1: Mozilla PDF Reader Document Preview Overlay */}
        {previewNoteInAdmin && (
          <div
            className="modal-overlay"
            onClick={() => setPreviewNoteInAdmin(null)}
            style={{ padding: "12px", zIndex: 1200 }}
          >
            <div
              className="modal-content"
              style={{
                maxWidth: "1050px",
                width: "95vw",
                height: "90vh",
                display: "flex",
                flexDirection: "column",
                padding: "0",
                overflow: "hidden",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                boxShadow: "0 24px 64px rgba(0, 0, 0, 0.7)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Suspense fallback={<AdminModuleFallback label="Loading PDF Reader..." />}>
                <VirtualPdfReader
                  url={api.getStreamUrl(previewNoteInAdmin.id, getNotePdfFileName(previewNoteInAdmin))}
                  title={previewNoteInAdmin.title || previewNoteInAdmin.fileName || "Vault Document"}
                  subject={previewNoteInAdmin.subject || "Academic Vault"}
                  noteId={previewNoteInAdmin.id}
                  note={previewNoteInAdmin}
                  onClose={() => setPreviewNoteInAdmin(null)}
                  onDownload={() => {
                    const pdfName = getNotePdfFileName(previewNoteInAdmin);
                    api.downloadNoteWithProgress(previewNoteInAdmin.id, pdfName).catch(() => {
                      window.open(api.getDownloadUrl(previewNoteInAdmin.id, pdfName), "_blank");
                    });
                  }}
                />
              </Suspense>
            </div>
          </div>
        )}

        {/* SUB-MODAL 2: Edit Note Modal */}
        <AdminSubModal
          isOpen={Boolean(editingNote)}
          onClose={() => setEditingNote(null)}
          title="Edit Document Metadata"
          subtitle="Update note titles, subject category, branch and download permissions"
          icon={BookOpen}
          accentColor="#2563eb"
          maxWidth="560px"
        >
          <form onSubmit={handleSaveNoteEdit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="adm-form-group">
              <label className="adm-form-label">Document Title</label>
              <input
                type="text"
                className="adm-form-input"
                value={noteForm.title}
                onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                required
              />
            </div>

            <div className="adm-form-group">
              <label className="adm-form-label">Academic Subject</label>
              <input
                type="text"
                className="adm-form-input"
                value={noteForm.subject}
                onChange={(e) => setNoteForm({ ...noteForm, subject: e.target.value })}
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div className="adm-form-group">
                <label className="adm-form-label">Branch</label>
                <input
                  type="text"
                  className="adm-form-input"
                  value={noteForm.branch}
                  onChange={(e) => setNoteForm({ ...noteForm, branch: e.target.value })}
                  required
                />
              </div>

              <div className="adm-form-group">
                <label className="adm-form-label">Course / Degree</label>
                <input
                  type="text"
                  className="adm-form-input"
                  value={noteForm.course}
                  onChange={(e) => setNoteForm({ ...noteForm, course: e.target.value })}
                />
              </div>
            </div>

            <div className="adm-form-group">
              <label className="adm-form-label">Year / Semester</label>
              <input
                type="text"
                className="adm-form-input"
                value={noteForm.year}
                onChange={(e) => setNoteForm({ ...noteForm, year: e.target.value })}
              />
            </div>

            <div className="adm-form-group">
              <label className="adm-form-label">Description / Tags</label>
              <textarea
                className="adm-form-input"
                rows={3}
                value={noteForm.description}
                onChange={(e) => setNoteForm({ ...noteForm, description: e.target.value })}
              />
            </div>

            {/* Single Note Download Permissions Toggle */}
            <div
              style={{
                padding: "12px",
                borderRadius: "10px",
                background: noteForm.allowDownload ? "#ecfdf5" : "#fef2f2",
                border: `1.5px solid ${noteForm.allowDownload ? "#a7f3d0" : "#fecaca"}`,
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: "0.84rem", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                    {noteForm.allowDownload ? (
                      <>
                        <Download size={15} style={{ color: "#059669" }} />
                        <span>Student PDF Downloads: Enabled</span>
                      </>
                    ) : (
                      <>
                        <Lock size={15} style={{ color: "#dc2626" }} />
                        <span>Student PDF Downloads: Locked / Read-Only</span>
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: "2px" }}>
                    {noteForm.allowDownload
                      ? "Students can download the original PDF file."
                      : "Direct PDF download is locked. Students can only read via the Online Reader."}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setNoteForm((prev) => ({ ...prev, allowDownload: !prev.allowDownload }))}
                  className={`adm-btn-pill ${noteForm.allowDownload ? "danger" : "primary"}`}
                >
                  {noteForm.allowDownload ? "🔒 Pause Downloads" : "🟢 Enable Downloads"}
                </button>
              </div>

              {!noteForm.allowDownload && (
                <div className="adm-form-group" style={{ marginTop: "4px" }}>
                  <label className="adm-form-label" style={{ fontSize: "0.72rem", color: "#dc2626" }}>
                    Notice / Reason Shown to Students (Optional)
                  </label>
                  <input
                    type="text"
                    className="adm-form-input"
                    placeholder="e.g., Downloads paused for this document. Online preview is active."
                    value={noteForm.downloadDisabledReason || ""}
                    onChange={(e) => setNoteForm((prev) => ({ ...prev, downloadDisabledReason: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
              <button type="button" className="adm-btn-pill" onClick={() => setEditingNote(null)}>
                Cancel
              </button>
              <button type="submit" className="adm-btn-pill primary">
                Save Changes
              </button>
            </div>
          </form>
        </AdminSubModal>

        {/* SUB-MODAL 3: Edit Student Modal */}
        <AdminSubModal
          isOpen={Boolean(editingStudent)}
          onClose={() => setEditingStudent(null)}
          title="Edit Student Profile"
          subtitle="Modify learner details, academic department, and security roles"
          icon={UserCheck}
          accentColor="#4f46e5"
          maxWidth="540px"
        >
          {editingStudent && (
              <form onSubmit={handleSaveStudentEdit} style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "14px" }}>
                <div className="form-group">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <label className="form-label" style={{ margin: 0 }}>Student Account Email</label>
                    <span style={{ fontSize: "0.7rem", color: "var(--accent-cyan)", fontWeight: 700 }}>🔒 Primary Account Key</span>
                  </div>
                  <input
                    type="email"
                    className="form-input"
                    value={editingStudent?.email || ""}
                    disabled
                    style={{ opacity: 0.85, cursor: "not-allowed", background: "rgba(255, 255, 255, 0.03)" }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingStudent?.name || ""}
                    onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                    required
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label className="form-label">Mobile Number</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editingStudent?.mobile && !editingStudent.mobile.startsWith("enc_gcm:") && editingStudent.mobile !== "N/A" ? editingStudent.mobile : ""}
                      onChange={(e) => setEditingStudent({ ...editingStudent, mobile: e.target.value })}
                      placeholder="10-digit mobile number"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">College / Institute</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editingStudent?.college || ""}
                      onChange={(e) => setEditingStudent({ ...editingStudent, college: e.target.value })}
                      placeholder="College or University"
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label className="form-label">Branch / Department</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editingStudent?.branch || ""}
                      onChange={(e) => setEditingStudent({ ...editingStudent, branch: e.target.value })}
                      placeholder="e.g. CSE, IT, ME, EE"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Academic Year</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editingStudent?.year || ""}
                      onChange={(e) => setEditingStudent({ ...editingStudent, year: e.target.value })}
                      placeholder="e.g. 1st Year, 2nd Year, 3rd Year"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label className="form-label" style={{ margin: 0 }}>Account Role &amp; Privileges</label>
                    {isMasterAdminUser(editingStudent) && (
                      <span style={{ fontSize: "0.72rem", color: "#fbbf24", fontWeight: 700 }}>
                        👑 Permanent Master Admin
                      </span>
                    )}
                  </div>
                  <select
                    className="form-input"
                    value={editingStudent?.role || "student"}
                    disabled={isMasterAdminUser(editingStudent) || isHalfAdmin}
                    onChange={(e) => {
                      const newRole = e.target.value;
                      let newPerms = ["upload_notes", "download_notes"];
                      let isImmune = false;
                      let days = 90;
                      if (newRole === "admin") {
                        newPerms = ["all", "manage_notes", "manage_users", "manage_notices", "delete_records", "database"];
                        isImmune = true;
                        days = 9999;
                      } else if (newRole === "half_admin") {
                        newPerms = ["manage_notes", "manage_notices", "manage_users"];
                        isImmune = true;
                        days = 9999;
                      }
                      setEditingStudent({
                        ...editingStudent,
                        role: newRole,
                        permissions: newPerms,
                        neverPurge: isImmune,
                        customInactivityDays: days,
                      });
                    }}
                    style={{
                      borderColor:
                        editingStudent?.role === "admin"
                          ? "rgba(245, 158, 11, 0.5)"
                          : editingStudent?.role === "half_admin"
                          ? "rgba(168, 85, 247, 0.5)"
                          : "rgba(255, 255, 255, 0.15)",
                      background:
                        editingStudent?.role === "admin"
                          ? "rgba(245, 158, 11, 0.08)"
                          : editingStudent?.role === "half_admin"
                          ? "rgba(168, 85, 247, 0.08)"
                          : "rgba(255, 255, 255, 0.03)",
                    }}
                  >
                    <option value="student">🎓 Student (Standard - Notes Access &amp; Uploads)</option>
                    <option value="half_admin">⚡ Half Admin (Edit &amp; Manage - Database Restricted)</option>
                    <option value="admin">👑 Full Administrator (Super Admin - All 8 Tabs &amp; Database Studio)</option>
                  </select>

                  {/* Dynamic Role Capability Legend */}
                  <div style={{ marginTop: "8px", fontSize: "0.75rem", lineHeight: 1.45, padding: "8px 12px", borderRadius: "8px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                    {editingStudent?.role === "admin" ? (
                      <span style={{ color: "#fbbf24" }}>
                        👑 <strong>Full Administrator:</strong> Complete platform control. All 8 tabs, direct Google Firestore Database Studio (Tab 7), DB JSON export, and permanent database purge.
                      </span>
                    ) : editingStudent?.role === "half_admin" ? (
                      <span style={{ color: "#c084fc" }}>
                        ⚡ <strong>Half Admin (Sub-Admin):</strong> Can edit/manage notes, student accounts, block/unblock, and view telemetry. <strong>Database Studio (Tab 7) is 100% blocked</strong> to protect raw data.
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-dim)" }}>
                        🎓 <strong>Student (Standard / Revoked):</strong> Standard user permissions. Can view and download approved notes and upload study materials. Admin dashboard access is revoked.
                      </span>
                    )}
                  </div>

                  {/* 🛡️ Admin Tab Access Control Checkbox Panel */}
                  {(editingStudent?.role === "admin" || editingStudent?.role === "half_admin") && (
                    <div
                      style={{
                        marginTop: "12px",
                        background: "rgba(6, 182, 212, 0.05)",
                        border: "1px solid rgba(6, 182, 212, 0.25)",
                        borderRadius: "8px",
                        padding: "12px 14px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "8px",
                          flexWrap: "wrap",
                          gap: "6px",
                        }}
                      >
                        <label style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--accent-cyan)", margin: 0 }}>
                          🛡️ Admin Tab Access Control (Check allowed tabs)
                        </label>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            type="button"
                            onClick={() => {
                              const allIds = DASHBOARD_TABS.map((t) => t.id);
                              setEditingStudent({ ...editingStudent, allowedTabs: allIds });
                            }}
                            style={{
                              padding: "2px 8px",
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              background: "rgba(6, 182, 212, 0.2)",
                              color: "#38bdf8",
                              border: "1px solid rgba(6, 182, 212, 0.4)",
                              borderRadius: "4px",
                              cursor: "pointer",
                            }}
                          >
                            [ All Tabs ]
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStudent({ ...editingStudent, allowedTabs: ["notes"] });
                            }}
                            style={{
                              padding: "2px 8px",
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              background: "rgba(255, 255, 255, 0.06)",
                              color: "#94a3b8",
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                              borderRadius: "4px",
                              cursor: "pointer",
                            }}
                          >
                            [ Clear ]
                          </button>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                          gap: "6px",
                          marginTop: "8px",
                        }}
                      >
                        {DASHBOARD_TABS.map((tab) => {
                          const currentAllowed = Array.isArray(editingStudent?.allowedTabs)
                            ? editingStudent.allowedTabs
                            : DASHBOARD_TABS.map((t) => t.id);
                          const isChecked = currentAllowed.includes(tab.id);

                          return (
                            <label
                              key={tab.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                fontSize: "0.74rem",
                                color: isChecked ? "#fff" : "var(--text-dim)",
                                background: isChecked ? "rgba(6, 182, 212, 0.12)" : "rgba(255, 255, 255, 0.02)",
                                border: `1px solid ${isChecked ? "rgba(6, 182, 212, 0.3)" : "rgba(255, 255, 255, 0.06)"}`,
                                padding: "5px 8px",
                                borderRadius: "5px",
                                cursor: "pointer",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  let updated;
                                  if (e.target.checked) {
                                    updated = [...currentAllowed, tab.id];
                                  } else {
                                    updated = currentAllowed.filter((id) => id !== tab.id);
                                  }
                                  setEditingStudent({ ...editingStudent, allowedTabs: updated });
                                }}
                                style={{ cursor: "pointer" }}
                              />
                              <span style={{ fontWeight: isChecked ? 600 : 400 }}>{tab.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Inactivity & Auto-Purge Days Control */}
                <div className="form-group" style={{ background: "rgba(0,0,0,0.25)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label className="form-label" style={{ margin: 0, fontWeight: 700 }}>⏳ Inactivity &amp; Account Purge Limit</label>
                    <label style={{ fontSize: "0.72rem", color: "#34d399", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontWeight: 700 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(editingStudent?.neverPurge || (editingStudent?.customInactivityDays && editingStudent.customInactivityDays >= 9999))}
                        onChange={(e) => {
                          const immune = e.target.checked;
                          setEditingStudent((prev) => ({
                            ...prev,
                            neverPurge: immune,
                            customInactivityDays: immune ? 9999 : 90,
                          }));
                        }}
                      />
                      🛡️ Permanent Immunity Shield
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "6px" }}>
                    <input
                      type="number"
                      className="form-input"
                      disabled={Boolean(editingStudent?.neverPurge || (editingStudent?.customInactivityDays && editingStudent.customInactivityDays >= 9999))}
                      value={editingStudent?.neverPurge ? 9999 : (editingStudent?.customInactivityDays || 90)}
                      onChange={(e) => setEditingStudent((prev) => ({ ...prev, customInactivityDays: Number(e.target.value) || 90 }))}
                      style={{ width: "90px" }}
                    />
                    <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Days</span>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: "5px 10px", fontSize: "0.74rem" }}
                      disabled={Boolean(editingStudent?.neverPurge)}
                      onClick={() => setEditingStudent((prev) => ({ ...prev, customInactivityDays: (prev?.customInactivityDays || 90) + 15 }))}
                    >
                      +15 Days
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: "5px 10px", fontSize: "0.74rem" }}
                      disabled={Boolean(editingStudent?.neverPurge)}
                      onClick={() => setEditingStudent((prev) => ({ ...prev, customInactivityDays: Math.max(1, (prev?.customInactivityDays || 90) - 15) }))}
                    >
                      -15 Days
                    </button>
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "6px" }}>
                    Accounts with 0 logins beyond this limit are safely archived &amp; purged.
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                  <button type="button" className="adm-btn-pill" onClick={() => setEditingStudent(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="adm-btn-pill primary">
                    Save Profile
                  </button>
                </div>
              </form>
          )}
        </AdminSubModal>

        {/* SUB-MODAL 4: Delete All Notes Password Confirmation */}
        <AdminSubModal
          isOpen={showDeleteAllModal}
          onClose={() => setShowDeleteAllModal(false)}
          title="Move All Notes to Restore Vault"
          subtitle="Safely soft-delete notes with instant undo restore capability"
          icon={AlertTriangle}
          accentColor="#ef4444"
          maxWidth="460px"
          zIndex={1250}
        >
          <form onSubmit={handleDeleteAllNotesSubmit}>
            <p style={{ fontSize: "0.84rem", color: "#64748b", lineHeight: 1.5, margin: "0 0 14px 0" }}>
              This will safely move all <strong>{notes.length}</strong> study notes to the Restore Vault. They can be restored anytime with zero data loss. Please enter your Administrator password to confirm:
            </p>

            {deleteAllError && (
              <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "8px 12px", borderRadius: "8px", marginBottom: "12px", fontSize: "0.82rem" }}>
                {deleteAllError}
              </div>
            )}

            <div className="adm-form-group">
              <label className="adm-form-label">Admin Password</label>
              <input
                type="password"
                className="adm-form-input"
                placeholder="Enter Admin password..."
                value={deleteAllPassword}
                onChange={(e) => setDeleteAllPassword(e.target.value)}
                required
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
              <button type="button" className="adm-btn-pill" onClick={() => setShowDeleteAllModal(false)}>
                Cancel
              </button>
              <button type="submit" className="adm-btn-pill danger" disabled={deleteAllLoading}>
                {deleteAllLoading ? "Authorizing..." : "Confirm & Move All"}
              </button>
            </div>
          </form>
        </AdminSubModal>
      </div>
    </div>
  );
}
