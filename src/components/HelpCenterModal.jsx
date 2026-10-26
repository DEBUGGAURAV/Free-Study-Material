import React, { useState, useEffect } from "react";
import {
  X,
  HelpCircle,
  Search,
  MessageSquare,
  Send,
  CheckCircle2,
  Clock,
  Sparkles,
  BookOpen,
  DownloadCloud,
  Shield,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Ticket,
  User,
  Mail,
  Phone,
  Copy,
  Check,
} from "lucide-react";
import { api } from "../api";

const INITIAL_FAQS = [
  {
    id: "faq_1",
    category: "download",
    question: "How do I download PDF notes, or what should I do if a download is paused?",
    answer:
      "Free Study Material employs an autonomous 3-layer resilient failover network. Download requests seamlessly cycle through the Primary Storage Vault, Cloudflare Edge CDN, and native streaming fallback. If a download pauses, click 'Retry Download' or use 'Online Preview' for instant in-browser reading.",
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
    id: "faq_6",
    category: "telegram",
    question: "How can I connect with the official Telegram Academic Community & notifications?",
    answer:
      "You can connect through our official Telegram Bot (@fsm_chat_bot or @fsm_security_otp_bot) or join official FSM broadcast channels to receive daily semester updates, exam datesheets, and new study material alerts.",
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

export default function HelpCenterModal({ isOpen, onClose, currentUser }) {
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

  // Tickets State
  const [myTickets, setMyTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [manualTicketLookup, setManualTicketLookup] = useState("");
  const [lookupError, setLookupError] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);

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

  // Load user's tickets (Strictly scoped to owner)
  const fetchTickets = () => {
    setLoadingTickets(true);
    let storedCodes = [];
    let guestEmail = email || "";
    let guestMobile = mobile || "";
    try {
      const stored = localStorage.getItem("fsm_help_ticket_codes");
      if (stored) storedCodes = JSON.parse(stored);
      if (!currentUser) {
        guestEmail = guestEmail || localStorage.getItem("fsm_help_guest_email") || "";
        guestMobile = guestMobile || localStorage.getItem("fsm_help_guest_mobile") || "";
      }
    } catch (_) {}

    api
      .getMyHelpTickets(storedCodes, guestEmail, guestMobile)
      .then((res) => {
        if (res.tickets) setMyTickets(res.tickets);
      })
      .catch(() => {})
      .finally(() => setLoadingTickets(false));
  };

  useEffect(() => {
    if (isOpen && activeTab === "tickets") {
      fetchTickets();
    }
  }, [isOpen, activeTab]);

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
        hp_website: honeypot,
      });

      if (res.success && res.ticket) {
        setSubmitSuccess(res.ticket);
        setQuestion("");
        setSubject("");

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
        className="modal-content"
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
          background: "linear-gradient(180deg, #131b2e 0%, #0c1222 100%)",
          border: "1px solid rgba(56, 189, 248, 0.2)",
          boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 35px rgba(56, 189, 248, 0.15)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255, 255, 255, 0.02)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "rgba(56, 189, 248, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#38bdf8",
              }}
            >
              <HelpCircle size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#fff" }}>
                Help & Support Center
              </h3>
              <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-dim)" }}>
                Instant FAQs, note requests & 2-way admin support for all students
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="modal-close-btn"
            style={{ position: "static", background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            padding: "0 24px",
            background: "rgba(0, 0, 0, 0.2)",
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
              borderBottom: activeTab === "faqs" ? "2px solid #38bdf8" : "2px solid transparent",
              color: activeTab === "faqs" ? "#38bdf8" : "var(--text-dim)",
              fontWeight: activeTab === "faqs" ? 600 : 500,
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
              borderBottom: activeTab === "ask" ? "2px solid #38bdf8" : "2px solid transparent",
              color: activeTab === "ask" ? "#38bdf8" : "var(--text-dim)",
              fontWeight: activeTab === "ask" ? 600 : 500,
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
              borderBottom: activeTab === "tickets" ? "2px solid #38bdf8" : "2px solid transparent",
              color: activeTab === "tickets" ? "#38bdf8" : "var(--text-dim)",
              fontWeight: activeTab === "tickets" ? 600 : 500,
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.2s ease",
            }}
          >
            <Ticket size={15} />
            <span>My Tickets & Replies</span>
            {myTickets.some((t) => t.status === "answered") && (
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#10b981",
                  display: "inline-block",
                }}
              />
            )}
          </button>
        </div>

        {/* Tab Content Area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
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
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#fff",
                    fontSize: "0.86rem",
                    outline: "none",
                  }}
                />
              </div>

              {/* FAQ Accordions */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {filteredFaqs.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 10px", color: "var(--text-dim)" }}>
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
                          background: isExpanded ? "rgba(56, 189, 248, 0.06)" : "rgba(255, 255, 255, 0.03)",
                          border: isExpanded
                            ? "1px solid rgba(56, 189, 248, 0.3)"
                            : "1px solid rgba(255, 255, 255, 0.06)",
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
                          <span style={{ fontWeight: 600, fontSize: "0.88rem", color: isExpanded ? "#38bdf8" : "#f1f5f9" }}>
                            {faq.question}
                          </span>
                          {isExpanded ? (
                            <ChevronUp size={16} color="#38bdf8" />
                          ) : (
                            <ChevronDown size={16} color="var(--text-dim)" />
                          )}
                        </div>
                        {isExpanded && (
                          <div
                            style={{
                              padding: "0 16px 14px 16px",
                              fontSize: "0.84rem",
                              color: "rgba(226, 232, 240, 0.85)",
                              lineHeight: "1.5",
                              borderTop: "1px solid rgba(255, 255, 255, 0.04)",
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
                                  border: "1px solid rgba(56, 189, 248, 0.25)",
                                  background: "rgba(15, 23, 42, 0.6)",
                                }}
                              >
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem", minWidth: "540px" }}>
                                  <thead>
                                    <tr style={{ background: "rgba(30, 41, 59, 0.95)", textAlign: "left", color: "#38bdf8" }}>
                                      <th style={{ padding: "9px 12px", borderBottom: "1px solid rgba(56, 189, 248, 0.25)" }}>Reason</th>
                                      <th style={{ padding: "9px 12px", borderBottom: "1px solid rgba(56, 189, 248, 0.25)" }}>Detention Time</th>
                                      <th style={{ padding: "9px 12px", borderBottom: "1px solid rgba(56, 189, 248, 0.25)" }}>Auto-Unjail?</th>
                                      <th style={{ padding: "9px 12px", borderBottom: "1px solid rgba(56, 189, 248, 0.25)" }}>Admin Manual Control</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {faq.table.map((row, idx) => (
                                      <tr
                                        key={idx}
                                        style={{
                                          borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                                          background: idx % 2 === 0 ? "rgba(15, 23, 42, 0.4)" : "rgba(30, 41, 59, 0.2)",
                                        }}
                                      >
                                        <td style={{ padding: "8px 12px", fontWeight: 700, color: "#f8fafc" }}>{row.reason}</td>
                                        <td style={{ padding: "8px 12px", color: "#fbbf24", fontWeight: 700 }}>{row.detentionTime}</td>
                                        <td style={{ padding: "8px 12px", color: "#34d399", fontWeight: 600 }}>{row.autoUnjail}</td>
                                        <td style={{ padding: "8px 12px", color: "#38bdf8", fontWeight: 500 }}>{row.adminControl}</td>
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
                                  background: "rgba(239, 68, 68, 0.1)",
                                  border: "1px solid rgba(239, 68, 68, 0.25)",
                                  color: "#fca5a5",
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
                    background: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    borderRadius: "12px",
                  }}
                >
                  <CheckCircle2 size={42} color="#10b981" style={{ margin: "0 auto 12px auto" }} />
                  <h4 style={{ margin: "0 0 6px 0", color: "#10b981", fontSize: "1.1rem", fontWeight: 700 }}>
                    Question Submitted Successfully!
                  </h4>
                  <p style={{ margin: "0 0 16px 0", fontSize: "0.84rem", color: "rgba(226, 232, 240, 0.85)" }}>
                    Admin has been notified on Telegram. You can track their reply anytime without logging in using your Ticket ID:
                  </p>

                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "10px",
                      background: "rgba(0, 0, 0, 0.4)",
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      marginBottom: "20px",
                    }}
                  >
                    <span style={{ fontSize: "1.1rem", fontWeight: 700, letterSpacing: "1px", color: "#38bdf8" }}>
                      {submitSuccess.ticket_code}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(submitSuccess.ticket_code)}
                      style={{
                        background: "none",
                        border: "none",
                        color: copiedCode === submitSuccess.ticket_code ? "#10b981" : "var(--text-dim)",
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
                        background: "rgba(244, 63, 94, 0.12)",
                        border: "1px solid rgba(244, 63, 94, 0.3)",
                        color: "#fda4af",
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
                        background: "rgba(56, 189, 248, 0.08)",
                        border: "1px solid rgba(56, 189, 248, 0.2)",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        fontSize: "0.82rem",
                        color: "#bae6fd",
                      }}
                    >
                      <User size={16} color="#38bdf8" />
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
                            <User size={12} color="#38bdf8" /> Name *
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
                            <Mail size={12} color="#38bdf8" /> Email *
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
                            <Phone size={12} color="#38bdf8" /> Mobile No *
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
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "6px" }}>
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
                        style={{ cursor: "pointer" }}
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
                      />
                    </div>
                  </div>

                  {category === "block_appeal" && (
                    <div
                      style={{
                        marginBottom: "14px",
                        padding: "12px 14px",
                        borderRadius: "10px",
                        background: "rgba(239, 68, 68, 0.12)",
                        border: "1px solid rgba(239, 68, 68, 0.35)",
                        color: "#fca5a5",
                        fontSize: "0.82rem",
                        lineHeight: "1.45",
                      }}
                    >
                      <div style={{ fontWeight: 800, color: "#f87171", display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                        <span>🚨</span> Incident ID Required:
                      </div>
                      <div>
                        Please specify the <strong>Incident ID (e.g. <code>FSM-SEC-XXXXXX</code>)</strong> displayed on your lockdown screen. Without this Incident ID, administrators cannot identify and release your IP or account.
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: "18px" }}>
                    <label className="form-label">
                      {category === "block_appeal" ? "Block Appeal Details & Reason *" : "Your Question / Details *"}
                    </label>
                    <textarea
                      className="form-input"
                      rows={4}
                      placeholder={
                        category === "block_appeal"
                          ? "Provide your Incident ID (e.g. FSM-SEC-XXXXXX), registered email/mobile number, and a brief description of the incident. Administrators will review the telemetry and unblock your account."
                          : "Type your question or requirement clearly here. Our admin team will receive this on Telegram and answer you directly."
                      }
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      required
                      style={{ resize: "vertical" }}
                    />
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
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#fff",
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
                    background: "rgba(244, 63, 94, 0.1)",
                    color: "#fda4af",
                    fontSize: "0.8rem",
                  }}
                >
                  {lookupError}
                </div>
              )}

              {loadingTickets ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-dim)" }}>
                  <div className="spinner" style={{ margin: "0 auto 10px auto" }} />
                  <span>Loading ticket status...</span>
                </div>
              ) : myTickets.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 10px", color: "var(--text-dim)" }}>
                  <Ticket size={36} style={{ margin: "0 auto 12px auto", opacity: 0.4 }} />
                  <p style={{ margin: "0 0 6px 0", fontSize: "0.92rem", fontWeight: 600 }}>No tickets found on this device</p>
                  <p style={{ margin: "0 0 16px 0", fontSize: "0.8rem" }}>
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
                          background: isAnswered ? "rgba(16, 185, 129, 0.05)" : "rgba(255, 255, 255, 0.03)",
                          border: isAnswered
                            ? "1px solid rgba(16, 185, 129, 0.25)"
                            : "1px solid rgba(255, 255, 255, 0.08)",
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
                            <span style={{ fontWeight: 700, color: "#38bdf8", fontSize: "0.92rem" }}>
                              #{t.ticket_code}
                            </span>
                            <span
                              style={{
                                fontSize: "0.72rem",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                background: "rgba(255, 255, 255, 0.08)",
                                color: "var(--text-dim)",
                                textTransform: "capitalize",
                              }}
                            >
                              {t.category || "General"}
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {isAnswered ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontSize: "0.75rem",
                                  color: "#10b981",
                                  background: "rgba(16, 185, 129, 0.15)",
                                  padding: "3px 8px",
                                  borderRadius: "12px",
                                  fontWeight: 600,
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
                                  color: "#f59e0b",
                                  background: "rgba(245, 158, 11, 0.15)",
                                  padding: "3px 8px",
                                  borderRadius: "12px",
                                  fontWeight: 600,
                                }}
                              >
                                <Clock size={13} />
                                Pending Admin Review
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Question */}
                        <div style={{ marginBottom: "12px" }}>
                          <p style={{ margin: 0, fontSize: "0.85rem", color: "#f8fafc", lineHeight: "1.4" }}>
                            {t.question}
                          </p>
                          {t.subject && (
                            <span style={{ fontSize: "0.74rem", color: "var(--text-dim)", marginTop: "4px", display: "block" }}>
                              Subject / Note: {t.subject}
                            </span>
                          )}
                        </div>

                        {/* Admin Answer Box */}
                        {isAnswered ? (
                          <div
                            style={{
                              background: "rgba(16, 185, 129, 0.1)",
                              borderLeft: "3px solid #10b981",
                              padding: "10px 14px",
                              borderRadius: "0 8px 8px 0",
                              marginTop: "8px",
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
                              <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "#34d399" }}>
                                👑 Admin Response ({t.admin_name || "Platform Admin"})
                              </span>
                              {t.replied_at && (
                                <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                                  {new Date(t.replied_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              )}
                            </div>
                            <p style={{ margin: 0, fontSize: "0.84rem", color: "#ecfdf5", lineHeight: "1.45" }}>
                              {t.admin_reply}
                            </p>
                          </div>
                        ) : (
                          <div
                            style={{
                              fontSize: "0.76rem",
                              color: "var(--text-dim)",
                              fontStyle: "italic",
                              background: "rgba(0, 0, 0, 0.2)",
                              padding: "8px 12px",
                              borderRadius: "6px",
                            }}
                          >
                            ⏳ Your question has been forwarded to the Telegram admin desk. As soon as admin replies, their answer will appear right here.
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

