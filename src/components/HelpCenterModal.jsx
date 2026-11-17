import { useState, useEffect, useRef } from "react";
import { X, HelpCircle, Search, MessageSquare, Send, CheckCircle2, Clock, ChevronDown, ChevronUp, Ticket, User, Mail, Phone, Copy, Check, Lock, Paperclip, FileText, Image as ImageIcon, Film } from "lucide-react";
import { api } from "../api";

const INITIAL_FAQS = [
  {
    id: "faq_1",
    category: "download",
    question: "How do I download PDF notes, or what should I do if a download is paused?",
    answer:
      "Free Study Material employs an autonomous 3-layer resilient failover network. Download requests seamlessly cycle through the Primary Storage Vault, Local Server, and native streaming fallback. If a download pauses, click 'Retry Download' or use 'Online Preview' for instant in-browser reading.",
  },
  {
    id: "faq_2",
    category: "offline",
    question: "How can I access and read notes offline without an active internet connection?",
    answer:
      "Click the 'Save Offline' button next to any study material. The document will be cached securely in your browser's local IndexedDB vault, allowing instant 0ms access even with zero internet connectivity.",
  },
  {
    id: "faq_3",
    category: "passkey",
    question: "How do I set up and use Biometric Passkey (Fingerprint / Face ID) sign-in?",
    answer:
      "After signing in, navigate to your Profile or Security settings and click 'Register Biometric Passkey'. You can then authenticate in sub-second time using Touch ID, Face ID, or Windows Hello without entering passwords.",
  },
  {
    id: "faq_4",
    category: "request_notes",
    question: "How can I request missing syllabus notes or previous year exam papers?",
    answer:
      "Navigate to the 'Ask Question / Request' tab in this Help Center, select 'Request Missing Notes', and provide your Subject Name, University, and Semester. Our academic team curates and uploads verified materials within 24 to 48 hours.",
  },
  {
    id: "faq_5",
    category: "account",
    question: "Is Free Study Material completely free for all college and university students?",
    answer:
      "Yes, 100% free! All handwritten lecture notes, university exam papers, and engineering textbooks are provided with zero subscription fees, zero paywalls, and unlimited access.",
  },
  {
    id: "faq_security_jail",
    category: "security",
    question: "Why was my IP jailed or account blocked, and what are the detention time limits? (IP Jail Policy)",
    answer:
      "Free Study Material utilizes an automated Zero-Trust Security Engine and Anti-DDoS Firewall to safeguard academic resources. When excessive traffic surges or client-side tampering is detected, temporary security detention is enforced. Detention policies and limits are detailed in the matrix below:",
    table: [
      {
        reason: "DDoS / Traffic Surge (>600 req/min)",
        detentionTime: "3 Minutes",
        autoUnjail: "✅ Auto-release after 180s",
        adminControl: "Can be instantly pardoned by Administrator",
      },
      {
        reason: "Client Script / DevTools Tamper (Strike 3)",
        detentionTime: "24 Hours",
        autoUnjail: "✅ Auto-release after 24h",
        adminControl: "Can be instantly pardoned by Administrator",
      },
      {
        reason: "Administrative Security Detention",
        detentionTime: "Admin Chosen (1h / 24h / Custom)",
        autoUnjail: "✅ Auto-release on expiration",
        adminControl: "Single-click pardon by Administrator",
      },
    ],
    note: "If your account or IP was quarantined by mistake, go to the 'Ask Admin / Request' tab, select Category 'Account Block / IP Jail Appeal', and provide your Incident ID (e.g. FSM-SEC-XXXXXX) so administrators can verify and release it immediately.",
  },
];

export default function HelpCenterModal({ isOpen, onClose, currentUser, securityDetention }) {
  const [activeTab, setActiveTab] = useState("faqs"); // 'faqs' | 'ask' | 'tickets'
  const [searchQuery, setSearchQuery] = useState("");
  const [faqs, setFaqs] = useState(INITIAL_FAQS);
  const [expandedFaq, setExpandedFaq] = useState(null);

  // Form State
  const [name, setName] = useState(currentUser?.name || "");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [mobile, setMobile] = useState(currentUser?.mobile || "");
  const [category, setCategory] = useState("general");
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [formError, setFormError] = useState(null);

  // Auto-focus and pre-populate if connection is under Security Detention
  useEffect(() => {
    if (securityDetention && isOpen) {
      setActiveTab("ask");
      setCategory("block_appeal");
      const inc = securityDetention.incidentId || "FSM-SEC-QUARANTINE";
      setSubject(inc);
      if (!question) {
        setQuestion(`Requesting pardon for Incident #${inc}. I am a genuine student studying for semester exams on college hostel/campus Wi-Fi.`);
      }
    }
  }, [securityDetention, isOpen]);

  // Keyboard accessibility: ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Tickets State
  const [myTickets, setMyTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [manualTicketLookup, setManualTicketLookup] = useState("");
  const [lookupError, setLookupError] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);

  // Student Reply State
  const [replyInputs, setReplyInputs] = useState({});
  const [sendingReply, setSendingReply] = useState({});
  const [replyNotice, setReplyNotice] = useState({});

  // File Attachments State
  const [askAttachments, setAskAttachments] = useState([]);
  const [askUploading, setAskUploading] = useState(false);
  const [replyAttachments, setReplyAttachments] = useState({});
  const [replyUploading, setReplyUploading] = useState({});
  const askFileInputRef = useRef(null);

  // File Upload Handlers
  const handleAskFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 35 * 1024 * 1024) {
      setFormError("File size exceeds 35 MB limit. Please select a smaller file.");
      return;
    }
    setAskUploading(true);
    setFormError(null);
    try {
      const res = await api.uploadHelpAttachment(file);
      if (res.success && res.file) {
        setAskAttachments((prev) => [...prev, res.file]);
      } else {
        setFormError(res.message || "Failed to upload attachment.");
      }
    } catch (err) {
      setFormError("Attachment upload failed: " + err.message);
    } finally {
      setAskUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleReplyFileSelect = async (e, ticketCode) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 35 * 1024 * 1024) {
      setReplyNotice((prev) => ({ ...prev, [ticketCode]: "⚠️ File exceeds 35 MB limit." }));
      return;
    }
    setReplyUploading((prev) => ({ ...prev, [ticketCode]: true }));
    try {
      const res = await api.uploadHelpAttachment(file);
      if (res.success && res.file) {
        setReplyAttachments((prev) => ({
          ...prev,
          [ticketCode]: [...(prev[ticketCode] || []), res.file],
        }));
      } else {
        setReplyNotice((prev) => ({ ...prev, [ticketCode]: `⚠️ ${res.message || "Upload failed."}` }));
      }
    } catch (err) {
      setReplyNotice((prev) => ({ ...prev, [ticketCode]: `⚠️ Upload error: ${err.message}` }));
    } finally {
      setReplyUploading((prev) => ({ ...prev, [ticketCode]: false }));
      if (e.target) e.target.value = "";
    }
  };

  // Helper to render attachment chip/badge in conversation or cards
  const renderAttachmentBadge = (att, onRemove = null) => {
    if (!att || !att.url) return null;
    const isImg = att.type?.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(att.name || att.url);
    const isVid = att.type?.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(att.name || att.url);
    const formatSize = (bytes) => {
      if (!bytes || isNaN(bytes)) return "";
      if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
      return `${Math.round(bytes / 1024)} KB`;
    };

    return (
      <div
        key={att.url}
        style={{
          display: "inline-flex",
          flexDirection: "column",
          gap: "4px",
          background: "#f1f5f9",
          border: "1.5px solid #cbd5e1",
          borderRadius: "8px",
          padding: "6px 8px",
          maxWidth: "320px",
          marginTop: "6px",
          position: "relative",
        }}
      >
        {isImg && (
          <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
            <img
              src={att.url}
              alt={att.name || "Attachment"}
              style={{ width: "100%", maxHeight: "160px", objectFit: "cover", borderRadius: "6px", border: "1px solid #e2e8f0" }}
            />
          </a>
        )}
        {isVid && (
          <video
            controls
            src={att.url}
            style={{ width: "100%", maxHeight: "180px", borderRadius: "6px", background: "#0f172a" }}
          />
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
            {isImg ? <ImageIcon size={14} color="#0284c7" /> : isVid ? <Film size={14} color="#d97706" /> : <FileText size={14} color="#059669" />}
            <a
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: "0.75rem",
                color: "#0f172a",
                fontWeight: 650,
                textDecoration: "underline",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "200px",
              }}
              title={att.name}
            >
              {att.name || "View Attachment"}
            </a>
            {att.size && <span style={{ fontSize: "0.68rem", color: "#64748b" }}>({formatSize(att.size)})</span>}
          </div>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "50%",
                width: "20px",
                height: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ef4444",
                cursor: "pointer",
              }}
              title="Remove file"
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    );
  };

  // Load FAQs on mount
  useEffect(() => {
    if (!isOpen) return;
    api
      .getHelpFaqs()
      .then((res) => {
        if (res.faqs) setFaqs(res.faqs);
      })
      .catch(() => {});
  }, [isOpen]);

  // Load user's tickets (Strictly scoped to owner with device retention)
  const fetchTickets = () => {
    setLoadingTickets(true);
    let storedCodes = [];
    let guestEmail = (currentUser?.email || email || "").trim().toLowerCase();
    let guestMobile = (currentUser?.mobile || mobile || "").trim();
    try {
      const stored = localStorage.getItem("fsm_help_ticket_codes");
      if (stored) storedCodes = JSON.parse(stored);
      if (!guestEmail) guestEmail = localStorage.getItem("fsm_help_guest_email") || "";
      if (!guestMobile) guestMobile = localStorage.getItem("fsm_help_guest_mobile") || "";
    } catch (_) {}

    api
      .getMyHelpTickets(storedCodes, guestEmail, guestMobile)
      .then((res) => {
        if (res.tickets) {
          setMyTickets(res.tickets);
          try {
            // Keep codes for tickets that still exist in the database (removes closed/deleted tickets)
            const activeReturnedCodes = (res.tickets || []).map((t) => t.ticket_code).filter(Boolean);
            localStorage.setItem("fsm_help_ticket_codes", JSON.stringify(activeReturnedCodes));
          } catch (_) {}
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTickets(false));
  };

  // Automatically fetch tickets whenever modal opens or tab changes
  useEffect(() => {
    if (isOpen) {
      fetchTickets();
    }
  }, [isOpen, activeTab]);

  // Handle student follow-up reply from website
  const handleStudentReply = async (e, ticketCode) => {
    e.preventDefault();
    const text = (replyInputs[ticketCode] || "").trim();
    const currentAtts = replyAttachments[ticketCode] || [];
    if (!text && currentAtts.length === 0) return;

    setSendingReply((prev) => ({ ...prev, [ticketCode]: true }));
    setReplyNotice((prev) => ({ ...prev, [ticketCode]: null }));

    const guestEmail = currentUser?.email || email || (!currentUser ? localStorage.getItem("fsm_help_guest_email") || "" : "");
    const guestMobile = currentUser?.mobile || mobile || (!currentUser ? localStorage.getItem("fsm_help_guest_mobile") || "" : "");

    try {
      const res = await api.studentReplyHelpTicket(ticketCode, text, guestEmail, guestMobile, currentAtts);
      if (res.success && res.ticket) {
        setReplyInputs((prev) => ({ ...prev, [ticketCode]: "" }));
        setReplyAttachments((prev) => ({ ...prev, [ticketCode]: [] }));
        setReplyNotice((prev) => ({ ...prev, [ticketCode]: "✅ Reply sent to Administrator!" }));
        setMyTickets((prev) =>
          prev.map((t) => (t.ticket_code === ticketCode ? { ...t, ...res.ticket } : t))
        );
      } else {
        setReplyNotice((prev) => ({ ...prev, [ticketCode]: `⚠️ ${res.message || "Failed to send reply."}` }));
      }
    } catch (err) {
      setReplyNotice((prev) => ({ ...prev, [ticketCode]: `⚠️ ${err.message || "Network error."}` }));
    } finally {
      setSendingReply((prev) => ({ ...prev, [ticketCode]: false }));
    }
  };

  // Sync user info if available
  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || "");
      setEmail(currentUser.email || "");
      setMobile(currentUser.mobile || "");
    }
  }, [currentUser]);

  if (!isOpen) return null;

  // Handle Form Submission
  const handleSubmitQuestion = async (e) => {
    e.preventDefault();
    setFormError(null);

    // Strict validation: Email and Mobile are MANDATORY for users without login
    if (!currentUser) {
      if (!name || name.trim().length < 2) {
        setFormError("Please enter your full name.");
        return;
      }
      if (!email || !email.trim()) {
        setFormError("Email Address is mandatory. Please enter your email.");
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setFormError("Please enter a valid email address (e.g. yourname@gmail.com).");
        return;
      }
      if (!mobile || !mobile.trim()) {
        setFormError("Mobile Number is mandatory. Please enter your 10-digit mobile number.");
        return;
      }
      const cleanMobile = mobile.trim().replace(/[\s-]/g, "");
      if (!/^\+?[0-9]{10,13}$/.test(cleanMobile)) {
        setFormError("Please enter a valid 10-digit mobile number.");
        return;
      }
    }

    if (!question || question.trim().length < 5) {
      setFormError("Please enter your question with at least 5 characters.");
      return;
    }

    if (category === "block_appeal") {
      const hasIncidentId = (subject && subject.trim().length > 3) || /FSM-SEC/i.test(question);
      if (!hasIncidentId) {
        setFormError("Please provide your Incident ID (e.g. FSM-SEC-XXXXXX) so administrators can locate and unblock your account.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await api.askHelpQuestion({
        name,
        email,
        mobile,
        category,
        subject,
        question,
        attachments: askAttachments,
        hp_website: honeypot,
      });

      if (res.success && res.ticket) {
        setSubmitSuccess(res.ticket);
        setQuestion("");
        setSubject("");
        setAskAttachments([]);

        // Store ticket code and guest credentials in localStorage for guests
        try {
          const stored = localStorage.getItem("fsm_help_ticket_codes");
          const arr = stored ? JSON.parse(stored) : [];
          if (!arr.includes(res.ticket.ticket_code)) {
            arr.unshift(res.ticket.ticket_code);
            localStorage.setItem("fsm_help_ticket_codes", JSON.stringify(arr));
          }
          if (!currentUser) {
            if (email) localStorage.setItem("fsm_help_guest_email", email.trim().toLowerCase());
            if (mobile) localStorage.setItem("fsm_help_guest_mobile", mobile.trim());
          }
        } catch (_) {}
      } else {
        setFormError(res.message || "Failed to submit question.");
      }
    } catch (err) {
      setFormError(err.message || "Failed to connect to help service.");
    } finally {
      setSubmitting(false);
    }
  };

  // Lookup single ticket (With Strict 2-Factor Ownership Verification)
  const handleLookupTicket = async (e) => {
    e.preventDefault();
    setLookupError(null);
    if (!manualTicketLookup || !manualTicketLookup.trim()) return;

    const code = manualTicketLookup.trim().toUpperCase();
    const guestEmail = email || (!currentUser ? localStorage.getItem("fsm_help_guest_email") || "" : "");
    const guestMobile = mobile || (!currentUser ? localStorage.getItem("fsm_help_guest_mobile") || "" : "");

    try {
      const res = await api.getHelpTicket(code, guestEmail, guestMobile);
      if (res.ticket) {
        setMyTickets((prev) => {
          const exists = prev.some((t) => t.ticket_code === res.ticket.ticket_code);
          return exists ? prev : [res.ticket, ...prev];
        });
        setManualTicketLookup("");
      } else {
        setLookupError(`Ticket #${code} not found.`);
      }
    } catch (err) {
      setLookupError(err.message || "Ticket not found or access restricted.");
    }
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filteredFaqs = faqs.filter(
    (f) =>
      !searchQuery ||
      f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.table && JSON.stringify(f.table).toLowerCase().includes(searchQuery.toLowerCase())) ||
      (f.note && f.note.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-content help-center-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "680px",
          width: "92%",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          borderRadius: "16px",
          overflow: "hidden",
          background: "#ffffff",
          border: "1.5px solid #cbd5e1",
          boxShadow: "0 25px 70px -15px rgba(15, 23, 42, 0.22)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1.5px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#ffffff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                background: "#e0f2fe",
                border: "1px solid #bae6fd",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#0284c7",
              }}
            >
              <HelpCircle size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0f172a" }}>
                Help & Support Center
              </h3>
              <p style={{ margin: 0, fontSize: "0.78rem", color: "#475569" }}>
                Instant FAQs, note requests & 2-way admin support for all students
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "#fef2f2",
              border: "1.5px solid #fecaca",
              color: "#ef4444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
              boxShadow: "0 2px 6px rgba(239, 68, 68, 0.15)",
              transition: "all 0.15s ease",
            }}
            title="Close Help Center (Esc)"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            borderBottom: "1.5px solid #e2e8f0",
            padding: "0 24px",
            background: "#f8fafc",
            gap: "8px",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setActiveTab("faqs");
              setSubmitSuccess(null);
            }}
            style={{
              padding: "12px 16px",
              background: "none",
              border: "none",
              borderBottom: activeTab === "faqs" ? "2px solid #0284c7" : "2px solid transparent",
              color: activeTab === "faqs" ? "#0284c7" : "#64748b",
              fontWeight: activeTab === "faqs" ? 700 : 500,
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.2s ease",
            }}
          >
            <Search size={15} />
            <span>Instant Solutions (FAQs)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("ask");
              setSubmitSuccess(null);
            }}
            style={{
              padding: "12px 16px",
              background: "none",
              border: "none",
              borderBottom: activeTab === "ask" ? "2px solid #0284c7" : "2px solid transparent",
              color: activeTab === "ask" ? "#0284c7" : "#64748b",
              fontWeight: activeTab === "ask" ? 700 : 500,
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.2s ease",
            }}
          >
            <MessageSquare size={15} />
            <span>Ask Admin / Request</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("tickets");
              setSubmitSuccess(null);
            }}
            style={{
              padding: "12px 16px",
              background: "none",
              border: "none",
              borderBottom: activeTab === "tickets" ? "2px solid #0284c7" : "2px solid transparent",
              color: activeTab === "tickets" ? "#0284c7" : "#64748b",
              fontWeight: activeTab === "tickets" ? 700 : 500,
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.2s ease",
            }}
          >
            <Ticket size={15} />
            <span>My Tickets</span>
            {myTickets.length > 0 && (
              <span
                style={{
                  background: myTickets.some((t) => t.status === "active") ? "#fef3c7" : "#e0f2fe",
                  color: myTickets.some((t) => t.status === "active") ? "#92400e" : "#0284c7",
                  border: myTickets.some((t) => t.status === "active") ? "1px solid #fde68a" : "1px solid #bae6fd",
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  padding: "1px 6px",
                  borderRadius: "10px",
                }}
              >
                {myTickets.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content Area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", background: "#ffffff" }}>
          {/* Active Ticket Alert Banner when user has tickets and is on FAQs/Ask tabs */}
          {myTickets.some((t) => t.status === "active" || t.status === "answered") && activeTab !== "tickets" && (
            <div
              onClick={() => {
                setActiveTab("tickets");
                setSubmitSuccess(null);
              }}
              style={{
                cursor: "pointer",
                padding: "12px 16px",
                marginBottom: "16px",
                borderRadius: "12px",
                background: myTickets.some((t) => t.status === "answered")
                  ? "#ecfdf5"
                  : "#fffbeb",
                border: myTickets.some((t) => t.status === "answered")
                  ? "1.5px solid #10b981"
                  : "1.5px solid #f59e0b",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "0.85rem",
                fontWeight: 650,
                color: myTickets.some((t) => t.status === "answered") ? "#065f46" : "#92400e",
                boxShadow: "0 4px 14px rgba(0, 0, 0, 0.08)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "1.1rem" }}>{myTickets.some((t) => t.status === "answered") ? "🎉" : "⚡"}</span>
                <span>
                  {myTickets.some((t) => t.status === "answered")
                    ? "Admin has replied to your ticket! Tap here to read answer and reply."
                    : `You have ${myTickets.filter((t) => t.status === "active").length} active ticket(s) in progress.`}
                </span>
              </div>
              <span style={{ fontSize: "0.82rem", fontWeight: 800, textDecoration: "underline", color: myTickets.some((t) => t.status === "answered") ? "#047857" : "#b45309" }}>
                View Ticket &rarr;
              </span>
            </div>
          )}
          {/* TAB 1: FAQS */}
          {activeTab === "faqs" && (
            <div>
              {/* Search Bar */}
              <div
                style={{
                  position: "relative",
                  marginBottom: "18px",
                }}
              >
                <Search
                  size={16}
                  style={{
                    position: "absolute",
                    left: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-dim)",
                  }}
                />
                <input
                  type="text"
                  placeholder="Search questions (e.g., download paused, offline notes, passkey)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "11px 14px 11px 40px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1.5px solid #cbd5e1",
                    color: "#0f172a",
                    fontSize: "0.86rem",
                    outline: "none",
                  }}
                />
              </div>

              {/* FAQ Accordions */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {filteredFaqs.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 10px", color: "#64748b" }}>
                    <p style={{ margin: "0 0 8px 0", fontSize: "0.9rem" }}>No matching answers found for "{searchQuery}".</p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("ask")}
                      className="btn-secondary"
                      style={{ fontSize: "0.82rem", padding: "8px 14px" }}
                    >
                      Ask Admin Directly
                    </button>
                  </div>
                ) : (
                  filteredFaqs.map((faq) => {
                    const isExpanded = expandedFaq === faq.id;
                    return (
                      <div
                        key={faq.id}
                        style={{
                          borderRadius: "10px",
                          background: isExpanded ? "#f0f9ff" : "#f8fafc",
                          border: isExpanded
                            ? "1.5px solid #bae6fd"
                            : "1.5px solid #e2e8f0",
                          overflow: "hidden",
                          transition: "all 0.2s ease",
                        }}
                      >
                        <div
                          onClick={() => setExpandedFaq(isExpanded ? null : faq.id)}
                          style={{
                            padding: "14px 16px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                        >
                          <span style={{ fontWeight: 700, fontSize: "0.88rem", color: isExpanded ? "#0284c7" : "#0f172a" }}>
                            {faq.question}
                          </span>
                          {isExpanded ? (
                            <ChevronUp size={16} color="#0284c7" />
                          ) : (
                            <ChevronDown size={16} color="#64748b" />
                          )}
                        </div>
                        {isExpanded && (
                          <div
                            style={{
                              padding: "0 16px 14px 16px",
                              fontSize: "0.84rem",
                              color: "#334155",
                              lineHeight: "1.55",
                              borderTop: "1px solid #e2e8f0",
                              paddingTop: "10px",
                            }}
                          >
                            <p style={{ margin: "0 0 10px 0" }}>{faq.answer}</p>
                            {faq.table && (
                              <div
                                style={{
                                  overflowX: "auto",
                                  margin: "12px 0",
                                  borderRadius: "8px",
                                  border: "1.5px solid #cbd5e1",
                                  background: "#ffffff",
                                }}
                              >
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem", minWidth: "540px" }}>
                                  <thead>
                                    <tr style={{ background: "#f1f5f9", textAlign: "left", color: "#0f172a" }}>
                                      <th style={{ padding: "9px 12px", borderBottom: "1.5px solid #cbd5e1" }}>Reason</th>
                                      <th style={{ padding: "9px 12px", borderBottom: "1.5px solid #cbd5e1" }}>Detention Time</th>
                                      <th style={{ padding: "9px 12px", borderBottom: "1.5px solid #cbd5e1" }}>Auto-Unjail?</th>
                                      <th style={{ padding: "9px 12px", borderBottom: "1.5px solid #cbd5e1" }}>Admin Manual Control</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {faq.table.map((row, idx) => (
                                      <tr
                                        key={idx}
                                        style={{
                                          borderBottom: "1px solid #e2e8f0",
                                          background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
                                        }}
                                      >
                                        <td style={{ padding: "8px 12px", fontWeight: 700, color: "#0f172a" }}>{row.reason}</td>
                                        <td style={{ padding: "8px 12px", color: "#b45309", fontWeight: 700 }}>{row.detentionTime}</td>
                                        <td style={{ padding: "8px 12px", color: "#059669", fontWeight: 650 }}>{row.autoUnjail}</td>
                                        <td style={{ padding: "8px 12px", color: "#0284c7", fontWeight: 600 }}>{row.adminControl}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {faq.note && (
                              <div
                                style={{
                                  marginTop: "10px",
                                  padding: "10px 12px",
                                  borderRadius: "8px",
                                  background: "#fef2f2",
                                  border: "1.5px solid #fecaca",
                                  color: "#991b1b",
                                  fontSize: "0.78rem",
                                  lineHeight: "1.45",
                                }}
                              >
                                💡 <strong>Appeal Advice:</strong> {faq.note}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ASK QUESTION / SUBMIT TICKET */}
          {activeTab === "ask" && (
            <div>
              {submitSuccess ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "30px 16px",
                    background: "#ecfdf5",
                    border: "1.5px solid #a7f3d0",
                    borderRadius: "12px",
                  }}
                >
                  <CheckCircle2 size={42} color="#059669" style={{ margin: "0 auto 12px auto" }} />
                  <h4 style={{ margin: "0 0 6px 0", color: "#065f46", fontSize: "1.1rem", fontWeight: 800 }}>
                    Question Submitted Successfully!
                  </h4>
                  <p style={{ margin: "0 0 16px 0", fontSize: "0.84rem", color: "#047857" }}>
                    Admin has been notified. You can track their reply anytime without logging in using your Ticket ID:
                  </p>

                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "10px",
                      background: "#ffffff",
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "1.5px solid #6ee7b7",
                      marginBottom: "20px",
                    }}
                  >
                    <span style={{ fontSize: "1.1rem", fontWeight: 800, letterSpacing: "1px", color: "#0284c7" }}>
                      {submitSuccess.ticket_code}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(submitSuccess.ticket_code)}
                      style={{
                        background: "none",
                        border: "none",
                        color: copiedCode === submitSuccess.ticket_code ? "#059669" : "#64748b",
                        cursor: "pointer",
                      }}
                      title="Copy Ticket ID"
                    >
                      {copiedCode === submitSuccess.ticket_code ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("tickets")}
                      className="btn-primary"
                      style={{ fontSize: "0.85rem", padding: "10px 20px" }}
                    >
                      View in My Tickets
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitQuestion} autoComplete="off">
                  {formError && (
                    <div
                      style={{
                        padding: "10px 14px",
                        marginBottom: "16px",
                        borderRadius: "8px",
                        background: "#fef2f2",
                        border: "1.5px solid #fecaca",
                        color: "#dc2626",
                        fontSize: "0.82rem",
                      }}
                    >
                      {formError}
                    </div>
                  )}

                  {/* Anti-spam Honeypot (hidden from real users) */}
                  <input
                    type="text"
                    name="hp_website"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    style={{ display: "none" }}
                    tabIndex={-1}
                    autoComplete="off"
                  />

                  {currentUser ? (
                    <div
                      style={{
                        padding: "10px 14px",
                        marginBottom: "16px",
                        borderRadius: "8px",
                        background: "#f0f9ff",
                        border: "1.5px solid #bae6fd",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        fontSize: "0.82rem",
                        color: "#0369a1",
                      }}
                    >
                      <User size={16} color="#0284c7" />
                      <div>
                        Signed in as <strong>{currentUser.name}</strong> ({currentUser.email || "Student Account"}{currentUser.mobile ? ` • 📱 ${currentUser.mobile}` : ""})
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginBottom: "14px" }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: "12px",
                        }}
                      >
                        <div>
                          <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <User size={12} color="#0284c7" /> Name *
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="e.g. Aman Verma"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                          />
                        </div>
                        <div>
                          <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <Mail size={12} color="#0284c7" /> Email *
                          </label>
                          <input
                            type="email"
                            className="form-input"
                            placeholder="yourname@gmail.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                          />
                        </div>
                        <div>
                          <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <Phone size={12} color="#0284c7" /> Mobile No *
                          </label>
                          <input
                            type="tel"
                            className="form-input"
                            placeholder="10-digit Mobile"
                            value={mobile}
                            onChange={(e) => setMobile(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "6px" }}>
                        🔒 Email &amp; Mobile Number are mandatory so our academic team can contact and assist you.
                      </div>
                    </div>
                  )}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                      marginBottom: "14px",
                    }}
                  >
                    <div>
                      <label className="form-label">Category *</label>
                      <select
                        className="form-input"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        style={{ cursor: "pointer", width: "100%", color: "#0f172a", background: "#ffffff", colorScheme: "light" }}
                      >
                        <option value="general">General Support</option>
                        <option value="missing_notes">📚 Request Missing Notes</option>
                        <option value="download">📥 Download / Preview Issue</option>
                        <option value="login_security">🛡️ Account / Passkey Help</option>
                        <option value="block_appeal">🚨 Account Block / IP Jail Appeal</option>
                        <option value="syllabus">📋 Syllabus & PYQ Query</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">
                        {category === "block_appeal" ? "Incident ID (e.g. FSM-SEC-XXXXXX) *" : "Subject / Topic Name (Optional)"}
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder={category === "block_appeal" ? "e.g. FSM-SEC-XXXXXX" : "e.g. OS Unit 3, DBMS"}
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        required={category === "block_appeal"}
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>

                  {category === "block_appeal" && (
                    <div
                      style={{
                        marginBottom: "14px",
                        padding: "12px 14px",
                        borderRadius: "10px",
                        background: "#fef2f2",
                        border: "1.5px solid #fecaca",
                        color: "#991b1b",
                        fontSize: "0.82rem",
                        lineHeight: "1.45",
                      }}
                    >
                      <div style={{ fontWeight: 800, color: "#dc2626", display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                        <span>🚨</span> Security Appeal & Shared Campus Wi-Fi Shield:
                      </div>
                      <div>
                        Please provide your <strong>Incident ID (e.g. <code>FSM-SEC-XXXXXX</code>)</strong>. If you are on a college/hostel Wi-Fi network, submitting an appeal allows administrators to unblock your specific device without affecting other students.
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: "18px" }}>
                    <label className="form-label">
                      {category === "block_appeal" ? "Block Appeal Details & Reason *" : "Your Question / Details *"}
                    </label>
                    <textarea
                      className="form-input help-textarea-noscroll"
                      rows={5}
                      placeholder={
                        category === "block_appeal"
                          ? "Provide your Incident ID (e.g. FSM-SEC-XXXXXX), registered email/mobile number, and a brief description of the incident. Administrators will review the telemetry and unblock your account."
                          : "Type your question or requirement clearly here. Our admin team will review and answer you directly."
                      }
                      value={question}
                      onChange={(e) => {
                        setQuestion(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = `${Math.max(126, e.target.scrollHeight)}px`;
                      }}
                      required
                      style={{
                        width: "100%",
                        resize: "none",
                        overflow: "hidden",
                        minHeight: "126px",
                      }}
                    />
                  </div>

                  {/* File Attachment Input for Ask Question */}
                  <div style={{ marginBottom: "18px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                      <label className="form-label" style={{ margin: 0 }}>
                        Attach File / Screenshot (Optional):
                      </label>
                      <button
                        type="button"
                        onClick={() => askFileInputRef.current?.click()}
                        disabled={askUploading}
                        style={{
                          background: "#f0f9ff",
                          border: "1.5px solid #bae6fd",
                          borderRadius: "6px",
                          padding: "5px 12px",
                          color: "#0284c7",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <Paperclip size={13} />
                        <span>{askUploading ? "Uploading File..." : "Choose File (Image, PDF, Video)"}</span>
                      </button>
                    </div>

                    <input
                      ref={askFileInputRef}
                      type="file"
                      accept="image/*,video/*,.pdf,.txt,.doc,.docx"
                      onChange={handleAskFileSelect}
                      style={{ display: "none" }}
                    />

                    {/* Attachment Chips Display */}
                    {askAttachments.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
                        {askAttachments.map((att, idx) =>
                          renderAttachmentBadge(att, () => {
                            setAskAttachments((prev) => prev.filter((_, i) => i !== idx));
                          })
                        )}
                      </div>
                    )}
                    <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "4px" }}>
                      Supports Screenshots (PNG, JPG), Syllabus Documents (PDF, DOCX), &amp; Videos (MP4, WebM) up to 35 MB.
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={submitting}
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    {submitting ? (
                      <>
                        <div className="spinner" />
                        <span>Sending to Admin...</span>
                      </>
                    ) : (
                      <>
                        <Send size={16} />
                        <span>Submit Question to Admin</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 3: MY TICKETS & REPLIES */}
          {activeTab === "tickets" && (
            <div>
              {/* Lookup Form */}
              <form
                onSubmit={handleLookupTicket}
                style={{
                  display: "flex",
                  gap: "10px",
                  marginBottom: "18px",
                }}
              >
                <input
                  type="text"
                  placeholder="Enter Ticket ID (e.g. FSM-H4821) to track..."
                  value={manualTicketLookup}
                  onChange={(e) => setManualTicketLookup(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "#ffffff",
                    border: "1.5px solid #cbd5e1",
                    color: "#0f172a",
                    fontSize: "0.85rem",
                    outline: "none",
                  }}
                />
                <button type="submit" className="btn-secondary" style={{ padding: "0 16px", fontSize: "0.85rem" }}>
                  Track
                </button>
              </form>

              {lookupError && (
                <div
                  style={{
                    padding: "8px 12px",
                    marginBottom: "12px",
                    borderRadius: "6px",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#dc2626",
                    fontSize: "0.8rem",
                  }}
                >
                  {lookupError}
                </div>
              )}

              {loadingTickets ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: "#64748b" }}>
                  <div className="spinner" style={{ margin: "0 auto 10px auto" }} />
                  <span>Loading ticket status...</span>
                </div>
              ) : myTickets.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 10px", color: "#64748b" }}>
                  <Ticket size={36} style={{ margin: "0 auto 12px auto", opacity: 0.4 }} />
                  <p style={{ margin: "0 0 6px 0", fontSize: "0.92rem", fontWeight: 700, color: "#1e293b" }}>No tickets found on this device</p>
                  <p style={{ margin: "0 0 16px 0", fontSize: "0.8rem", color: "#64748b" }}>
                    When you ask a question, your ticket and admin replies will show up here automatically.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("ask")}
                    className="btn-primary"
                    style={{ fontSize: "0.82rem", padding: "8px 16px" }}
                  >
                    Ask a Question Now
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {myTickets.map((t) => {
                    const isAnswered = t.status === "answered" && t.admin_reply;
                    return (
                      <div
                        key={t.ticket_code}
                        style={{
                          borderRadius: "12px",
                          background: isAnswered ? "#f0fdf4" : "#f8fafc",
                          border: isAnswered
                            ? "1.5px solid #bbf7d0"
                            : "1.5px solid #e2e8f0",
                          padding: "16px",
                        }}
                      >
                        {/* Ticket Header */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "10px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontWeight: 800, color: "#0284c7", fontSize: "0.92rem" }}>
                              #{t.ticket_code}
                            </span>
                            <span
                              style={{
                                fontSize: "0.72rem",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                background: "#e2e8f0",
                                color: "#475569",
                                fontWeight: 650,
                                textTransform: "capitalize",
                              }}
                            >
                              {t.category || "General"}
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {t.status === "closed" ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontSize: "0.75rem",
                                  color: "#475569",
                                  background: "#f1f5f9",
                                  border: "1px solid #cbd5e1",
                                  padding: "3px 8px",
                                  borderRadius: "12px",
                                  fontWeight: 650,
                                }}
                              >
                                <Lock size={12} />
                                Resolved & Closed
                              </span>
                            ) : isAnswered ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontSize: "0.75rem",
                                  color: "#15803d",
                                  background: "#dcfce7",
                                  border: "1px solid #86efac",
                                  padding: "3px 8px",
                                  borderRadius: "12px",
                                  fontWeight: 700,
                                }}
                              >
                                <CheckCircle2 size={13} />
                                Answered
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontSize: "0.75rem",
                                  color: "#b45309",
                                  background: "#fef3c7",
                                  border: "1px solid #fde68a",
                                  padding: "3px 8px",
                                  borderRadius: "12px",
                                  fontWeight: 700,
                                }}
                              >
                                <Clock size={13} />
                                Pending Admin Review
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Conversation Thread or Original Question & Admin Response */}
                        {(() => {
                          let conv = [];
                          try {
                            if (t.conversation) conv = JSON.parse(t.conversation);
                          } catch (_) {}

                          if (conv && conv.length > 0) {
                            return (
                              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "12px" }}>
                                {conv.map((msg, mIdx) => {
                                  const isAdmin = msg.sender === "admin";
                                  return (
                                    <div
                                      key={mIdx}
                                      style={{
                                        padding: "10px 14px",
                                        borderRadius: "10px",
                                        background: isAdmin ? "#ecfdf5" : "#ffffff",
                                        borderLeft: isAdmin ? "4px solid #10b981" : "4px solid #0284c7",
                                        border: isAdmin ? "1.5px solid #a7f3d0" : "1.5px solid #e2e8f0",
                                      }}
                                    >
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                                        <span style={{ fontSize: "0.76rem", fontWeight: 750, color: isAdmin ? "#059669" : "#0284c7" }}>
                                          {isAdmin ? `👑 ${msg.sender_name || "Platform Admin"}` : `👤 ${msg.sender_name || t.user_name || "You"}`}
                                        </span>
                                        {msg.created_at && (
                                          <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                                            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                          </span>
                                        )}
                                      </div>
                                      <p style={{ margin: 0, fontSize: "0.84rem", color: isAdmin ? "#064e3b" : "#0f172a", lineHeight: "1.45" }}>
                                        {msg.text}
                                      </p>
                                      {/* Attachment badges inside conversation bubble */}
                                      {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                                          {msg.attachments.map((att) => renderAttachmentBadge(att))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }

                          // Fallback to classic format
                          return (
                            <>
                              <div style={{ marginBottom: "12px" }}>
                                <p style={{ margin: 0, fontSize: "0.85rem", color: "#0f172a", lineHeight: "1.45", fontWeight: 500 }}>
                                  {t.question}
                                </p>
                                {/* Attachment badges in fallback question view */}
                                {Array.isArray(t.attachments) && t.attachments.length > 0 && (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                                    {t.attachments.map((att) => renderAttachmentBadge(att))}
                                  </div>
                                )}
                                {t.subject && (
                                  <span style={{ fontSize: "0.74rem", color: "#64748b", marginTop: "4px", display: "block" }}>
                                    Subject / Note: {t.subject}
                                  </span>
                                )}
                              </div>

                              {isAnswered ? (
                                <div
                                  style={{
                                    background: "#ecfdf5",
                                    borderLeft: "4px solid #10b981",
                                    border: "1.5px solid #a7f3d0",
                                    padding: "10px 14px",
                                    borderRadius: "0 8px 8px 0",
                                    marginTop: "8px",
                                    marginBottom: "12px",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    <span style={{ fontSize: "0.76rem", fontWeight: 750, color: "#059669" }}>
                                      👑 Admin Response ({t.admin_name || "Platform Admin"})
                                    </span>
                                    {t.replied_at && (
                                      <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                                        {new Date(t.replied_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                      </span>
                                    )}
                                  </div>
                                  <p style={{ margin: 0, fontSize: "0.84rem", color: "#064e3b", lineHeight: "1.45" }}>
                                    {t.admin_reply}
                                  </p>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    fontSize: "0.76rem",
                                    color: "#92400e",
                                    fontStyle: "italic",
                                    background: "#fef3c7",
                                    border: "1px solid #fde68a",
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    marginBottom: "12px",
                                  }}
                                >
                                  ⏳ Your question has been forwarded to administrators. As soon as admin replies, it will appear right here.
                                </div>
                              )}
                            </>
                          );
                        })()}

                        {/* Student Reply Form (Allowed on active or answered tickets) */}
                        {t.status !== "closed" ? (
                          <div style={{ marginTop: "12px", borderTop: "1.5px solid #e2e8f0", paddingTop: "12px" }}>
                            {/* Render reply attachments chips */}
                            {Array.isArray(replyAttachments[t.ticket_code]) && replyAttachments[t.ticket_code].length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                                {replyAttachments[t.ticket_code].map((att, aIdx) =>
                                  renderAttachmentBadge(att, () => {
                                    setReplyAttachments((prev) => ({
                                      ...prev,
                                      [t.ticket_code]: prev[t.ticket_code].filter((_, idx) => idx !== aIdx),
                                    }));
                                  })
                                )}
                              </div>
                            )}

                            <form
                              onSubmit={(e) => handleStudentReply(e, t.ticket_code)}
                              style={{ display: "flex", gap: "8px", alignItems: "center" }}
                            >
                              <label
                                style={{
                                  background: "#f0f9ff",
                                  border: "1.5px solid #bae6fd",
                                  borderRadius: "8px",
                                  padding: "9px 11px",
                                  color: "#0284c7",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                                title="Attach Screenshot, Document or Video"
                              >
                                <input
                                  type="file"
                                  accept="image/*,video/*,.pdf,.txt,.doc,.docx"
                                  onChange={(e) => handleReplyFileSelect(e, t.ticket_code)}
                                  style={{ display: "none" }}
                                />
                                {replyUploading[t.ticket_code] ? (
                                  <div className="spinner" style={{ width: "13px", height: "13px" }} />
                                ) : (
                                  <Paperclip size={15} />
                                )}
                              </label>

                              <input
                                type="text"
                                placeholder="Type your follow-up reply or query..."
                                value={replyInputs[t.ticket_code] || ""}
                                onChange={(e) =>
                                  setReplyInputs((prev) => ({ ...prev, [t.ticket_code]: e.target.value }))
                                }
                                style={{
                                  flex: 1,
                                  padding: "9px 12px",
                                  borderRadius: "8px",
                                  background: "#ffffff",
                                  border: "1.5px solid #cbd5e1",
                                  color: "#0f172a",
                                  fontSize: "0.82rem",
                                  outline: "none",
                                }}
                              />
                              <button
                                type="submit"
                                className="btn-primary"
                                disabled={
                                  sendingReply[t.ticket_code] ||
                                  (!replyInputs[t.ticket_code]?.trim() && (!replyAttachments[t.ticket_code] || replyAttachments[t.ticket_code].length === 0))
                                }
                                style={{
                                  padding: "9px 16px",
                                  fontSize: "0.82rem",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {sendingReply[t.ticket_code] ? (
                                  <div className="spinner" style={{ width: "13px", height: "13px" }} />
                                ) : (
                                  <Send size={13} />
                                )}
                                <span>Reply</span>
                              </button>
                            </form>
                            {replyNotice[t.ticket_code] && (
                              <div
                                style={{
                                  marginTop: "6px",
                                  fontSize: "0.78rem",
                                  color: replyNotice[t.ticket_code].startsWith("✅") ? "#059669" : "#dc2626",
                                  fontWeight: 600,
                                }}
                              >
                                {replyNotice[t.ticket_code]}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div
                            style={{
                              marginTop: "12px",
                              padding: "10px 14px",
                              borderRadius: "8px",
                              background: "#f1f5f9",
                              border: "1.5px solid #cbd5e1",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              fontSize: "0.8rem",
                              color: "#475569",
                            }}
                          >
                            <Lock size={15} color="#64748b" />
                            <span>
                              This ticket has been resolved and closed by Administrator. Replies are closed. If you have a new question, please{" "}
                              <span
                                onClick={() => {
                                  setActiveTab("ask");
                                  setSubmitSuccess(null);
                                }}
                                style={{ color: "#0284c7", cursor: "pointer", textDecoration: "underline", fontWeight: 700 }}
                              >
                                ask a new question
                              </span>
                              .
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

