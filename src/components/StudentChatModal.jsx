import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  X,
  Send,
  Paperclip,
  Smile,
  Shield,
  Crown,
  Lock,
  Globe,
  Plus,
  Key,
  Users,
  Trash2,
  Edit2,
  Copy,
  Check,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Megaphone,
  RefreshCw,
  LogOut,
  Download,
  Eye,
  MoreVertical,
  CheckCircle,
  ArrowLeft,
  Sparkles,
  Heart,
  MessageCircle,
  Share2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  CornerUpLeft,
  Play,
  Pause,
  BookOpen,
  User,
  CheckCheck,
  ShieldOff,
  UserX,
  UserCheck,
  Camera,
  Search,
} from "lucide-react";
import { api, getAuthToken } from "../api";
import { formatFileSize } from "../utils/formatUtils";

// Deterministic vibrant color for student names (Modern Messenger style)
const getUsernameColor = (userId, name) => {
  const colors = [
    "#38bdf8", // Sky
    "#34d399", // Emerald
    "#f472b6", // Pink
    "#fbbf24", // Amber
    "#a78bfa", // Purple
    "#fb923c", // Orange
    "#4ade80", // Green
    "#22d3ee", // Cyan
    "#e879f9", // Fuchsia
  ];
  const str = String(userId || name || "student");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// Format message timestamp (e.g. "10:45 AM")
const formatMessageTime = (dateStr) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (_) {
    return "";
  }
};

// Format date separator label (e.g. "Today", "Yesterday", or "Oct 17, 2026")
const formatDateSeparator = (dateStr) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
      return "Today";
    }
    if (d.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  } catch (_) {
    return "";
  }
};

// Popular Emojis for quick reactions and picker
const POPULAR_EMOJIS = ["❤️", "😂", "🔥", "👍", "📚", "💡", "🚀", "🎓", "✨", "💯", "👏", "🎯", "⚡", "🙏", "🧠", "📖"];

// 🎵 Synthesize Web Audio API sound effects (Zero external files, 0ms latency)
const playChime = (type = "receive") => {
  try {
    const isMuted = localStorage.getItem("study_chat_mute") === "true";
    if (isMuted) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === "send") {
      // Pleasant upward whoosh-chime
      osc.type = "sine";
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(840, now + 0.12);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === "receive") {
      // Crisp subtle pop / ding
      osc.type = "triangle";
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.exponentialRampToValueAtTime(1020, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(550, now + 0.18);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === "heart") {
      // Warm double-tap heart pop
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  } catch (_) {}
};

// 🎙️ Sleek Audio Waveform Message Player (Instagram / WhatsApp Voice Note)
function AudioMessagePlayer({ fileUrl, duration, isMine }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const formatSecs = (sec) => {
    const sInt = Math.floor(sec || 0);
    const m = Math.floor(sInt / 60);
    const s = sInt % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const totalDuration = duration || (audioRef.current?.duration ? Math.round(audioRef.current.duration) : 0);
  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "220px", maxWidth: "100%", padding: "4px 0" }}>
      <audio
        ref={audioRef}
        src={fileUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="metadata"
      />
      <button
        type="button"
        onClick={togglePlay}
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "50%",
          background: isMine ? "#ffffff" : "var(--accent-cyan)",
          color: isMine ? "#0284c7" : "#080c16",
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        }}
        title={isPlaying ? "Pause Voice Note" : "Play Voice Note"}
      >
        {isPlaying ? <Pause size={17} /> : <Play size={17} style={{ marginLeft: "2px" }} />}
      </button>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "5px" }}>
        {/* Waveform representation */}
        <div style={{ display: "flex", alignItems: "center", gap: "2px", height: "20px" }}>
          {[40, 70, 30, 90, 50, 80, 45, 100, 60, 35, 75, 55, 95, 40, 65, 85, 30, 70].map((h, i) => {
            const barProgress = (i / 18) * 100;
            const isFilled = progressPercent >= barProgress;
            return (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: `${h}%`,
                  borderRadius: "2px",
                  background: isFilled
                    ? (isMine ? "#ffffff" : "var(--accent-cyan)")
                    : (isMine ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.18)"),
                  transition: "background 0.1s ease",
                }}
              />
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", opacity: 0.85 }}>
          <span>{formatSecs(currentTime)}</span>
          <span>{totalDuration ? formatSecs(totalDuration) : "0:00"}</span>
        </div>
      </div>
    </div>
  );
}

// 📚 Interactive Note Card Bubble (Direct Vault Preview inside Chat)
function NoteChatCard({ noteData, onPreviewNote, isMine }) {
  if (!noteData) return null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        background: isMine ? "rgba(0,0,0,0.25)" : "rgba(15,23,42,0.7)",
        border: isMine ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.1)",
        borderRadius: "14px",
        padding: "12px",
        minWidth: "240px",
        maxWidth: "320px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 3px 10px rgba(99,102,241,0.3)",
          }}
        >
          <BookOpen size={18} color="#fff" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: "0.72rem", color: isMine ? "rgba(255,255,255,0.85)" : "var(--accent-cyan)", fontWeight: 700, textTransform: "uppercase" }}>
            {noteData.subject || "Academic Note"} • {noteData.year || "All Sem"}
          </div>
          <div style={{ fontSize: "0.88rem", fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={noteData.title}>
            {noteData.title}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.7rem", color: isMine ? "rgba(255,255,255,0.75)" : "var(--text-dim)" }}>
        <span>{formatFileSize(noteData.fileSize || 1048576)} • Verified Vault</span>
        {noteData.branch && <span>{noteData.branch}</span>}
      </div>

      <button
        type="button"
        onClick={() => onPreviewNote?.(noteData)}
        style={{
          marginTop: "4px",
          padding: "7px 12px",
          borderRadius: "8px",
          background: isMine ? "#ffffff" : "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
          color: isMine ? "#0369a1" : "#ffffff",
          border: "none",
          fontWeight: 700,
          fontSize: "0.78rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}
      >
        <Eye size={13} />
        <span>Open in PDF Reader</span>
      </button>
    </div>
  );
}

export default function StudentChatModal({
  isOpen,
  onClose,
  currentUser,
  onPreviewNote,
  onOpenAuth,
}) {
  const [activeTab, setActiveTab] = useState("public"); // "public" | "private" | "create_join"
  const [currentRoom, setCurrentRoom] = useState({ id: "public", name: "💬 Public Community Chat", isPrivate: false });
  const [rooms, setRooms] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [onlineCount, setOnlineCount] = useState(1);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [uploadingFile, setUploadingFile] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedUserIds, setBlockedUserIds] = useState(new Set());
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [blockedStudentsList, setBlockedStudentsList] = useState([]);
  const [loadingBlockedList, setLoadingBlockedList] = useState(false);
  const [roomParticipants, setRoomParticipants] = useState([]);
  const [mentionQuery, setMentionQuery] = useState("");
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [isIdleTimeout, setIsIdleTimeout] = useState(false);

  // Sound Chimes (persisted in localStorage)
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem("study_chat_mute") !== "true";
  });

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("study_chat_mute", (!next).toString());
      return next;
    });
  };

  // Reply Quoted Message State
  const [replyingTo, setReplyingTo] = useState(null);

  // Student Chat Identity & DP State (Stored in Turso Edge Cloud)
  const [chatProfile, setChatProfile] = useState({
    chatUsername: currentUser?.username || "",
    avatarUrl: currentUser?.photoUrl || currentUser?.avatar || "",
    avatarHistory: [],
  });
  const [showChatProfileModal, setShowChatProfileModal] = useState(false);
  const [editingUsername, setEditingUsername] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);
  const profileFileInputRef = useRef(null);

  // Student Profile Mini Popup State
  const [viewingProfile, setViewingProfile] = useState(null);

  // Floating Heart Animation State (msg.id)
  const [floatingHeartMsgId, setFloatingHeartMsgId] = useState(null);

  // Audio Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  // Mobile Keyboard Viewport Offset
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  // Quick Emoji Tray Toggle
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Active hover/tap message id for reaction bar & context menu
  const [activeMessageActionId, setActiveMessageActionId] = useState(null);
  const [messageContextMenuId, setMessageContextMenuId] = useState(null);

  // Live Student Search in Blocked Directory Modal
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [studentSearchResults, setStudentSearchResults] = useState([]);
  const [searchingStudents, setSearchingStudents] = useState(false);

  // Pinned Notice
  const [chatNotice, setChatNotice] = useState({ text: "", updatedBy: "Admin" });
  const [isEditingNotice, setIsEditingNotice] = useState(false);
  const [noticeDraft, setNoticeDraft] = useState("");

  // Edit Message State
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState("");

  // Create / Join Private Room State
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomSecret, setNewRoomSecret] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  // Share Private Chat Modal State
  const [shareRoomModal, setShareRoomModal] = useState(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [copiedShareCode, setCopiedShareCode] = useState(false);

  // Rename Private Chat Modal State
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTargetRoom, setRenameTargetRoom] = useState(null);
  const [newRoomNameInput, setNewRoomNameInput] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);

  // Auto-fill invite code if URL parameter present
  useEffect(() => {
    if (!isOpen) return;
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get("code") || params.get("chat_join");
    if (codeParam && codeParam.trim()) {
      setJoinCode(codeParam.trim().toUpperCase());
      setActiveTab("create_join");
    }
  }, [isOpen]);

  // Image Lightbox Viewer
  const [lightboxUrl, setLightboxUrl] = useState(null);

  // 📚 Share Note Destination Modal State
  const [shareNoteModal, setShareNoteModal] = useState(null);
  const [shareTargetRoomId, setShareTargetRoomId] = useState("public");
  const [shareCustomText, setShareCustomText] = useState("");

  // WebSocket Ref
  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const textInputRef = useRef(null);

  const isAdmin = Boolean(
    currentUser?.isMainAdmin ||
    currentUser?.isAdmin ||
    currentUser?.role === "admin" ||
    currentUser?.role === "half_admin" ||
    currentUser?.role === "sub_admin" ||
    currentUser?.role === "moderator" ||
    (Array.isArray(currentUser?.permissions) && (
      currentUser.permissions.includes("all") ||
      currentUser.permissions.includes("manage_chat") ||
      currentUser.permissions.includes("delete_records") ||
      currentUser.permissions.includes("manage_users")
    ))
  );

  const isUserBlocked = (uid) => Boolean(uid && (blockedUserIds instanceof Set ? blockedUserIds.has(uid) : false));

  // Scroll to bottom
  const scrollToBottom = (behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Fetch Rooms & Initial State
  const loadRoomsAndNotice = async () => {
    if (!currentUser) return;
    try {
      const res = await api.getChatRooms();
      if (res && res.success) {
        setRooms(res.rooms || []);
        if (res.notice) {
          setChatNotice(res.notice);
          setNoticeDraft(res.notice.text || "");
        }
        if (res.isBlocked !== undefined) setIsBlocked(Boolean(res.isBlocked));
        if (res.blockedUserIds && Array.isArray(res.blockedUserIds)) {
          setBlockedUserIds(new Set(res.blockedUserIds));
        }
      }
      api.getChatProfile().then((pRes) => {
        if (pRes && pRes.success && pRes.profile) {
          setChatProfile(pRes.profile);
          setEditingUsername(pRes.profile.chatUsername || "");
          setAvatarPreview(pRes.profile.avatarUrl || "");
        }
      }).catch(() => {});
    } catch (err) {
      console.warn("[CHAT] Rooms load error:", err.message);
    }
  };

  // Connect WebSocket
  useEffect(() => {
    if (!isOpen || !currentUser) return;

    loadRoomsAndNotice();

    let isCancelled = false;
    let ws = null;

    const establishWebSocket = async () => {
      let token = getAuthToken() || "";
      if (!token) {
        try {
          const res = await api.getChatWsToken();
          if (res?.token) {
            token = res.token;
            setAuthToken(token);
          }
        } catch (_) {}
      }

      if (isCancelled) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/chat?token=${encodeURIComponent(token || "")}`;

      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Automatically join current room on connect
        ws.send(
          JSON.stringify({
            type: "join_room",
            roomId: currentRoom.id,
            secretCode: currentRoom.secretCode || "",
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "room_joined") {
          setMessages(data.messages || []);
          if (data.room) {
            setOnlineCount(data.room.membersCount || 1);
            if (data.room.participants) {
              setRoomParticipants(data.room.participants);
            }
            if (data.room.createdBy) {
              setCurrentRoom((prev) => ({
                ...prev,
                createdBy: data.room.createdBy,
                creatorName: data.room.creatorName || prev.creatorName,
              }));
            }
          }
          if (data.notice) {
            setChatNotice(data.notice);
            setNoticeDraft(data.notice.text || "");
          }
          // Acknowledge read for unread messages
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "mark_read" }));
          }
          setTimeout(() => scrollToBottom("auto"), 80);
        } else if (data.type === "new_message") {
          setMessages((prev) => [...prev, data.message]);
          if (data.message.sender?.id !== currentUser?.id) {
            playChime("receive");
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "mark_read" }));
            }
          }
          setTimeout(() => scrollToBottom("smooth"), 50);
        } else if (data.type === "message_reaction") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === data.messageId ? { ...m, reactions: data.reactions } : m
            )
          );
        } else if (data.type === "messages_read") {
          setMessages((prev) =>
            prev.map((m) =>
              data.messageIds?.includes(m.id) ? { ...m, status: "read" } : m
            )
          );
        } else if (data.type === "message_edited") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === data.messageId
                ? { ...m, text: data.newText, isEdited: true, editedAt: data.editedAt }
                : m
            )
          );
        } else if (data.type === "message_deleted") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === data.messageId
                ? { ...m, isDeleted: true, text: data.text, fileUrl: null }
                : m
            )
          );
        } else if (data.type === "user_messages_purged") {
          setMessages((prev) => prev.filter((m) => m.sender?.id !== data.targetUserId));
        } else if (data.type === "presence_update") {
          if (data.membersCount !== undefined) {
            setOnlineCount(data.membersCount);
          }
          if (data.userJoined) {
            setRoomParticipants((prev) => {
              const filtered = prev.filter((u) => u.id !== data.userJoined.id);
              return [...filtered, data.userJoined];
            });
          }
          if (data.userLeft) {
            setRoomParticipants((prev) => prev.filter((u) => u.id !== data.userLeft.id));
          }
        } else if (data.type === "user_profile_updated") {
          if (data.user) {
            if (data.user.id === currentUser?.id) {
              setChatProfile((prev) => ({
                ...prev,
                chatUsername: data.user.username,
                avatarUrl: data.user.photoUrl,
              }));
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.sender?.id === data.user.id
                  ? {
                      ...m,
                      sender: {
                        ...m.sender,
                        username: data.user.username,
                        photoUrl: data.user.photoUrl,
                      },
                    }
                  : m
              )
            );
            setRoomParticipants((prev) =>
              prev.map((p) =>
                p.id === data.user.id
                  ? {
                      ...p,
                      username: data.user.username,
                      photoUrl: data.user.photoUrl,
                    }
                  : p
              )
            );
          }
        } else if (data.type === "session_timeout") {
          setIsIdleTimeout(true);
        } else if (data.type === "notice_updated") {
          setChatNotice(data.notice);
          setNoticeDraft(data.notice.text || "");
        } else if (data.type === "chat_purged") {
          setMessages([]);
        } else if (data.type === "user_typing") {
          setTypingUsers((prev) => {
            const next = new Set(prev);
            next.add(data.user.name);
            return next;
          });
          setTimeout(() => {
            setTypingUsers((prev) => {
              const next = new Set(prev);
              next.delete(data.user.name);
              return next;
            });
          }, 2500);
        } else if (data.type === "room_renamed") {
          setCurrentRoom((prev) => {
            if (prev && prev.id === data.roomId) {
              return { ...prev, name: data.newName };
            }
            return prev;
          });
          setRooms((prev) =>
            (Array.isArray(prev) ? prev : []).map((r) =>
              r && r.id === data.roomId ? { ...r, name: data.newName } : r
            )
          );
        } else if (data.type === "room_closed") {
          alert(`🔒 ${data.message || "This private chat was permanently closed and deleted."}`);
          setRooms((prev) => prev.filter((r) => r.id !== data.roomId));
          if (currentRoom.id === data.roomId) {
            handleSwitchRoom({ id: "public", name: "💬 Public Community Chat", isPrivate: false });
          }
        } else if (data.type === "left_room_success") {
          setRooms((prev) => prev.filter((r) => r.id !== data.roomId));
          if (currentRoom.id === data.roomId) {
            handleSwitchRoom({ id: "public", name: "💬 Public Community Chat", isPrivate: false });
          }
        } else if (data.type === "blocked_status_update") {
          setIsBlocked(Boolean(data.isBlocked));
          if (data.message) {
            alert(data.message);
          }
        } else if (data.type === "admin_blocked_users_update") {
          if (Array.isArray(data.blockedUserIds)) {
            setBlockedUserIds(new Set(data.blockedUserIds));
          }
        } else if (data.type === "error") {
          alert(`⚠️ ${data.message}`);
        }
      } catch (e) {
        console.warn("[CHAT-WS] Parse error:", e.message);
      }
    };

      ws.onerror = (err) => {
        console.warn("[CHAT-WS] Socket error:", err);
      };
    };

    establishWebSocket();

    return () => {
      isCancelled = true;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, [isOpen, currentUser, currentRoom.id]);

  // 🛡️ Mobile Keyboard Viewport Adjuster (Zero Overlap with Input Bar)
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const handleViewportResize = () => {
      try {
        const vv = window.visualViewport;
        if (!vv) return;
        const offset = window.innerHeight - vv.height;
        setKeyboardOffset(offset > 50 ? offset : 0);
      } catch (_) {}
    };
    try {
      window.visualViewport.addEventListener("resize", handleViewportResize);
      window.visualViewport.addEventListener("scroll", handleViewportResize);
    } catch (_) {}
    return () => {
      try {
        window.visualViewport?.removeEventListener("resize", handleViewportResize);
        window.visualViewport?.removeEventListener("scroll", handleViewportResize);
      } catch (_) {}
    };
  }, []);

  const currentRoomRef = useRef(currentRoom);
  useEffect(() => {
    currentRoomRef.current = currentRoom;
  }, [currentRoom]);

  // ⚡ 1-Click Vault Note Share Listener - Opens Destination Choice Dialog (Public vs Private Pod)
  useEffect(() => {
    const handleShareNoteToChat = (e) => {
      const note = e.detail;
      if (!note) return;
      loadRoomsAndNotice();
      setShareNoteModal(note);
      const curId = currentRoomRef.current?.id;
      setShareTargetRoomId(curId || "public");
      setShareCustomText(`📚 Check out: ${note.title || note.subject || "Study Note"}`);
    };

    window.addEventListener("share_note_to_chat", handleShareNoteToChat);
    return () => window.removeEventListener("share_note_to_chat", handleShareNoteToChat);
  }, []);

  const handleConfirmShareNote = () => {
    if (!shareNoteModal) return;
    const note = shareNoteModal;
    const targetRoom =
      (Array.isArray(rooms) ? rooms : []).find((r) => r && r.id === shareTargetRoomId) ||
      (shareTargetRoomId === "public"
        ? { id: "public", name: "💬 Public Community Chat", isPrivate: false }
        : currentRoom);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "send_message",
          roomId: targetRoom.id,
          secretCode: targetRoom.secretCode || "",
          text: shareCustomText.trim() || `Shared Note: ${note.title}`,
          messageType: "note",
          noteData: {
            id: note.id,
            title: note.title,
            subject: note.subject,
            branch: note.branch,
            year: note.year,
            fileSize: note.fileSize,
            fileUrl: note.fileUrl || note.downloadUrl || "",
          },
        })
      );
      playChime("send");

      if (currentRoom.id !== targetRoom.id) {
        handleSwitchRoom(targetRoom);
      }
      setTimeout(() => scrollToBottom("smooth"), 100);
    }
    setShareNoteModal(null);
  };

  // Switch Room
  const handleSwitchRoom = (room) => {
    setCurrentRoom(room);
    setActiveTab(room.isPrivate ? "private" : "public");
    setMessages([]);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "join_room",
          roomId: room.id,
          secretCode: room.secretCode || "",
        })
      );
    }
  };

  // Handle Input Change & Mention Trigger Detection (@)
  const handleInputChange = (e) => {
    const text = e.target.value;
    setMessageText(text);

    // Detect mention trigger when user types @
    const cursorPos = e.target.selectionStart || text.length;
    const textBeforeCursor = text.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@([a-zA-Z0-9_.]*)$/);
    if (match) {
      setMentionQuery(match[1].toLowerCase());
      setShowMentionDropdown(true);
    } else {
      setShowMentionDropdown(false);
    }

    // Broadcast typing indicator
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (!typingTimeoutRef.current) {
        wsRef.current.send(JSON.stringify({ type: "typing", roomId: currentRoom.id }));
      }
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        typingTimeoutRef.current = null;
      }, 2500);
    }
  };

  // Insert Selected Mention into Message Input
  const insertMention = (tag) => {
    const input = textInputRef.current;
    if (!input) {
      setMessageText((prev) => prev + " " + tag + " ");
      setShowMentionDropdown(false);
      return;
    }

    const cursorPos = input.selectionStart || messageText.length;
    const textBeforeCursor = messageText.slice(0, cursorPos);
    const textAfterCursor = messageText.slice(cursorPos);

    const replacedBefore = textBeforeCursor.replace(/@([a-zA-Z0-9_.]*)$/, `${tag} `);
    const newFullText = replacedBefore + textAfterCursor;

    setMessageText(newFullText);
    setShowMentionDropdown(false);

    setTimeout(() => {
      input.focus();
      const newPos = replacedBefore.length;
      input.setSelectionRange(newPos, newPos);
    }, 10);
  };

  // Compute Active Mention Suggestions
  const mentionSuggestions = useMemo(() => {
    try {
      if (!showMentionDropdown) return [];
      const q = (mentionQuery || "").toLowerCase();

      const specialTags = [
        {
          id: "mention_all",
          tag: "@all",
          name: "All Members",
          subtitle: "Notify everyone in room",
          badge: "📢",
          color: "#fbbf24",
        },
        {
          id: "mention_admin",
          tag: "@admin",
          name: "Administrators",
          subtitle: "Notify support & admins",
          badge: "🛡️",
          color: "#f87171",
        },
      ];

      const userMap = new Map();
      // Add current room participants
      (roomParticipants || []).forEach((u) => {
        if (u && u.id && u.id !== currentUser?.id) {
          userMap.set(u.id, u);
        }
      });

      // Also collect senders from room messages
      (messages || []).forEach((m) => {
        if (m && m.sender && m.sender.id && m.sender.id !== currentUser?.id) {
          userMap.set(m.sender.id, {
            id: m.sender.id,
            name: m.sender.name || "Student",
            username: m.sender.username || "",
            photoUrl: m.sender.photoUrl || "",
            role: m.sender.role || "student",
          });
        }
      });

      const participantTags = Array.from(userMap.values()).map((u) => {
        const handle = u.username || (u.name || "").toLowerCase().replace(/[^a-z0-9_]/g, "") || "student";
        return {
          id: u.id,
          tag: `@${handle}`,
          name: u.name || "Student",
          username: u.username || "",
          photoUrl: u.photoUrl || "",
          subtitle: u.role === "admin" ? "Admin Staff" : "Student Scholar",
          badge: "👤",
          color: "#38bdf8",
        };
      });

      const combined = [...specialTags, ...participantTags];
      if (!q) return combined.slice(0, 8);

      return combined
        .filter((item) => {
          if (!item) return false;
          const tagMatch = (item.tag || "").toLowerCase().includes(q);
          const nameMatch = (item.name || "").toLowerCase().includes(q);
          const userMatch = item.username ? (item.username || "").toLowerCase().includes(q) : false;
          return tagMatch || nameMatch || userMatch;
        })
        .slice(0, 8);
    } catch (err) {
      console.warn("[CHAT] mentionSuggestions calculation fallback:", err);
      return [];
    }
  }, [showMentionDropdown, mentionQuery, roomParticipants, messages, currentUser?.id]);

  // Handle Avatar file picker select
  const handleAvatarFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileMsg({ type: "error", text: "Please select an image file (PNG, JPG, WebP)." });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setProfileMsg({ type: "error", text: "Image size must be under 8 MB." });
      return;
    }
    setAvatarFile(file);
    try {
      const previewUrl = URL.createObjectURL(file);
      setAvatarPreview(previewUrl);
    } catch (_) {}
    setProfileMsg(null);
  };

  // Live Reserved Username Shield Check
  const isUsernameReserved = useMemo(() => {
    if (!editingUsername) return false;
    if (isAdmin) return false;
    const lower = editingUsername.toLowerCase().trim();
    const reservedList = [
      "admin", "administrator", "root", "staff", "mod", "moderator",
      "fsm", "freestudymaterial", "fsmadmin", "fsm_admin", "official", "support",
      "helpdesk", "system", "security", "owner", "superuser", "founder",
      "coreconcepts", "bot", "ai", "team", "securitybot", "fsmchat", "vault",
      "academic", "academic_cloud", "webmaster"
    ];
    return reservedList.some((r) => lower === r || lower.startsWith(r) || lower.includes(r));
  }, [editingUsername, isAdmin]);

  // Save Chat Profile & DP to Turso
  const handleSaveChatProfile = async () => {
    if (isUsernameReserved) {
      setProfileMsg({ type: "error", text: "This username is reserved for system administrators. Please choose a different student handle." });
      return;
    }
    const clean = editingUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (clean && (clean.length < 3 || clean.length > 24)) {
      setProfileMsg({ type: "error", text: "Chat username must be between 3 and 24 characters (letters, numbers, and underscores)." });
      return;
    }

    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await api.updateChatProfile({
        username: clean,
        avatarFile,
        photoUrl: avatarFile ? undefined : avatarPreview,
      });

      if (res && res.success && res.profile) {
        setChatProfile(res.profile);
        setProfileMsg({ type: "success", text: "✅ Chat profile & DP updated successfully!" });
        setTimeout(() => {
          setShowChatProfileModal(false);
          setProfileMsg(null);
        }, 1200);
      } else {
        setProfileMsg({ type: "error", text: res?.message || "Failed to update chat profile." });
      }
    } catch (err) {
      setProfileMsg({ type: "error", text: err.message || "Failed to save chat profile." });
    } finally {
      setSavingProfile(false);
    }
  };

  // Send Message
  const handleSendMessage = (e) => {
    e?.preventDefault();
    if (!messageText.trim() || isBlocked) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "send_message",
          text: messageText.trim(),
          messageType: "text",
          replyTo: replyingTo
            ? {
                id: replyingTo.id,
                text: replyingTo.text,
                senderName: replyingTo.senderName,
                type: replyingTo.type,
              }
            : null,
        })
      );
      playChime("send");
      setMessageText("");
      setShowEmojiPicker(false);
      setReplyingTo(null);
    }
  };

  // Quick Emoji Reaction or Insert
  const handleQuickReaction = (emoji, msg = null) => {
    if (msg) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "react_message",
            messageId: msg.id,
            emoji,
          })
        );
        playChime("heart");
      }
      setActiveMessageActionId(null);
    } else {
      setMessageText((prev) => prev + emoji);
      textInputRef.current?.focus();
    }
  };

  // Start Voice Note Recording
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert("Audio recording is not supported on this browser.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone permission denied or not available: " + err.message);
    }
  };

  // Cancel Voice Note Recording
  const cancelRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach((track) => track.stop());
    }
    setIsRecording(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];
  };

  // Stop & Send Voice Note
  const sendRecording = async () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    const duration = recordingDuration;
    setIsRecording(false);
    setRecordingDuration(0);

    recorder.onstop = async () => {
      try {
        recorder.stream?.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (audioBlob.size < 500) return;

        const audioFile = new File([audioBlob], `voice-note-${Date.now()}.webm`, { type: "audio/webm" });
        setUploadingFile(true);
        const res = await api.uploadChatMedia(audioFile);
        if (res && res.success && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "send_message",
              text: `🎙️ Voice Note (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")})`,
              messageType: "audio",
              fileUrl: res.fileUrl,
              fileName: res.fileName,
              fileSize: res.fileSize,
              audioDuration: duration,
              replyTo: replyingTo
                ? {
                    id: replyingTo.id,
                    text: replyingTo.text,
                    senderName: replyingTo.senderName,
                    type: replyingTo.type,
                  }
                : null,
            })
          );
          playChime("send");
          setReplyingTo(null);
        }
      } catch (err) {
        alert("Failed to send voice note: " + err.message);
      } finally {
        setUploadingFile(false);
        audioChunksRef.current = [];
      }
    };

    recorder.stop();
  };

  const handleFileUpload = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      alert("File size exceeds 50 MB limit.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      setUploadingFile(true);
      const res = await api.uploadChatMedia(file);
      if (res && res.success && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const isPdf = file.type?.includes("pdf") || file.name?.toLowerCase().endsWith(".pdf");
        const isImg = file.type?.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
        const msgType = isImg ? "image" : isPdf ? "document" : "file";

        wsRef.current.send(
          JSON.stringify({
            type: "send_message",
            text: isPdf ? `📄 Academic Document: ${res.fileName || file.name}` : `🖼️ Image: ${res.fileName || file.name}`,
            messageType: msgType,
            fileUrl: res.fileUrl,
            fileName: res.fileName || file.name,
            fileSize: res.fileSize || file.size,
            replyTo: replyingTo
              ? {
                  id: replyingTo.id,
                  text: replyingTo.text,
                  senderName: replyingTo.senderName,
                  type: replyingTo.type,
                }
              : null,
          })
        );
        playChime("send");
        setReplyingTo(null);
      }
    } catch (err) {
      alert("Failed to upload attachment: " + err.message);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Double-tap on bubble triggers Heart pop
  const handleBubbleDoubleTap = (msg) => {
    if (msg.isDeleted) return;
    setFloatingHeartMsgId(msg.id);
    playChime("heart");
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "react_message",
          messageId: msg.id,
          emoji: "❤️",
        })
      );
    }
    setTimeout(() => {
      setFloatingHeartMsgId((prev) => (prev === msg.id ? null : prev));
    }, 900);
  };

  // Start reply to a message
  const handleStartReply = (msg) => {
    setReplyingTo({
      id: msg.id,
      text: msg.text,
      senderName: msg.sender?.name || "Scholar",
      type: msg.type,
      fileName: msg.fileName,
    });
    textInputRef.current?.focus();
  };

  // Smooth scroll to quoted message and pulse
  const scrollToMessage = (msgId) => {
    const el = document.getElementById(`scm-msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("scm-highlight-bubble");
      setTimeout(() => el.classList.remove("scm-highlight-bubble"), 1600);
    }
  };

  // Save Message Edit
  const handleSaveEdit = (messageId) => {
    if (!editText.trim()) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "edit_message",
          messageId,
          newText: editText.trim(),
        })
      );
    }
    setEditingMessageId(null);
    setEditText("");
  };

  // Delete Message (Single)
  const handleDeleteMessage = (messageId) => {
    if (!window.confirm("Delete this message?")) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "delete_message",
          messageId,
        })
      );
    }
  };

  // Admin Action: Delete ALL messages by a specific student in current chat
  const handleDeleteAllByUser = async (targetUserId, targetUserName = "this student") => {
    if (!targetUserId) return;
    if (
      !window.confirm(
        `⚠️ Admin Action: Delete ALL messages sent by "${targetUserName}" in ${currentRoom?.name || "chat"}?\n\nThis will permanently delete all messages, photos, and files sent by this student.`
      )
    ) {
      return;
    }
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "delete_user_messages",
            targetUserId,
            roomId: currentRoom.id,
          })
        );
      }
      await api.deleteUserChatMessages(targetUserId, currentRoom.id).catch(() => {});
      setMessages((prev) => prev.filter((m) => m.sender?.id !== targetUserId));
    } catch (err) {
      alert("Failed to delete user messages: " + err.message);
    }
  };

  // Live Student Search in Blocked Directory Modal
  const handleStudentSearchChange = async (query) => {
    setStudentSearchQuery(query);
    if (!query || query.trim().length < 2) {
      setStudentSearchResults([]);
      return;
    }
    try {
      setSearchingStudents(true);
      const res = await api.searchChatStudents(query.trim());
      if (res && res.success) {
        setStudentSearchResults(res.users || []);
      }
    } catch (e) {
      console.warn("[STUDENT-SEARCH] Error:", e.message);
    } finally {
      setSearchingStudents(false);
    }
  };

  // Create Private Chat Room
  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    try {
      setCreatingRoom(true);
      setCreateSuccess("");
      setJoinError("");
      const res = await api.createChatRoom(newRoomName, newRoomSecret, "");
      if (res && res.success) {
        setCreateSuccess(`Private Chat "${res.room.name}" created! Invite Code: ${res.room.secretCode}`);
        setNewRoomName("");
        setNewRoomSecret("");
        loadRoomsAndNotice();
        handleSwitchRoom(res.room);
        setShareRoomModal(res.room); // 🚀 Immediate Share Option after creating Private Chat!
      }
    } catch (err) {
      setJoinError(err.message || "Failed to create private chat.");
    } finally {
      setCreatingRoom(false);
    }
  };

  // Join Private Room via Code
  const handleJoinByCode = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    try {
      setJoinError("");
      const res = await api.joinChatRoom(joinCode.trim());
      if (res && res.success) {
        handleSwitchRoom(res.room);
        setJoinCode("");
        loadRoomsAndNotice();
      }
    } catch (err) {
      setJoinError(err.message || "Invalid invite code.");
    }
  };

  // Copy Room Secret Key
  const handleCopySecretKey = () => {
    if (!currentRoom.secretCode) return;
    navigator.clipboard.writeText(currentRoom.secretCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Share Private Chat Room (Opens Share Modal with 1-click Link, Code & Social Share)
  const handleSharePrivateRoom = (room = currentRoom) => {
    if (!room || !room.isPrivate) return;
    setShareRoomModal(room);
  };

  // Host / Admin Action: Rename Private Chat
  const openRenameModal = (room = currentRoom) => {
    const target = room || currentRoom;
    if (!target || !target.isPrivate) return;
    setRenameTargetRoom(target);
    setNewRoomNameInput(target.name || "");
    setRenameModalOpen(true);
  };

  const handleSaveRoomRename = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const target = renameTargetRoom || currentRoom;
    if (!target || !target.id) return;
    const trimmed = newRoomNameInput.trim();
    if (!trimmed) {
      alert("Please enter a valid room name.");
      return;
    }
    if (trimmed === target.name) {
      setRenameModalOpen(false);
      return;
    }

    try {
      setRenameLoading(true);
      // 1. Broadcast via WebSocket for instant 0ms update to all participants
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "rename_room",
            roomId: target.id,
            newName: trimmed,
          })
        );
      }

      // 2. Call REST API for server / Firestore persistence
      await api.renameChatRoom(target.id, trimmed).catch(() => {});

      // 3. Update local UI immediately
      setCurrentRoom((prev) => (prev && prev.id === target.id ? { ...prev, name: trimmed } : prev));
      setRooms((prev) =>
        (Array.isArray(prev) ? prev : []).map((r) =>
          r && r.id === target.id ? { ...r, name: trimmed } : r
        )
      );

      setRenameModalOpen(false);
    } catch (err) {
      alert("Failed to rename room: " + err.message);
    } finally {
      setRenameLoading(false);
    }
  };

  // Host / Admin Action: Permanently Delete Private Chat (Erased for everyone)
  const handleDeletePrivateRoom = async () => {
    if (!currentRoom.isPrivate) return;
    const confirmMsg = `Permanently delete "${currentRoom.name}"?\n\n• All messages, files, and chat history will be permanently erased for everyone.\n• This action cannot be undone.`;

    if (window.confirm(confirmMsg)) {
      try {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "close_room", roomId: currentRoom.id }));
        }
        await api.closeChatRoom(currentRoom.id).catch(() => {});
      } catch (err) {
        console.warn("[CHAT] Close room error:", err.message);
      }
      setRooms((prev) => prev.filter((r) => r.id !== currentRoom.id));
      handleSwitchRoom({ id: "public", name: "💬 Public Community Chat", isPrivate: false });
    }
  };

  // Participant Action: Leave Private Chat (Host stays; chat remains active for others)
  const handleLeavePrivateRoom = async () => {
    if (!currentRoom.isPrivate) return;
    const confirmMsg = `Leave "${currentRoom.name}"?\n\n• You will exit this private chat.\n• The chat will remain active for the host and other members.\n• You can rejoin later using the invite code.`;

    if (window.confirm(confirmMsg)) {
      try {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "leave_room", roomId: currentRoom.id }));
        }
        await api.leaveChatRoom(currentRoom.id).catch(() => {});
      } catch (err) {
        console.warn("[CHAT] Leave room error:", err.message);
      }
      setRooms((prev) => prev.filter((r) => r.id !== currentRoom.id));
      handleSwitchRoom({ id: "public", name: "💬 Public Community Chat", isPrivate: false });
    }
  };

  // Purge Room (Admin Only)
  const handlePurgeRoom = async () => {
    if (!window.confirm(`Admin Action: Clear all messages in "${currentRoom.name}"?`)) return;
    try {
      await api.purgeChatRoom(currentRoom.id);
      setMessages([]);
    } catch (err) {
      alert("Purge error: " + err.message);
    }
  };

  // Save Announcement Notice (Admin Only)
  const handleSaveNotice = async () => {
    try {
      const res = await api.updateChatNotice(noticeDraft);
      if (res && res.success) {
        setChatNotice(res.notice);
        setIsEditingNotice(false);
      }
    } catch (err) {
      alert("Failed to save notice: " + err.message);
    }
  };

  // Block / Unblock Student (Admin Only)
  const handleToggleBlockStudent = async (targetUserId, targetName) => {
    if (!targetUserId) return;
    const isCurrentlyBlocked = isUserBlocked(targetUserId);
    const actionPrompt = isCurrentlyBlocked
      ? `Unblock "${targetName || "this student"}" and restore full chat participation?`
      : `Restrict "${targetName || "this student"}" from participating in chat across all rooms?`;

    if (!window.confirm(actionPrompt)) return;

    try {
      const shouldBlock = !isCurrentlyBlocked;
      const res = await api.blockChatUser(targetUserId, shouldBlock);
      setBlockedUserIds((prev) => {
        const next = new Set(prev);
        if (shouldBlock) {
          next.add(targetUserId);
        } else {
          next.delete(targetUserId);
        }
        return next;
      });
      alert(res.message || (shouldBlock ? "Student restricted." : "Student unblocked."));
      if (showBlockedModal) {
        fetchBlockedStudents();
      }
    } catch (err) {
      alert("Action error: " + err.message);
    }
  };

  const fetchBlockedStudents = async () => {
    setLoadingBlockedList(true);
    try {
      const res = await api.getBlockedChatUsers();
      if (res && res.success && Array.isArray(res.blockedUsers)) {
        setBlockedStudentsList(res.blockedUsers);
        setBlockedUserIds(new Set(res.blockedUsers.map((u) => u.id)));
      }
    } catch (err) {
      console.warn("[BLOCKED-STUDENTS] Fetch error:", err.message);
    } finally {
      setLoadingBlockedList(false);
    }
  };

  // Render message content with rich preview cards
  const renderMessageContent = (msg, isMine) => {
    if (msg.isDeleted) {
      return (
        <span style={{ fontStyle: "italic", opacity: 0.75, display: "inline-flex", alignItems: "center", gap: "5px" }}>
          <Trash2 size={13} /> This message was deleted
        </span>
      );
    }

    if (msg.type === "audio") {
      return (
        <AudioMessagePlayer
          fileUrl={msg.fileUrl}
          duration={msg.audioDuration}
          isMine={isMine}
        />
      );
    }

    if (msg.type === "note") {
      return (
        <NoteChatCard
          noteData={msg.noteData}
          onPreviewNote={onPreviewNote}
          isMine={isMine}
        />
      );
    }

    if (msg.type === "pdf") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "210px", maxWidth: "100%" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: isMine ? "rgba(0,0,0,0.22)" : "rgba(15,23,42,0.6)",
              padding: "10px 12px",
              borderRadius: "12px",
              border: isMine ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 4px 12px rgba(239, 68, 68, 0.35)",
              }}
            >
              <FileText size={20} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "0.86rem",
                  fontWeight: 700,
                  color: "#fff",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
                title={msg.fileName || "Academic Document.pdf"}
              >
                {msg.fileName || "Academic Document.pdf"}
              </div>
              <div style={{ fontSize: "0.72rem", color: isMine ? "rgba(255,255,255,0.75)" : "var(--text-dim)", marginTop: "2px" }}>
                {formatFileSize(msg.fileSize || 1048576)} • PDF Document
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              {onPreviewNote && (
                <button
                  type="button"
                  onClick={() =>
                    onPreviewNote({
                      id: msg.id || "chat_pdf",
                      title: msg.fileName || "Academic Note Document",
                      fileUrl: msg.fileUrl,
                      fileSize: msg.fileSize,
                      originalName: msg.fileName,
                    })
                  }
                  style={{
                    padding: "6px 10px",
                    borderRadius: "8px",
                    background: isMine ? "rgba(255,255,255,0.22)" : "rgba(6, 182, 212, 0.2)",
                    color: isMine ? "#fff" : "#38bdf8",
                    border: isMine ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(6, 182, 212, 0.35)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                  }}
                  title="Open & Read in Virtual PDF Reader"
                >
                  <Eye size={13} />
                  <span>Read</span>
                </button>
              )}
              <a
                href={msg.fileUrl}
                download={msg.fileName || "Document.pdf"}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: "6px 10px",
                  borderRadius: "8px",
                  background: isMine ? "rgba(255,255,255,0.2)" : "linear-gradient(135deg, #06b6d4, #3b82f6)",
                  color: "#fff",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  flexShrink: 0,
                  transition: "transform 0.15s ease",
                }}
                title={`Download ${msg.fileName || "PDF"} (${formatFileSize(msg.fileSize || 1048576)})`}
              >
                <Download size={13} />
                <span>Save</span>
              </a>
            </div>
          </div>
          {msg.text && msg.text !== msg.fileName && (
            <span style={{ fontSize: "0.88rem", lineHeight: 1.45, wordBreak: "break-word" }}>{msg.text}</span>
          )}
        </div>
      );
    }

    if (msg.type === "image") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "100%" }}>
          <div
            style={{
              position: "relative",
              borderRadius: "14px",
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(0,0,0,0.3)",
              cursor: "pointer",
            }}
            onClick={() => setLightboxUrl(msg.fileUrl)}
          >
            <img
              src={msg.fileUrl}
              alt="Attachment"
              loading="lazy"
              style={{
                display: "block",
                maxWidth: "280px",
                width: "100%",
                maxHeight: "260px",
                objectFit: "cover",
                transition: "transform 0.2s ease",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: "6px",
                right: "6px",
                background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(4px)",
                borderRadius: "6px",
                padding: "2px 6px",
                fontSize: "0.68rem",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: "3px",
              }}
            >
              <Eye size={11} /> Tap to expand
            </div>
          </div>
          {msg.text && msg.text !== msg.fileName && (
            <span style={{ fontSize: "0.88rem", lineHeight: 1.45, wordBreak: "break-word" }}>{msg.text}</span>
          )}
        </div>
      );
    }

    // Auto-link and mention detector (@all, @admin, @username)
    const combinedRegex = /(https?:\/\/[^\s]+|@all\b|@everyone\b|@admin\b|@admins\b|@[a-zA-Z0-9_.]+)/gi;
    const parts = (msg.text || "").split(combinedRegex);
    return (
      <span style={{ fontSize: "0.88rem", lineHeight: 1.45, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
        {parts.map((part, idx) => {
          if (!part) return null;
          if (/^https?:\/\//i.test(part)) {
            return (
              <a
                key={idx}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: isMine ? "#e0f2fe" : "var(--accent-cyan)",
                  textDecoration: "underline",
                  textUnderlineOffset: "2px",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                }}
              >
                {part} <ExternalLink size={11} />
              </a>
            );
          }
          if (/^@all\b|^@everyone\b/i.test(part)) {
            return (
              <span
                key={idx}
                style={{
                  background: "rgba(245, 158, 11, 0.22)",
                  color: "#fbbf24",
                  border: "1px solid rgba(245, 158, 11, 0.45)",
                  borderRadius: "5px",
                  padding: "1px 6px",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                  margin: "0 2px",
                }}
              >
                📢 {part}
              </span>
            );
          }
          if (/^@admin\b|^@admins\b/i.test(part)) {
            return (
              <span
                key={idx}
                style={{
                  background: "rgba(239, 68, 68, 0.22)",
                  color: "#f87171",
                  border: "1px solid rgba(239, 68, 68, 0.45)",
                  borderRadius: "5px",
                  padding: "1px 6px",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                  margin: "0 2px",
                }}
              >
                🛡️ {part}
              </span>
            );
          }
          if (/^@[a-zA-Z0-9_.]+/i.test(part)) {
            return (
              <span
                key={idx}
                style={{
                  background: "rgba(56, 189, 248, 0.18)",
                  color: "#38bdf8",
                  border: "1px solid rgba(56, 189, 248, 0.4)",
                  borderRadius: "5px",
                  padding: "1px 6px",
                  fontWeight: 600,
                  fontSize: "0.82rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "2px",
                  margin: "0 2px",
                }}
              >
                {part}
              </span>
            );
          }
          return part;
        })}
      </span>
    );
  };

  if (!isOpen) return null;

  return (
    <div
      className="scm-overlay"
      onClick={onClose}
    >
      <style>{`
        /* =========================================================
           STUDENT CHAT MODAL — INSTAGRAM / WHATSAPP / SNAPCHAT VIBE
           Universal Fluid Responsiveness with ZERO Overlapping
           ========================================================= */
        .scm-overlay {
          position: fixed;
          inset: 0;
          z-index: 1200;
          background: rgba(4, 7, 15, 0.88);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          box-sizing: border-box;
          overflow: hidden;
        }

        .scm-window {
          max-width: 940px;
          width: 94vw;
          height: min(840px, 88vh);
          display: flex;
          flex-direction: column;
          background: #0b101b;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.8), 0 0 45px rgba(99, 102, 241, 0.12);
          overflow: hidden;
          position: relative;
          box-sizing: border-box;
          animation: scmScaleUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes scmScaleUp {
          from { opacity: 0; transform: scale(0.97) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        /* Ambient WhatsApp Doodle Pattern */
        .scm-chat-feed {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background-color: #080c16;
          background-image: radial-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px);
          background-size: 22px 22px;
          -webkit-overflow-scrolling: touch;
        }

        /* Message Bubble Transitions */
        .scm-bubble-row {
          display: flex;
          flex-direction: column;
          width: 100%;
          position: relative;
        }

        .scm-bubble-wrap {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          max-width: 82%;
          position: relative;
        }

        .scm-bubble-wrap.mine {
          margin-left: auto;
          flex-direction: row;
        }

        .scm-bubble-wrap.theirs {
          margin-right: auto;
          flex-direction: row-reverse;
        }

        /* Instagram Gradient for Sent Messages */
        .scm-bubble-content.mine {
          background: linear-gradient(135deg, #0284c7 0%, #3b82f6 50%, #6366f1 100%);
          border-radius: 20px 20px 4px 20px;
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(2, 132, 199, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.18);
        }

        /* Dark Glass for Received Messages */
        .scm-bubble-content.theirs {
          background: rgba(30, 41, 59, 0.85);
          backdrop-filter: blur(8px);
          border-radius: 20px 20px 20px 4px;
          color: #f8fafc;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);
        }

        /* Hover Reaction Bar */
        .scm-hover-actions {
          display: none;
          align-items: center;
          gap: 4px;
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 999px;
          padding: 3px 8px;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
          position: absolute;
          top: -26px;
          z-index: 10;
        }

        .scm-bubble-wrap.mine .scm-hover-actions {
          right: 4px;
        }

        .scm-bubble-wrap.theirs .scm-hover-actions {
          left: 4px;
        }

        .scm-bubble-wrap:hover .scm-hover-actions,
        .scm-hover-actions.active {
          display: flex;
        }

        /* Context Menu for Messages (Mobile & Desktop) */
        .scm-msg-context-menu {
          position: absolute;
          bottom: 28px;
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);
          padding: 6px;
          z-index: 120;
          display: flex;
          flex-direction: column;
          min-width: 195px;
          backdrop-filter: blur(14px);
        }

        .scm-bubble-wrap.mine .scm-msg-context-menu {
          right: 0;
        }

        .scm-bubble-wrap.theirs .scm-msg-context-menu {
          left: 0;
        }

        .scm-msg-context-menu button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border: none;
          background: transparent;
          color: #f1f5f9;
          font-size: 0.76rem;
          font-weight: 600;
          cursor: pointer;
          border-radius: 6px;
          text-align: left;
          width: 100%;
          transition: background 0.12s ease;
        }

        .scm-msg-context-menu button:hover {
          background: rgba(255, 255, 255, 0.08);
        }

        /* Bouncing Dots Typing Animation */
        @keyframes scmBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }

        .scm-dot {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--accent-cyan);
          animation: scmBounce 1.2s infinite ease-in-out;
        }
        .scm-dot:nth-child(2) { animation-delay: 0.18s; }
        .scm-dot:nth-child(3) { animation-delay: 0.36s; }

        /* Floating Instagram Heart Double-Tap Pop */
        @keyframes scmHeartPop {
          0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
          45% { transform: translate(-50%, -50%) scale(1.4); opacity: 1; }
          75% { transform: translate(-50%, -65%) scale(1.1); opacity: 0.9; }
          100% { transform: translate(-50%, -85%) scale(0.9); opacity: 0; }
        }

        .scm-floating-heart {
          position: absolute;
          top: 50%;
          left: 50%;
          font-size: 52px;
          animation: scmHeartPop 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          pointer-events: none;
          z-index: 50;
          filter: drop-shadow(0 6px 16px rgba(239, 68, 68, 0.65));
        }

        /* Quoted message jump pulse */
        @keyframes scmPulseGlow {
          0% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.7); }
          50% { box-shadow: 0 0 0 10px rgba(56, 189, 248, 0); }
          100% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0); }
        }

        .scm-pulse-highlight {
          animation: scmPulseGlow 1.4s ease-out;
        }

        /* Pulsing Recording Mic Indicator */
        @keyframes scmRecordPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.25); opacity: 0.6; }
        }

        .scm-record-pulse {
          animation: scmRecordPulse 1s infinite ease-in-out;
        }

        /* Mobile Native App Viewport (<=640px) */
        @media (max-width: 640px) {
          .scm-overlay {
            padding: 0 !important;
          }
          .scm-window {
            width: 100vw !important;
            height: 100dvh !important;
            max-width: 100vw !important;
            max-height: 100dvh !important;
            border-radius: 0 !important;
            border: none !important;
          }
          .scm-header-wrap {
            padding: 10px 12px !important;
          }
          .scm-chat-feed {
            padding: 12px 10px !important;
          }
          .scm-bubble-wrap {
            max-width: 90% !important;
          }
          .scm-pill-input {
            font-size: 16px !important; /* Prevents auto zoom in iOS */
          }
          .scm-action-btn-text {
            display: none !important;
          }
          .scm-tabs-bar {
            padding: 6px 10px !important;
          }
        }
      `}</style>

      <div
        className="scm-window"
        style={{
          transform: keyboardOffset > 0 ? `translateY(-${keyboardOffset}px)` : undefined,
          transition: "transform 0.15s ease",
        }}
        onClick={(e) => {
          e.stopPropagation();
          setShowEmojiPicker(false);
          setActiveMessageActionId(null);
          setMessageContextMenuId(null);
        }}
      >
        {/* =========================================================
            HEADER APP BAR (INSTAGRAM / WHATSAPP HYBRID)
            ========================================================= */}
        <div
          className="scm-header-wrap"
          style={{
            padding: "12px 18px",
            background: "rgba(13, 19, 33, 0.95)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            zIndex: 10,
          }}
        >
          {/* Left: Back / Close & Room Identity */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
            {/* Back Button */}
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "none",
                borderRadius: "50%",
                width: "36px",
                height: "36px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#cbd5e1",
                cursor: "pointer",
                flexShrink: 0,
                transition: "background 0.2s ease",
              }}
              title="Close Chat"
            >
              <ArrowLeft size={18} />
            </button>

            {/* Room Avatar with Instagram Story Gradient Ring */}
            <div
              style={{
                position: "relative",
                width: "42px",
                height: "42px",
                borderRadius: "50%",
                padding: "2px",
                background: currentRoom.isPrivate
                  ? "linear-gradient(135deg, #ef4444 0%, #f97316 100%)"
                  : "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  background: "#080c16",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: "1.05rem",
                }}
              >
                {currentRoom.isPrivate ? <Lock size={18} color="#fca5a5" /> : "🏛️"}
              </div>

              {/* Pulsing Active Online Dot */}
              <span
                style={{
                  position: "absolute",
                  bottom: "1px",
                  right: "1px",
                  width: "11px",
                  height: "11px",
                  borderRadius: "50%",
                  background: "#10b981",
                  border: "2px solid #080c16",
                  boxShadow: "0 0 6px #10b981",
                }}
              />
            </div>

            {/* Room Title & Online Subtitle */}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "0.98rem",
                    fontWeight: 800,
                    color: "#fff",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={currentRoom.name}
                >
                  {currentRoom.name}
                </h3>
                {currentRoom.isPrivate && (
                  <span
                    style={{
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: "6px",
                      background: "rgba(99, 102, 241, 0.2)",
                      border: "1px solid rgba(99, 102, 241, 0.4)",
                      color: "#a5b4fc",
                      flexShrink: 0,
                      letterSpacing: "0.03em",
                    }}
                  >
                    PRIVATE
                  </span>
                )}
                {currentRoom.isPrivate && (currentRoom.createdBy === currentUser?.id || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => openRenameModal(currentRoom)}
                    style={{
                      background: "rgba(56, 189, 248, 0.14)",
                      border: "1px solid rgba(56, 189, 248, 0.35)",
                      borderRadius: "6px",
                      padding: "2px 6px",
                      color: "#38bdf8",
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                      cursor: "pointer",
                      flexShrink: 0,
                      transition: "all 0.15s ease",
                    }}
                    title="Rename this private chat room"
                  >
                    <Edit2 size={11} />
                    <span>Rename</span>
                  </button>
                )}
                {currentRoom.isPrivate && isAdmin && (
                  <span
                    style={{
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: "6px",
                      background: "rgba(249, 115, 22, 0.2)",
                      border: "1px solid rgba(249, 115, 22, 0.45)",
                      color: "#fb923c",
                      flexShrink: 0,
                    }}
                    title="Administrator active"
                  >
                    👑 ADMIN
                  </span>
                )}
              </div>

              <div
                style={{
                  fontSize: "0.74rem",
                  color: "var(--accent-emerald)",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  marginTop: "1px",
                }}
              >
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                <span style={{ color: "var(--text-dim)" }}>
                  Active now • <strong style={{ color: "#34d399" }}>{onlineCount}</strong> {currentRoom.isPrivate ? "student(s)" : "online"}
                  {currentRoom.isPrivate && isAdmin && (
                    <span style={{ color: "#fb923c", marginLeft: "6px", fontWeight: 700 }}>
                      (Admin Active)
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Right Header Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
            {/* If in Private Chat: Quick Copy Invite Code Chip */}
            {currentRoom.isPrivate && currentRoom.secretCode && (
              <button
                onClick={handleCopySecretKey}
                style={{
                  background: "rgba(6, 182, 212, 0.12)",
                  border: "1px solid rgba(6, 182, 212, 0.35)",
                  borderRadius: "999px",
                  padding: "4px 10px",
                  color: "var(--accent-cyan)",
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  cursor: "pointer",
                }}
                title="Tap to copy Invite Code"
              >
                {copiedCode ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                <span>{currentRoom.secretCode}</span>
              </button>
            )}

            {/* 🚀 If in Private Chat: Dedicated Share Button */}
            {currentRoom.isPrivate && currentRoom.secretCode && (
              <button
                onClick={() => handleSharePrivateRoom(currentRoom)}
                style={{
                  background: "linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(59, 130, 246, 0.2))",
                  border: "1px solid rgba(56, 189, 248, 0.45)",
                  borderRadius: "999px",
                  padding: "4px 11px",
                  color: "#38bdf8",
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  cursor: "pointer",
                  transition: "all 0.18s ease",
                }}
                title="Share this Private Chat with peers"
              >
                <Share2 size={12} />
                <span>Share</span>
              </button>
            )}

            {/* Host or Admin: Rename Chat Button */}
            {currentRoom.isPrivate && (currentRoom.createdBy === currentUser?.id || isAdmin) && (
              <button
                onClick={() => openRenameModal(currentRoom)}
                style={{
                  background: "rgba(56, 189, 248, 0.15)",
                  border: "1px solid rgba(56, 189, 248, 0.4)",
                  borderRadius: "999px",
                  padding: "4px 10px",
                  color: "#38bdf8",
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                title="Rename this private study room"
              >
                <Edit2 size={12} color="#38bdf8" />
                <span>Rename</span>
              </button>
            )}

            {/* Host or Admin: Permanently Delete Chat Button */}
            {currentRoom.isPrivate && (currentRoom.createdBy === currentUser?.id || isAdmin) && (
              <button
                onClick={handleDeletePrivateRoom}
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  borderRadius: "999px",
                  padding: "4px 10px",
                  color: "#fca5a5",
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                title="Permanently delete this private chat for all participants"
              >
                <Trash2 size={12} color="#fca5a5" />
                <span>Delete Chat</span>
              </button>
            )}

            {/* Non-creator Joined Participant: Leave Chat Button (Chat stays active for host) */}
            {currentRoom.isPrivate && currentRoom.createdBy !== currentUser?.id && !isAdmin && (
              <button
                onClick={handleLeavePrivateRoom}
                style={{
                  background: "rgba(245, 158, 11, 0.15)",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  borderRadius: "999px",
                  padding: "4px 10px",
                  color: "#fcd34d",
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                title="Leave this private chat (remains active for host and others)"
              >
                <LogOut size={12} color="#fcd34d" />
                <span>Leave Chat</span>
              </button>
            )}

            {/* Admin Purge Button */}
            {isAdmin && (
              <button
                onClick={handlePurgeRoom}
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "8px",
                  padding: "6px 9px",
                  color: "#fca5a5",
                  fontSize: "0.74rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                title="Admin Action: Purge Messages"
              >
                <Trash2 size={13} />
                <span className="scm-action-btn-text">Purge</span>
              </button>
            )}

            {/* Admin Blocked Users Manager Button */}
            {isAdmin && (
              <button
                onClick={() => {
                  fetchBlockedStudents();
                  setShowBlockedModal(true);
                }}
                style={{
                  background: blockedUserIds.size > 0 ? "rgba(239, 68, 68, 0.18)" : "rgba(245, 158, 11, 0.12)",
                  border: blockedUserIds.size > 0 ? "1px solid rgba(239, 68, 68, 0.45)" : "1px solid rgba(245, 158, 11, 0.35)",
                  borderRadius: "8px",
                  padding: "6px 9px",
                  color: blockedUserIds.size > 0 ? "#fca5a5" : "#fcd34d",
                  fontSize: "0.74rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontWeight: 600,
                }}
                title="View & manage blocked students across all rooms"
              >
                {blockedUserIds.size > 0 ? <ShieldOff size={13} color="#ef4444" /> : <Shield size={13} color="#f59e0b" />}
                <span className="scm-action-btn-text">
                  {blockedUserIds.size > 0 ? `${blockedUserIds.size} Blocked` : "Blocked"}
                </span>
              </button>
            )}

            {/* Student Chat DP & Handle Button */}
            <button
              onClick={() => {
                setEditingUsername(chatProfile?.chatUsername || "");
                setAvatarPreview(chatProfile?.avatarUrl || "");
                setAvatarFile(null);
                setProfileMsg(null);
                setShowChatProfileModal(true);
              }}
              style={{
                background: "rgba(56, 189, 248, 0.12)",
                border: "1px solid rgba(56, 189, 248, 0.35)",
                borderRadius: "999px",
                padding: "3px 10px 3px 4px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              title="Edit Chat Handle & Profile"
            >
              <div
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "50%",
                  overflow: "hidden",
                  background: "#0284c7",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {chatProfile?.avatarUrl ? (
                  <img src={chatProfile.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  (chatProfile?.chatUsername || currentUser?.name || "U").charAt(0).toUpperCase()
                )}
              </div>
              <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "#38bdf8" }}>
                {chatProfile?.chatUsername ? `@${chatProfile.chatUsername}` : "My Profile"}
              </span>
            </button>

            {/* Sound Chimes Mute / Unmute Toggle */}
            <button
              onClick={toggleSound}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "none",
                borderRadius: "50%",
                width: "36px",
                height: "36px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: soundEnabled ? "var(--accent-cyan)" : "var(--text-dim)",
                cursor: "pointer",
                transition: "background 0.2s ease, color 0.2s ease",
              }}
              title={soundEnabled ? "Mute Chat Sounds" : "Unmute Chat Sounds"}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "none",
                borderRadius: "50%",
                width: "36px",
                height: "36px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-dim)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              title="Close (ESC)"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* =========================================================
            CHANNELS & STORY TABS BAR (INSTAGRAM PILLS)
            Guarantees ZERO wrap collision on narrow screens
            ========================================================= */}
        <div
          className="scm-tabs-bar"
          style={{
            padding: "8px 16px",
            background: "rgba(10, 15, 27, 0.98)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            overflowX: "auto",
            scrollbarWidth: "none",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {/* Public Chat Tab */}
          <button
            onClick={() => handleSwitchRoom({ id: "public", name: "💬 Public Community Chat", isPrivate: false })}
            style={{
              padding: "6px 14px",
              borderRadius: "999px",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              border: activeTab === "public" ? "1px solid var(--accent-indigo)" : "1px solid rgba(255,255,255,0.08)",
              background: activeTab === "public" ? "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(6,182,212,0.3))" : "rgba(255,255,255,0.04)",
              color: activeTab === "public" ? "#fff" : "var(--text-muted)",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.18s ease",
            }}
          >
            <span>💬 Public Chat</span>
          </button>

          {/* Private Chat Hub Tab */}
          <button
            onClick={() => setActiveTab("create_join")}
            style={{
              padding: "6px 14px",
              borderRadius: "999px",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              border: activeTab === "create_join" ? "1px solid var(--accent-cyan)" : "1px solid rgba(255,255,255,0.08)",
              background: activeTab === "create_join" ? "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(6,182,212,0.25))" : "rgba(255,255,255,0.04)",
              color: activeTab === "create_join" ? "#fff" : "var(--text-muted)",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.18s ease",
            }}
          >
            <Lock size={13} color={activeTab === "create_join" ? "var(--accent-cyan)" : "#94a3b8"} />
            <span>🔒 Private Chat</span>
          </button>

          {/* Active Private Rooms Quick Switcher Pills */}
          {(Array.isArray(rooms) ? rooms : [])
            .filter((r) => r && r.isPrivate)
            .map((r) => {
              const isActive = currentRoom.id === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    if (r.isPrivate && !r.secretCode && !isAdmin) {
                      const code = window.prompt(`Enter Invite Code for "${r.name}":`);
                      if (!code || !code.trim()) return;
                      handleSwitchRoom({ ...r, secretCode: code.trim().toUpperCase() });
                    } else {
                      handleSwitchRoom(r);
                    }
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "999px",
                    fontSize: "0.76rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    border: isActive ? "1px solid var(--accent-cyan)" : "1px solid rgba(255,255,255,0.08)",
                    background: isActive ? "rgba(6, 182, 212, 0.2)" : "rgba(255,255,255,0.03)",
                    color: isActive ? "#38bdf8" : "var(--text-dim)",
                    whiteSpace: "nowrap",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    transition: "all 0.18s ease",
                  }}
                  title={isAdmin ? `Admin Super Access (Code: ${r.secretCode || "Bypassed"})` : "Tap to open chat"}
                >
                  <Lock size={11} />
                  <span>{r.name}</span>
                </button>
              );
            })}
        </div>

        {/* =========================================================
            PINNED NOTICE BANNER (WHATSAPP BROADCAST STYLE)
            ========================================================= */}
        {chatNotice && chatNotice.text && (
          <div
            style={{
              padding: "7px 16px",
              background: "linear-gradient(90deg, rgba(6, 182, 212, 0.12) 0%, rgba(99, 102, 241, 0.12) 100%)",
              borderBottom: "1px solid rgba(6, 182, 212, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              fontSize: "0.78rem",
              color: "#e0f2fe",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
              <Megaphone size={14} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
              {isEditingNotice ? (
                <input
                  type="text"
                  value={noticeDraft}
                  onChange={(e) => setNoticeDraft(e.target.value)}
                  style={{
                    flex: 1,
                    background: "#080c16",
                    color: "#fff",
                    border: "1px solid rgba(6, 182, 212, 0.4)",
                    borderRadius: "6px",
                    padding: "3px 8px",
                    fontSize: "0.78rem",
                  }}
                />
              ) : (
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <strong style={{ color: "var(--accent-cyan)" }}>Notice:</strong> {chatNotice.text}
                </span>
              )}
            </div>

            {isAdmin && (
              <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                {isEditingNotice ? (
                  <>
                    <button
                      onClick={handleSaveNotice}
                      style={{ background: "#06b6d4", color: "#000", border: "none", borderRadius: "4px", padding: "2px 8px", fontSize: "0.7rem", fontWeight: 700, cursor: "pointer" }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setIsEditingNotice(false)}
                      style={{ background: "transparent", color: "#cbd5e1", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "4px", padding: "2px 8px", fontSize: "0.7rem", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditingNotice(true)}
                    style={{ background: "rgba(255,255,255,0.08)", color: "var(--accent-cyan)", border: "none", borderRadius: "4px", padding: "2px 8px", fontSize: "0.7rem", cursor: "pointer" }}
                    title="Edit Notice"
                  >
                    Edit
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            MAIN BODY (GUEST STATE / POD VIEW / CHAT FEED)
            ========================================================= */}
        {!currentUser ? (
          /* GUEST / UNAUTHENTICATED STATE */
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "30px 20px",
              textAlign: "center",
              gap: "16px",
            }}
          >
            <div
              style={{
                width: "68px",
                height: "68px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(6, 182, 212, 0.2))",
                border: "1px solid rgba(99, 102, 241, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-cyan)",
              }}
            >
              <Users size={32} />
            </div>
            <div style={{ maxWidth: "420px" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: "1.2rem", fontWeight: 800, color: "#fff" }}>
                Student Identity Required
              </h3>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
                Sign in with your student account to discuss engineering notes, share academic blueprints, and collaborate in Private Chats with your peers.
              </p>
            </div>
            <button
              onClick={() => onOpenAuth?.("signin")}
              className="btn-primary"
              style={{ padding: "10px 24px", fontSize: "0.9rem", fontWeight: 700 }}
            >
              Sign In to Enter Chat
            </button>
          </div>
        ) : activeTab === "create_join" ? (
          /* CREATE OR JOIN PRIVATE STUDY CHAT VIEW */
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <div style={{ textAlign: "center", maxWidth: "520px", margin: "0 auto" }}>
              <div
                style={{
                  width: "58px",
                  height: "58px",
                  borderRadius: "18px",
                  background: "linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(6, 182, 212, 0.25))",
                  border: "1px solid rgba(6, 182, 212, 0.45)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 12px",
                  color: "#38bdf8",
                  boxShadow: "0 10px 25px rgba(6, 182, 212, 0.25)",
                }}
              >
                <Users size={28} />
              </div>
              <h2 style={{ fontSize: "1.3rem", fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>
                Private Study Chats
              </h2>
              <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", margin: 0, lineHeight: 1.5 }}>
                Private chat rooms for focused study sessions. When all members leave or the chat is closed, all messages and shared files are permanently deleted.
              </p>
            </div>

            {joinError && (
              <div style={{ padding: "10px 14px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.35)", borderRadius: "10px", color: "#fca5a5", fontSize: "0.82rem", textAlign: "center" }}>
                {joinError}
              </div>
            )}

            {createSuccess && (
              <div style={{ padding: "10px 14px", background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.35)", borderRadius: "10px", color: "#6ee7b7", fontSize: "0.82rem", textAlign: "center" }}>
                {createSuccess}
              </div>
            )}

            {/* Responsive 1 or 2 Columns Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
              {/* Card 1: Create Private Chat */}
              <div style={{ background: "linear-gradient(145deg, rgba(15, 23, 42, 0.75), rgba(30, 41, 59, 0.55))", border: "1px solid rgba(99, 102, 241, 0.25)", borderRadius: "16px", padding: "20px", backdropFilter: "blur(12px)", boxShadow: "0 12px 30px rgba(0, 0, 0, 0.3)" }}>
                <h4 style={{ margin: "0 0 14px", fontSize: "0.95rem", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Plus size={16} color="var(--accent-cyan)" /> Create Private Chat
                </h4>

                <form onSubmit={handleCreateRoom} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "var(--text-dim)", display: "block", marginBottom: "4px" }}>
                      Chat Name
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. DBMS Exam Revision"
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                      required
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.75rem", color: "var(--text-dim)", display: "block", marginBottom: "4px" }}>
                      Invite Passcode (Optional)
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Auto-generated if left blank"
                      value={newRoomSecret}
                      onChange={(e) => setNewRoomSecret(e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </div>

                  <button type="submit" disabled={creatingRoom} className="btn-primary" style={{ marginTop: "6px", width: "100%" }}>
                    {creatingRoom ? "Creating..." : "✨ Create Private Chat"}
                  </button>
                </form>
              </div>

              {/* Card 2: Join Private Chat */}
              <div style={{ background: "linear-gradient(145deg, rgba(15, 23, 42, 0.75), rgba(30, 41, 59, 0.55))", border: "1px solid rgba(6, 182, 212, 0.25)", borderRadius: "16px", padding: "20px", backdropFilter: "blur(12px)", boxShadow: "0 12px 30px rgba(0, 0, 0, 0.3)" }}>
                <h4 style={{ margin: "0 0 14px", fontSize: "0.95rem", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Key size={16} color="var(--accent-cyan)" /> Join with Invite Code
                </h4>

                <form onSubmit={handleJoinByCode} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "var(--text-dim)", display: "block", marginBottom: "4px" }}>
                      Chat Invite Code
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. CHAT-4912"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      required
                      style={{ width: "100%" }}
                    />
                  </div>

                  <button type="submit" className="btn-secondary" style={{ marginTop: "24px", width: "100%" }}>
                    🚀 Join Private Chat
                  </button>
                </form>
              </div>
            </div>

            {/* Accessible Private Chats List */}
            {Array.isArray(rooms) && rooms.length > 1 && (
              <div>
                <h4 style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", margin: "14px 0 10px" }}>
                  Active Private Chats
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
                  {(Array.isArray(rooms) ? rooms : [])
                    .filter((r) => r && r.isPrivate)
                    .map((r) => (
                      <div
                        key={r.id}
                        onClick={() => {
                          if (r.isPrivate && !r.secretCode && !isAdmin) {
                            const code = window.prompt(`Enter Invite Code for "${r.name}":`);
                            if (!code || !code.trim()) return;
                            handleSwitchRoom({ ...r, secretCode: code.trim().toUpperCase() });
                          } else {
                            handleSwitchRoom(r);
                          }
                        }}
                        style={{
                          background: "rgba(255, 255, 255, 0.025)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          borderRadius: "12px",
                          padding: "12px 14px",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          transition: "all 0.18s ease",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1, paddingRight: "8px" }}>
                          <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#fff", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                            {r.name}
                          </div>
                          {r.secretCode ? (
                            <div style={{ fontSize: "0.72rem", color: "var(--accent-cyan)", marginTop: "2px" }}>
                              Code: {r.secretCode}
                            </div>
                          ) : isAdmin ? (
                            <div style={{ fontSize: "0.72rem", color: "#fb923c", marginTop: "2px" }}>
                              👑 Administrator Access
                            </div>
                          ) : (
                            <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "2px" }}>
                              🔒 Passcode Required
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                          <span style={{ fontSize: "0.72rem", color: "#34d399", fontWeight: 700 }}>
                            {r.membersCount} Online
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSharePrivateRoom(r);
                            }}
                            style={{
                              background: "rgba(6, 182, 212, 0.15)",
                              border: "1px solid rgba(6, 182, 212, 0.35)",
                              borderRadius: "8px",
                              padding: "4px 8px",
                              color: "#38bdf8",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                            title="Share this Private Chat"
                          >
                            <Share2 size={12} />
                            <span>Share</span>
                          </button>
                          {(r.createdBy === currentUser?.id || isAdmin) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openRenameModal(r);
                              }}
                              style={{
                                background: "rgba(56, 189, 248, 0.15)",
                                border: "1px solid rgba(56, 189, 248, 0.35)",
                                borderRadius: "8px",
                                padding: "4px 8px",
                                color: "#38bdf8",
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                              title="Rename this Private Chat"
                            >
                              <Edit2 size={11} />
                              <span>Rename</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* REGULAR CHAT FEED & INPUT VIEW */
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* MESSAGES LIST */}
            <div className="scm-chat-feed">
              {(!Array.isArray(messages) || messages.length === 0) ? (
                <div style={{ textAlign: "center", margin: "auto", color: "var(--text-dim)", maxWidth: "320px", padding: "20px" }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: "10px" }}>💬</div>
                  <div style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", marginBottom: "6px" }}>
                    Welcome to {currentRoom?.name || "Community Chat"}!
                  </div>
                  <div style={{ fontSize: "0.8rem", lineHeight: 1.5 }}>
                    Be the first to say hi, ask a question regarding exam topics, or share an academic note with classmates.
                  </div>
                </div>
              ) : (
                (Array.isArray(messages) ? messages : []).filter(Boolean).map((msg, index) => {
                  const isMine = msg?.sender?.id === currentUser?.id;
                  const senderRole = msg?.sender?.role || "student";
                  const isOfficialAdminMsg = Boolean(
                    msg?.sender?.id?.startsWith("sys_admin_") ||
                    msg?.sender?.isOfficialAdmin ||
                    msg?.sender?.isAdmin ||
                    senderRole === "admin" ||
                    senderRole === "half_admin" ||
                    (msg?.sender?.name && /admin|adm\s*\(|telegram/i.test(msg?.sender?.name)) ||
                    (msg?.telegramMsgId && (msg?.sender?.id?.startsWith("sys_admin_") || senderRole === "admin"))
                  );
                  const senderIsAdmin = isOfficialAdminMsg || msg?.sender?.isAdmin || senderRole === "admin" || senderRole === "half_admin";
                  const senderColor = isMine ? "#ffffff" : isOfficialAdminMsg ? "#f59e0b" : getUsernameColor(msg?.sender?.id, msg?.sender?.name);

                  // Date separator detection
                  const prevMsg = index > 0 ? messages[index - 1] : null;
                  const currentDate = msg?.createdAt ? new Date(msg.createdAt).toDateString() : "";
                  const prevDate = prevMsg?.createdAt ? new Date(prevMsg.createdAt).toDateString() : "";
                  const showDateSeparator = currentDate && currentDate !== prevDate;

                  return (
                    <React.Fragment key={msg.id}>
                      {/* Centered Date Separator Pill */}
                      {showDateSeparator && (
                        <div style={{ textAlign: "center", margin: "8px 0" }}>
                          <span
                            style={{
                              background: "rgba(255, 255, 255, 0.07)",
                              backdropFilter: "blur(6px)",
                              border: "1px solid rgba(255, 255, 255, 0.08)",
                              padding: "3px 12px",
                              borderRadius: "999px",
                              fontSize: "0.68rem",
                              fontWeight: 600,
                              color: "#94a3b8",
                              letterSpacing: "0.3px",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                            }}
                          >
                            {formatDateSeparator(msg.createdAt)}
                          </span>
                        </div>
                      )}

                      {/* Single Message Row */}
                      <div className="scm-bubble-row" id={`scm-msg-${msg.id}`}>
                        <div
                          className={`scm-bubble-wrap ${isMine ? "mine" : "theirs"}`}
                          onDoubleClick={() => handleBubbleDoubleTap(msg)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMessageActionId((prev) => (prev === msg.id ? null : msg.id));
                          }}
                        >
                          {/* Floating Instagram Double-Tap Pop Heart */}
                          {floatingHeartMsgId === msg.id && (
                            <div className="scm-floating-heart">❤️</div>
                          )}

                          {/* Student Avatar for Received Messages (Tap to View Profile) */}
                          {!isMine && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                if (msg.sender) {
                                  setViewingProfile(isOfficialAdminMsg ? { ...msg.sender, name: "👑 OFFICIAL ADMIN", isAdmin: true, isOfficialAdmin: true, role: "admin", username: "" } : msg.sender);
                                }
                              }}
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                background: isOfficialAdminMsg ? "linear-gradient(135deg, #f59e0b, #ea580c)" : senderColor,
                                color: "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "0.78rem",
                                fontWeight: 800,
                                flexShrink: 0,
                                cursor: "pointer",
                                boxShadow: isOfficialAdminMsg ? "0 2px 10px rgba(245, 158, 11, 0.45)" : "0 2px 8px rgba(0,0,0,0.3)",
                                transition: "transform 0.15s ease",
                                overflow: "hidden",
                              }}
                              title={isOfficialAdminMsg ? "Official Administrator Desk" : `View ${msg.sender?.name || "Student"}'s Profile`}
                            >
                              {isOfficialAdminMsg ? (
                                <Crown size={15} color="#fff" />
                              ) : msg.sender?.photoUrl ? (
                                <img
                                  src={msg.sender.photoUrl}
                                  alt=""
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              ) : (
                                (msg.sender?.name || "S").charAt(0).toUpperCase()
                              )}
                            </div>
                          )}

                          {/* Floating Instagram/WhatsApp Reaction & Action Bar */}
                          {!msg.isDeleted && (
                            <div className={`scm-hover-actions ${activeMessageActionId === msg.id ? "active" : ""}`}>
                              {/* Quick Reaction Emojis */}
                              {["❤️", "👍", "😂", "🔥", "📚", "🙏"].map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleQuickReaction(emoji, msg);
                                  }}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    fontSize: "0.85rem",
                                    cursor: "pointer",
                                    padding: "2px 4px",
                                    transition: "transform 0.15s ease",
                                  }}
                                  title={`React ${emoji}`}
                                >
                                  {emoji}
                                </button>
                              ))}

                              {/* Separator */}
                              <div style={{ width: "1px", height: "14px", background: "rgba(255,255,255,0.2)", margin: "0 2px" }} />

                              {/* Swipe / Click to Reply Action */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartReply(msg);
                                }}
                                style={{
                                  background: "rgba(56, 189, 248, 0.12)",
                                  border: "1px solid rgba(56, 189, 248, 0.3)",
                                  borderRadius: "6px",
                                  color: "var(--accent-cyan)",
                                  cursor: "pointer",
                                  padding: "2px 6px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  fontSize: "0.68rem",
                                  fontWeight: 600,
                                }}
                                title="Reply to message"
                              >
                                <CornerUpLeft size={11} />
                                <span>Reply</span>
                              </button>

                              {/* Prominent Edit Action (if mine or admin) */}
                              {(isMine || isAdmin) && !editingMessageId && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingMessageId(msg.id);
                                    setEditText(msg.text);
                                  }}
                                  style={{
                                    background: "rgba(52, 211, 153, 0.18)",
                                    border: "1px solid rgba(52, 211, 153, 0.4)",
                                    borderRadius: "6px",
                                    color: "#34d399",
                                    cursor: "pointer",
                                    padding: "2px 7px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "3px",
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                  }}
                                  title={isAdmin && !isMine ? "Admin Edit Message" : "Edit Message"}
                                >
                                  <Edit2 size={11} />
                                  <span>Edit</span>
                                </button>
                              )}

                              {/* Prominent Delete Action (if mine or admin) */}
                              {(isMine || isAdmin) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteMessage(msg.id);
                                  }}
                                  style={{
                                    background: "rgba(239, 68, 68, 0.18)",
                                    border: "1px solid rgba(239, 68, 68, 0.4)",
                                    borderRadius: "6px",
                                    color: "#f87171",
                                    cursor: "pointer",
                                    padding: "2px 7px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "3px",
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                  }}
                                  title="Delete this message"
                                >
                                  <Trash2 size={11} />
                                  <span>Delete</span>
                                </button>
                              )}

                              {/* More Context Options Toggle */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMessageContextMenuId((prev) => (prev === msg.id ? null : msg.id));
                                }}
                                style={{
                                  background: "rgba(255, 255, 255, 0.08)",
                                  border: "1px solid rgba(255, 255, 255, 0.15)",
                                  borderRadius: "6px",
                                  color: "#cbd5e1",
                                  cursor: "pointer",
                                  padding: "2px 5px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                                title="More options & moderation"
                              >
                                <MoreVertical size={12} />
                              </button>
                            </div>
                          )}

                          {/* Bubble Container */}
                          <div style={{ display: "flex", flexDirection: "column", maxWidth: "100%" }}>
                            <div
                              className={`scm-bubble-content ${isMine ? "mine" : "theirs"}`}
                              style={{
                                padding: "9px 13px 7px 13px",
                                maxWidth: "100%",
                                wordBreak: "break-word",
                              }}
                            >
                              {/* Header for Received Messages (Sender Name + Badges) */}
                              {!isMine && (
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    marginBottom: "4px",
                                    fontSize: "0.74rem",
                                    cursor: "pointer",
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (msg.sender) {
                                      setViewingProfile(isOfficialAdminMsg ? { ...msg.sender, name: "👑 OFFICIAL ADMIN", isAdmin: true, isOfficialAdmin: true, role: "admin", username: "" } : msg.sender);
                                    }
                                  }}
                                >
                                  {isOfficialAdminMsg ? (
                                    <span
                                      style={{
                                        background: "linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(234, 88, 12, 0.25))",
                                        border: "1px solid rgba(245, 158, 11, 0.5)",
                                        color: "#f59e0b",
                                        padding: "2px 8px",
                                        borderRadius: "5px",
                                        fontSize: "0.72rem",
                                        fontWeight: 800,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                      }}
                                    >
                                      <Crown size={11} /> 👑 OFFICIAL ADMIN
                                    </span>
                                  ) : (
                                    <>
                                      <span style={{ fontWeight: 800, color: senderColor }}>
                                        {msg.sender?.name || "Student Scholar"}
                                      </span>

                                      <span style={{ color: "var(--text-dim)", fontSize: "0.68rem" }}>
                                        • {msg.sender?.branch || "Engg"} {msg.sender?.year || ""}
                                      </span>
                                    </>
                                  )}

                                  {!senderIsAdmin && isUserBlocked(msg.sender?.id || msg.senderId) && (
                                    <span
                                      style={{
                                        background: "rgba(239, 68, 68, 0.2)",
                                        border: "1px solid rgba(239, 68, 68, 0.5)",
                                        color: "#f87171",
                                        padding: "1px 6px",
                                        borderRadius: "4px",
                                        fontSize: "0.6rem",
                                        fontWeight: 800,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "3px",
                                      }}
                                      title="This student is currently restricted/blocked from chat"
                                    >
                                      <ShieldOff size={8} /> RESTRICTED
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Quoted Reply Box (WhatsApp / Instagram Style) */}
                              {msg.replyTo && (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    scrollToMessage(msg.replyTo.id);
                                  }}
                                  style={{
                                    marginBottom: "6px",
                                    padding: "6px 10px",
                                    borderRadius: "8px",
                                    background: isMine ? "rgba(0,0,0,0.22)" : "rgba(15,23,42,0.65)",
                                    borderLeft: "3px solid #38bdf8",
                                    cursor: "pointer",
                                    fontSize: "0.74rem",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "2px",
                                  }}
                                  title="Tap to jump to quoted message"
                                >
                                  <span style={{ fontWeight: 800, color: "#38bdf8" }}>
                                    {(msg.replyTo.senderName || "Scholar").replace(/\(?🛡️\s*Telegram\s*Admin\)?/gi, "🛡️ Admin").replace(/Telegram Admin/gi, "Admin")}
                                  </span>
                                  <span style={{ opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {msg.replyTo.type === "audio"
                                      ? "🎙️ Voice Note"
                                      : msg.replyTo.type === "note"
                                      ? "📚 Academic Note"
                                      : msg.replyTo.type === "pdf"
                                      ? `📎 ${msg.replyTo.fileName || "PDF Document"}`
                                      : msg.replyTo.type === "image"
                                      ? "📷 Photo"
                                      : msg.replyTo.text || "Message"}
                                  </span>
                                </div>
                              )}

                              {/* Editing Form Inline */}
                              {editingMessageId === msg.id ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "200px" }}>
                                  <input
                                    type="text"
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    style={{
                                      background: "#080c16",
                                      color: "#fff",
                                      border: "1px solid rgba(255,255,255,0.25)",
                                      borderRadius: "6px",
                                      padding: "6px 8px",
                                      fontSize: "0.82rem",
                                    }}
                                    autoFocus
                                  />
                                  <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                                    <button
                                      onClick={() => handleSaveEdit(msg.id)}
                                      style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: "4px", padding: "3px 8px", fontSize: "0.72rem", cursor: "pointer", fontWeight: 700 }}
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingMessageId(null)}
                                      style={{ background: "transparent", color: "#cbd5e1", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "4px", padding: "3px 8px", fontSize: "0.72rem", cursor: "pointer" }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                renderMessageContent(msg, isMine)
                              )}

                              {/* Timestamp & WhatsApp Double Checkmarks */}
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "flex-end",
                                  gap: "4px",
                                  marginTop: "3px",
                                  fontSize: "0.66rem",
                                  color: isMine ? "rgba(255, 255, 255, 0.75)" : "var(--text-dim)",
                                }}
                              >
                                {msg.isEdited && <span style={{ fontStyle: "italic" }}>(edited)</span>}
                                <span>{formatMessageTime(msg.createdAt)}</span>
                                {isMine && !msg.isDeleted && (
                                  <span
                                    style={{
                                      color: msg.status === "read" ? "#38bdf8" : "rgba(255, 255, 255, 0.7)",
                                      fontWeight: 800,
                                      fontSize: "0.72rem",
                                      letterSpacing: "-1px",
                                    }}
                                    title={
                                      msg.status === "read"
                                        ? "Read by classmates (Blue ticks)"
                                        : msg.status === "delivered"
                                        ? "Delivered to room"
                                        : "Sent"
                                    }
                                  >
                                    {msg.status === "sent" ? "✓" : "✓✓"}
                                  </span>
                                )}

                                {/* 3-Dots Action Menu Trigger on Bubble */}
                                {!msg.isDeleted && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMessageContextMenuId((prev) => (prev === msg.id ? null : msg.id));
                                    }}
                                    style={{
                                      background: "transparent",
                                      border: "none",
                                      color: isMine ? "rgba(255, 255, 255, 0.7)" : "var(--text-dim)",
                                      cursor: "pointer",
                                      padding: "0 1px",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      marginLeft: "3px",
                                    }}
                                    title="Message options"
                                  >
                                    <MoreVertical size={11} />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Context Popup Menu */}
                            {messageContextMenuId === msg.id && (
                              <div className="scm-msg-context-menu" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => {
                                    handleStartReply(msg);
                                    setMessageContextMenuId(null);
                                  }}
                                >
                                  <CornerUpLeft size={13} color="#38bdf8" />
                                  <span>Reply</span>
                                </button>

                                {(isMine || isAdmin) && !msg.isDeleted && (
                                  <button
                                    onClick={() => {
                                      setEditingMessageId(msg.id);
                                      setEditText(msg.text);
                                      setMessageContextMenuId(null);
                                    }}
                                  >
                                    <Edit2 size={13} color="#34d399" />
                                    <span>Edit Message</span>
                                  </button>
                                )}

                                {(isMine || isAdmin) && !msg.isDeleted && (
                                  <button
                                    onClick={() => {
                                      handleDeleteMessage(msg.id);
                                      setMessageContextMenuId(null);
                                    }}
                                    style={{ color: "#f87171" }}
                                  >
                                    <Trash2 size={13} color="#f87171" />
                                    <span>Delete Message</span>
                                  </button>
                                )}

                                {isAdmin && msg.sender?.id && (
                                  <button
                                    onClick={() => {
                                      handleDeleteAllByUser(msg.sender?.id, msg.sender?.name || "Student");
                                      setMessageContextMenuId(null);
                                    }}
                                    style={{ color: "#ef4444", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}
                                    title="Admin Action: Purge all messages from this user"
                                  >
                                    <Trash2 size={13} color="#ef4444" />
                                    <span>Delete ALL by {msg.sender?.name || "User"}</span>
                                  </button>
                                )}

                                {isAdmin && !isMine && msg.sender?.id && (
                                  <button
                                    onClick={() => {
                                      handleToggleBlockStudent(msg.sender?.id, msg.sender?.name);
                                      setMessageContextMenuId(null);
                                    }}
                                    style={{ color: isUserBlocked(msg.sender?.id) ? "#34d399" : "#f59e0b" }}
                                  >
                                    {isUserBlocked(msg.sender?.id) ? (
                                      <>
                                        <UserCheck size={13} color="#34d399" />
                                        <span>Unblock Student</span>
                                      </>
                                    ) : (
                                      <>
                                        <ShieldOff size={13} color="#f59e0b" />
                                        <span>Block Student</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            )}

                            {/* WhatsApp & Instagram Reaction Pills below bubble */}
                            {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "4px",
                                  marginTop: "3px",
                                  justifyContent: isMine ? "flex-end" : "flex-start",
                                }}
                              >
                                {Object.entries(msg.reactions).map(([emoji, userIds]) => {
                                  if (!Array.isArray(userIds) || userIds.length === 0) return null;
                                  const didIReact = userIds.includes(currentUser?.id);
                                  return (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickReaction(emoji, msg);
                                      }}
                                      style={{
                                        background: didIReact ? "rgba(6, 182, 212, 0.25)" : "rgba(15, 23, 42, 0.8)",
                                        border: didIReact ? "1px solid rgba(6, 182, 212, 0.55)" : "1px solid rgba(255, 255, 255, 0.12)",
                                        borderRadius: "999px",
                                        padding: "2px 7px",
                                        fontSize: "0.72rem",
                                        color: "#fff",
                                        cursor: "pointer",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                                        transform: didIReact ? "scale(1.05)" : "scale(1)",
                                        transition: "all 0.15s ease",
                                      }}
                                      title={didIReact ? "You reacted. Tap to remove." : "Tap to react."}
                                    >
                                      <span>{emoji}</span>
                                      <span style={{ fontSize: "0.68rem", fontWeight: 700, color: didIReact ? "var(--accent-cyan)" : "#cbd5e1" }}>
                                        {userIds.length}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* LIVE TYPING INDICATOR (INSTAGRAM / WHATSAPP STYLE) */}
            {typingUsers.size > 0 && (
              <div
                style={{
                  padding: "5px 20px",
                  background: "rgba(11, 16, 27, 0.9)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "0.74rem",
                  color: "var(--accent-cyan)",
                }}
              >
                <div style={{ display: "inline-flex", gap: "3px", alignItems: "center" }}>
                  <span className="scm-dot" />
                  <span className="scm-dot" />
                  <span className="scm-dot" />
                </div>
                <span>
                  <strong>{Array.from(typingUsers).join(", ")}</strong> {typingUsers.size === 1 ? "is" : "are"} typing...
                </span>
              </div>
            )}

            {/* RESTRICTED NOTICE BAR */}
            {isBlocked && (
              <div style={{ padding: "10px 18px", background: "rgba(239, 68, 68, 0.2)", borderTop: "1px solid rgba(239, 68, 68, 0.4)", color: "#fca5a5", fontSize: "0.8rem", textAlign: "center" }}>
                🚫 You have been restricted from participating in chat by the Administrator.
              </div>
            )}

            {/* QUICK EMOJI PICKER DRAWER */}
            {showEmojiPicker && (
              <div
                style={{
                  padding: "10px 16px",
                  background: "rgba(15, 23, 42, 0.98)",
                  borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  overflowX: "auto",
                  scrollbarWidth: "none",
                  WebkitOverflowScrolling: "touch",
                  boxShadow: "0 -8px 24px rgba(0,0,0,0.3)",
                }}
              >
                {POPULAR_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleQuickReaction(emoji)}
                    style={{
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "none",
                      borderRadius: "8px",
                      width: "36px",
                      height: "36px",
                      fontSize: "1.2rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "transform 0.15s ease",
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            {/* WhatsApp Style Replying To Banner */}
            {replyingTo && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 16px",
                  background: "rgba(15, 23, 42, 0.96)",
                  borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                  borderLeft: "4px solid var(--accent-cyan)",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--accent-cyan)", fontWeight: 700 }}>
                    Replying to {replyingTo.senderName}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {replyingTo.type === "audio"
                      ? "🎙️ Voice Note"
                      : replyingTo.type === "note"
                      ? "📚 Academic Note"
                      : replyingTo.type === "pdf"
                      ? `📎 ${replyingTo.fileName || "PDF Document"}`
                      : replyingTo.type === "image"
                      ? "📷 Photo"
                      : replyingTo.text}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-dim)",
                    cursor: "pointer",
                    padding: "4px",
                  }}
                  title="Cancel Reply"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Inactivity Idle Timeout Alert */}
            {isIdleTimeout && (
              <div
                style={{
                  padding: "10px 16px",
                  background: "rgba(245, 158, 11, 0.16)",
                  borderTop: "1px solid rgba(245, 158, 11, 0.35)",
                  borderBottom: "1px solid rgba(245, 158, 11, 0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem", color: "#fcd34d" }}>
                  <Clock size={16} />
                  <span>Disconnected due to 30 minutes of inactivity.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsIdleTimeout(false);
                    if (currentUser) {
                      loadRoomsAndNotice();
                      handleSwitchRoom(currentRoom);
                    }
                  }}
                  style={{
                    background: "#f59e0b",
                    color: "#000",
                    border: "none",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Reconnect
                </button>
              </div>
            )}

            {/* =========================================================
                FLOATING INPUT BAR (INSTAGRAM DM & WHATSAPP HYBRID)
                ========================================================= */}
            <form
              onSubmit={handleSendMessage}
              style={{
                position: "relative",
                padding: "10px 16px max(12px, env(safe-area-inset-bottom, 12px)) 16px",
                background: "rgba(11, 16, 27, 0.98)",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {/* Mention Suggestions Popover */}
              {showMentionDropdown && mentionSuggestions.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 6px)",
                    left: "16px",
                    right: "16px",
                    maxHeight: "220px",
                    overflowY: "auto",
                    background: "rgba(15, 23, 42, 0.98)",
                    backdropFilter: "blur(14px)",
                    border: "1px solid rgba(56, 189, 248, 0.35)",
                    borderRadius: "14px",
                    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.65), 0 0 15px rgba(56, 189, 248, 0.15)",
                    padding: "6px",
                    zIndex: 60,
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  <div
                    style={{
                      padding: "4px 8px",
                      fontSize: "0.7rem",
                      color: "var(--accent-cyan)",
                      fontWeight: 700,
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>Mention Member or Admin (@)</span>
                    <span style={{ fontSize: "0.66rem", color: "var(--text-dim)", textTransform: "none" }}>Tap or Tab to choose</span>
                  </div>
                  {mentionSuggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => insertMention(item.tag)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "7px 10px",
                        borderRadius: "8px",
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(56, 189, 248, 0.15)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)")}
                    >
                      <div
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "50%",
                          background: item.color ? `${item.color}25` : "rgba(255,255,255,0.1)",
                          border: `1px solid ${item.color || "rgba(255,255,255,0.2)"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.82rem",
                          color: item.color || "#fff",
                          flexShrink: 0,
                          overflow: "hidden",
                        }}
                      >
                        {item.photoUrl ? (
                          <img src={item.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          item.badge || (item.name || "U").charAt(0).toUpperCase()
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "0.84rem", fontWeight: 700, color: item.color || "#fff" }}>
                            {item.tag}
                          </span>
                          <span style={{ fontSize: "0.76rem", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.name}
                          </span>
                        </div>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                          {item.subtitle}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                style={{ display: "none" }}
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
              />

              {isRecording ? (
                /* LIVE VOICE NOTE RECORDING TOOLBAR */
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.35)",
                    borderRadius: "28px",
                    padding: "6px 14px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      className="scm-record-pulse"
                      style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#ef4444", display: "inline-block" }}
                    />
                    <span style={{ fontSize: "0.86rem", fontWeight: 700, color: "#fca5a5", fontFamily: "var(--font-mono)" }}>
                      {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, "0")}
                    </span>
                    <span style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginLeft: "4px" }}>
                      Recording Voice Note...
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={cancelRecording}
                      style={{
                        background: "rgba(255,255,255,0.08)",
                        border: "none",
                        borderRadius: "50%",
                        width: "32px",
                        height: "32px",
                        color: "#cbd5e1",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Cancel Recording"
                    >
                      <X size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={sendRecording}
                      style={{
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        border: "none",
                        borderRadius: "50%",
                        width: "34px",
                        height: "34px",
                        color: "#fff",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 2px 10px rgba(16, 185, 129, 0.4)",
                      }}
                      title="Send Voice Note"
                    >
                      <Check size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                /* REGULAR INPUT PILL */
                <>
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      borderRadius: "28px",
                      padding: "4px 8px 4px 12px",
                      gap: "8px",
                      minWidth: 0,
                      transition: "border-color 0.2s ease, background 0.2s ease",
                    }}
                  >
                    {/* Media Attachment Button */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingFile || isBlocked}
                      style={{
                        background: "none",
                        border: "none",
                        color: uploadingFile ? "var(--accent-cyan)" : "var(--text-dim)",
                        cursor: "pointer",
                        padding: "6px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        borderRadius: "50%",
                      }}
                      title="Attach Academic PDF Note or Image (Up to 50 MB)"
                    >
                      {uploadingFile ? <RefreshCw size={18} className="spin" /> : <Paperclip size={18} />}
                    </button>

                    {/* Text Input */}
                    <input
                      ref={textInputRef}
                      type="text"
                      className="scm-pill-input"
                      placeholder={isBlocked ? "Participation restricted" : `Message ${currentRoom.name}...`}
                      value={messageText}
                      onChange={handleInputChange}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setShowMentionDropdown(false);
                        } else if (e.key === "Tab" && showMentionDropdown && mentionSuggestions.length > 0) {
                          e.preventDefault();
                          insertMention(mentionSuggestions[0].tag);
                        }
                      }}
                      disabled={isBlocked}
                      style={{
                        flex: 1,
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        color: "#fff",
                        fontSize: "0.9rem",
                        fontFamily: "inherit",
                        minWidth: 0,
                      }}
                    />

                    {/* Emoji Drawer Toggle */}
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker((prev) => !prev)}
                      disabled={isBlocked}
                      style={{
                        background: "none",
                        border: "none",
                        color: showEmojiPicker ? "var(--accent-cyan)" : "var(--text-dim)",
                        cursor: "pointer",
                        padding: "6px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        borderRadius: "50%",
                      }}
                      title="Insert Emoji"
                    >
                      <Smile size={18} />
                    </button>
                  </div>

                  {/* Send or Voice Note Mic Button */}
                  {messageText.trim() ? (
                    <button
                      type="submit"
                      disabled={isBlocked}
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "50%",
                        border: "none",
                        background: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #6366f1 100%)",
                        color: "#fff",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        boxShadow: "0 4px 16px rgba(6, 182, 212, 0.4)",
                        transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                        transform: "scale(1.05)",
                      }}
                      title="Send Message"
                    >
                      <Send size={17} style={{ marginLeft: "1px" }} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startRecording}
                      disabled={isBlocked || uploadingFile}
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "50%",
                        border: "none",
                        background: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #6366f1 100%)",
                        color: "#fff",
                        cursor: isBlocked ? "default" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        boxShadow: "0 4px 16px rgba(6, 182, 212, 0.4)",
                        transition: "transform 0.15s ease",
                      }}
                      title="Tap to record Voice Note"
                    >
                      <Mic size={18} />
                    </button>
                  )}
                </>
              )}
            </form>
          </div>
        )}
      </div>

      {/* =========================================================
          STUDENT PROFILE MODAL (AVATAR TAP)
          ========================================================= */}
      {viewingProfile && (
        <div
          onClick={() => setViewingProfile(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1500,
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "340px",
              background: "#0f172a",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "20px",
              padding: "24px 20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              boxShadow: "0 20px 50px rgba(0,0,0,0.7)",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: (viewingProfile.isAdmin || viewingProfile.role === "admin" || viewingProfile.isOfficialAdmin || viewingProfile.id?.startsWith("sys_admin_") || (viewingProfile.name && /admin/i.test(viewingProfile.name)))
                  ? "linear-gradient(135deg, #f59e0b, #ea580c)"
                  : getUsernameColor(viewingProfile.id, viewingProfile.name),
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.6rem",
                fontWeight: 800,
                marginBottom: "10px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                overflow: "hidden",
              }}
            >
              {(viewingProfile.isAdmin || viewingProfile.role === "admin" || viewingProfile.isOfficialAdmin || viewingProfile.id?.startsWith("sys_admin_") || (viewingProfile.name && /admin/i.test(viewingProfile.name))) ? (
                <Crown size={28} color="#fff" />
              ) : viewingProfile.photoUrl ? (
                <img
                  src={viewingProfile.photoUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                (viewingProfile.name || "S").charAt(0).toUpperCase()
              )}
            </div>
            <h3 style={{ margin: "0 0 2px", fontSize: "1.1rem", fontWeight: 800, color: "#fff" }}>
              {(viewingProfile.isAdmin || viewingProfile.role === "admin" || viewingProfile.isOfficialAdmin || viewingProfile.id?.startsWith("sys_admin_") || (viewingProfile.name && /admin/i.test(viewingProfile.name)))
                ? "👑 OFFICIAL ADMIN"
                : (viewingProfile.name || "Student Scholar")}
            </h3>
            {viewingProfile.username && !(viewingProfile.isAdmin || viewingProfile.role === "admin" || viewingProfile.isOfficialAdmin || viewingProfile.id?.startsWith("sys_admin_") || (viewingProfile.name && /admin/i.test(viewingProfile.name))) && (
              <div style={{ fontSize: "0.82rem", color: "#38bdf8", fontWeight: 700, marginBottom: "4px" }}>
                @{viewingProfile.username}
              </div>
            )}
            <div style={{ fontSize: "0.78rem", color: "var(--accent-cyan)", fontWeight: 700, marginBottom: "12px" }}>
              {(viewingProfile.isAdmin || viewingProfile.role === "admin" || viewingProfile.isOfficialAdmin || viewingProfile.id?.startsWith("sys_admin_") || (viewingProfile.name && /admin/i.test(viewingProfile.name)))
                ? "Authority Desk • Verified System Admin"
                : "🎓 Verified Student Scholar"}
            </div>

            <div style={{ width: "100%", background: "rgba(255,255,255,0.04)", borderRadius: "12px", padding: "12px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.8rem", color: "#cbd5e1" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-dim)" }}>Branch:</span>
                <strong>{viewingProfile.branch || "General / CSE"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-dim)" }}>Year:</span>
                <strong>{viewingProfile.year || "B.Tech"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-dim)" }}>College:</span>
                <strong style={{ maxWidth: "160px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                  {viewingProfile.college || "Campus"}
                </strong>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", width: "100%" }}>
              <button
                type="button"
                onClick={() => {
                  const tag = viewingProfile.username ? `@${viewingProfile.username}` : `@${(viewingProfile.name || "Student").split(" ")[0]}`;
                  setMessageText((prev) => `${tag} ` + prev);
                  setViewingProfile(null);
                  textInputRef.current?.focus();
                }}
                className="btn-primary"
                style={{ flex: 1, padding: "8px", fontSize: "0.82rem" }}
              >
                Mention {viewingProfile.username ? `@${viewingProfile.username}` : `@${(viewingProfile.name || "Student").split(" ")[0]}`}
              </button>
              <button
                type="button"
                onClick={() => setViewingProfile(null)}
                className="btn-secondary"
                style={{ padding: "8px 14px", fontSize: "0.82rem" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          CHAT PROFILE & DP MODAL (TURSO EDGE STORED)
          ========================================================= */}
      {showChatProfileModal && (
        <div
          onClick={() => setShowChatProfileModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
            zIndex: 100010,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0f172a",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              borderRadius: "20px",
              padding: "24px",
              maxWidth: "380px",
              width: "100%",
              boxShadow: "0 20px 50px rgba(0,0,0,0.6), 0 0 25px rgba(56, 189, 248, 0.15)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              position: "relative",
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setShowChatProfileModal(false)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "rgba(255,255,255,0.06)",
                border: "none",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                color: "#94a3b8",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={16} />
            </button>

            <h3 style={{ margin: "0 0 4px", fontSize: "1.15rem", fontWeight: 800, color: "#fff" }}>
              Chat Profile & Photo
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "0.78rem", color: "var(--text-dim)" }}>
              Customize your public chat avatar & handle
            </p>

            {/* Avatar Photo Preview with Upload Button */}
            <div style={{ position: "relative", marginBottom: "16px" }}>
              <div
                style={{
                  width: "90px",
                  height: "90px",
                  borderRadius: "50%",
                  border: "3px solid #38bdf8",
                  overflow: "hidden",
                  background: "#1e293b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "2rem",
                  fontWeight: 800,
                  color: "#fff",
                  boxShadow: "0 4px 20px rgba(56, 189, 248, 0.3)",
                }}
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Profile Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  (editingUsername || currentUser?.name || "U").charAt(0).toUpperCase()
                )}
              </div>

              {/* Camera icon button */}
              <button
                type="button"
                onClick={() => profileFileInputRef.current?.click()}
                style={{
                  position: "absolute",
                  bottom: "0",
                  right: "0",
                  background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
                  border: "2px solid #0f172a",
                  borderRadius: "50%",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                }}
                title="Upload Profile Photo"
              >
                <Camera size={16} />
              </button>

              <input
                ref={profileFileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp"
                style={{ display: "none" }}
                onChange={handleAvatarFileSelect}
              />
            </div>

            <button
              type="button"
              onClick={() => profileFileInputRef.current?.click()}
              style={{
                background: "rgba(56, 189, 248, 0.12)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                borderRadius: "8px",
                padding: "6px 14px",
                color: "#38bdf8",
                fontSize: "0.78rem",
                fontWeight: 700,
                cursor: "pointer",
                marginBottom: "16px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Camera size={14} />
              <span>Choose Profile Photo</span>
            </button>

            {/* Chat Handle input */}
            <div style={{ width: "100%", textAlign: "left", marginBottom: "14px" }}>
              <label style={{ fontSize: "0.76rem", fontWeight: 700, color: "#cbd5e1", display: "block", marginBottom: "6px" }}>
                Chat Handle (@username)
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "rgba(255,255,255,0.05)",
                  border: isUsernameReserved ? "1px solid #ef4444" : "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "10px",
                  padding: "0 12px",
                }}
              >
                <span style={{ color: isUsernameReserved ? "#f87171" : "#38bdf8", fontWeight: 800, fontSize: "0.9rem" }}>@</span>
                <input
                  type="text"
                  value={editingUsername}
                  onChange={(e) => setEditingUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="scholar_handle"
                  maxLength={24}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    padding: "10px 8px",
                    color: "#fff",
                    fontSize: "0.88rem",
                    outline: "none",
                    fontWeight: 600,
                  }}
                />
              </div>

              {isUsernameReserved && (
                <div style={{ fontSize: "0.72rem", color: "#f87171", fontWeight: 700, marginTop: "4px" }}>
                  ⚠️ Reserved for administrators. Please pick a student handle.
                </div>
              )}
            </div>

            {/* Feedback message */}
            {profileMsg && (
              <div
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  marginBottom: "14px",
                  fontSize: "0.76rem",
                  fontWeight: 600,
                  background: profileMsg.type === "error" ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                  color: profileMsg.type === "error" ? "#fca5a5" : "#6ee7b7",
                  border: profileMsg.type === "error" ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(16, 185, 129, 0.3)",
                }}
              >
                {profileMsg.text}
              </div>
            )}

            {/* Save Button */}
            <button
              type="button"
              onClick={handleSaveChatProfile}
              disabled={savingProfile || isUsernameReserved}
              className="btn-primary"
              style={{
                width: "100%",
                padding: "10px",
                fontSize: "0.86rem",
                fontWeight: 700,
                opacity: savingProfile || isUsernameReserved ? 0.6 : 1,
                cursor: savingProfile || isUsernameReserved ? "not-allowed" : "pointer",
              }}
            >
              {savingProfile ? "Saving..." : "Save Chat Profile"}
            </button>
          </div>
        </div>
      )}

      {/* =========================================================
          IMAGE LIGHTBOX OVERLAY (INSTAGRAM PHOTO VIEWER)
          ========================================================= */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1400,
            background: "rgba(0,0,0,0.92)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            style={{ position: "relative", maxWidth: "92vw", maxHeight: "92vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxUrl}
              alt="Expanded Preview"
              style={{
                maxWidth: "100%",
                maxHeight: "85vh",
                borderRadius: "14px",
                boxShadow: "0 0 40px rgba(0,0,0,0.9)",
                display: "block",
                objectFit: "contain",
              }}
            />
            <div style={{ position: "absolute", top: "12px", right: "12px", display: "flex", gap: "8px" }}>
              <a
                href={lightboxUrl}
                download="chat_attachment.png"
                target="_blank"
                rel="noreferrer"
                style={{
                  background: "rgba(0,0,0,0.7)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "#fff",
                  borderRadius: "50%",
                  width: "36px",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textDecoration: "none",
                }}
                title="Download Image"
              >
                <Download size={16} />
              </a>
              <button
                onClick={() => setLightboxUrl(null)}
                style={{
                  background: "rgba(0,0,0,0.7)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "#fff",
                  borderRadius: "50%",
                  width: "36px",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
      {/* =========================================================
          ADMIN BLOCKED STUDENTS MANAGEMENT MODAL
          ========================================================= */}
      {showBlockedModal && (
        <div
          onClick={() => setShowBlockedModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1350,
            background: "rgba(0,0,0,0.82)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "linear-gradient(145deg, #111827, #0f172a)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "520px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(239,68,68,0.15)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(239, 68, 68, 0.08)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.2)",
                    borderRadius: "8px",
                    padding: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ShieldOff size={18} color="#ef4444" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
                    Restricted Chat Students
                  </h3>
                  <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text-dim)" }}>
                    Manage students restricted from participating in chat across all rooms
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  onClick={fetchBlockedStudents}
                  disabled={loadingBlockedList}
                  style={{
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px",
                    color: "var(--text-dim)",
                    cursor: "pointer",
                  }}
                  title="Refresh list"
                >
                  <RefreshCw size={14} className={loadingBlockedList ? "spin" : ""} />
                </button>
                <button
                  onClick={() => setShowBlockedModal(false)}
                  style={{
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px",
                    color: "var(--text-dim)",
                    cursor: "pointer",
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Live Student Search Bar */}
            <div
              style={{
                padding: "12px 18px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(0, 0, 0, 0.25)",
              }}
            >
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <Search size={15} color="var(--text-dim)" style={{ position: "absolute", left: "12px" }} />
                <input
                  type="text"
                  value={studentSearchQuery}
                  onChange={(e) => handleStudentSearchChange(e.target.value)}
                  placeholder="🔍 Search student by name, email, or mobile..."
                  style={{
                    width: "100%",
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "10px",
                    padding: "9px 34px 9px 36px",
                    fontSize: "0.82rem",
                    color: "#fff",
                    outline: "none",
                  }}
                />
                {studentSearchQuery && (
                  <button
                    onClick={() => {
                      setStudentSearchQuery("");
                      setStudentSearchResults([]);
                    }}
                    style={{
                      position: "absolute",
                      right: "10px",
                      background: "none",
                      border: "none",
                      color: "var(--text-dim)",
                      cursor: "pointer",
                      padding: "2px",
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Live Student Search Bar */}
            <div
              style={{
                padding: "16px",
                overflowY: "auto",
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {/* If user is searching */}
              {studentSearchQuery.trim().length >= 2 ? (
                searchingStudents ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "var(--text-dim)", fontSize: "0.85rem" }}>
                    <RefreshCw size={24} className="spin" style={{ marginBottom: "10px", opacity: 0.7 }} />
                    <div>Searching student directory...</div>
                  </div>
                ) : studentSearchResults.length === 0 ? (
                  <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-dim)" }}>
                    <UserX size={36} color="#94a3b8" style={{ marginBottom: "10px", opacity: 0.6 }} />
                    <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "#cbd5e1" }}>
                      No students found matching "{studentSearchQuery}"
                    </div>
                  </div>
                ) : (
                  studentSearchResults.map((st) => {
                    const blocked = isUserBlocked(st.id) || st.isBlocked;
                    return (
                      <div
                        key={st.id}
                        style={{
                          background: "rgba(255, 255, 255, 0.03)",
                          border: "1px solid rgba(255, 255, 255, 0.07)",
                          borderRadius: "10px",
                          padding: "12px 14px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontWeight: 700, fontSize: "0.86rem", color: blocked ? "#f87171" : "#fff" }}>
                              {st.name || "Student"}
                            </span>
                            {st.username && (
                              <span style={{ fontSize: "0.75rem", color: "var(--accent-cyan)" }}>@{st.username}</span>
                            )}
                            <span
                              style={{
                                background: blocked ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                                color: blocked ? "#ef4444" : "#10b981",
                                fontSize: "0.62rem",
                                padding: "1px 6px",
                                borderRadius: "4px",
                                fontWeight: 700,
                              }}
                            >
                              {blocked ? "BLOCKED 🚫" : "ACTIVE ✅"}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: "0.72rem",
                              color: "var(--text-dim)",
                              marginTop: "3px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "2px",
                            }}
                          >
                            {st.email && st.email !== "N/A" && <div>✉️ {st.email}</div>}
                            {st.mobile && st.mobile !== "N/A" && <div>📱 {st.mobile}</div>}
                            {st.college && <div>🏫 {st.college} {st.year ? `(${st.year})` : ""}</div>}
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <button
                            onClick={() => handleToggleBlockStudent(st.id, st.name)}
                            style={{
                              background: blocked ? "rgba(52, 211, 153, 0.15)" : "rgba(239, 68, 68, 0.15)",
                              border: blocked ? "1px solid rgba(52, 211, 153, 0.4)" : "1px solid rgba(239, 68, 68, 0.4)",
                              color: blocked ? "#34d399" : "#f87171",
                              borderRadius: "8px",
                              padding: "6px 10px",
                              fontSize: "0.74rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              whiteSpace: "nowrap",
                            }}
                            title={blocked ? "Restore student chat privileges" : "Restrict student from chat"}
                          >
                            {blocked ? <UserCheck size={13} /> : <ShieldOff size={13} />}
                            {blocked ? "Unblock" : "Block"}
                          </button>

                          <button
                            onClick={() => handleDeleteAllByUser(st.id, st.name)}
                            style={{
                              background: "rgba(239, 68, 68, 0.1)",
                              border: "1px solid rgba(239, 68, 68, 0.25)",
                              color: "#fca5a5",
                              borderRadius: "8px",
                              padding: "6px 9px",
                              fontSize: "0.74rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              whiteSpace: "nowrap",
                            }}
                            title="Purge all chat messages sent by this student"
                          >
                            <Trash2 size={12} color="#fca5a5" />
                            <span>Purge Msgs</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                /* Default: Currently Restricted Students */
                loadingBlockedList ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "var(--text-dim)", fontSize: "0.85rem" }}>
                    <RefreshCw size={24} className="spin" style={{ marginBottom: "10px", opacity: 0.7 }} />
                    <div>Loading restricted students directory...</div>
                  </div>
                ) : blockedStudentsList.length === 0 ? (
                  <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-dim)" }}>
                    <UserCheck size={36} color="#34d399" style={{ marginBottom: "10px", opacity: 0.8 }} />
                    <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "#cbd5e1" }}>
                      No Students Currently Restricted
                    </div>
                    <div style={{ fontSize: "0.75rem", marginTop: "4px", color: "var(--text-dim)" }}>
                      Type a student's name, email, or mobile in the search box above to find and block any student.
                    </div>
                  </div>
                ) : (
                  blockedStudentsList.map((st) => (
                    <div
                      key={st.id}
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid rgba(255, 255, 255, 0.07)",
                        borderRadius: "10px",
                        padding: "12px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.86rem", color: "#f87171" }}>
                            {st.name || "Student"}
                          </span>
                          <span
                            style={{
                              background: "rgba(239, 68, 68, 0.15)",
                              color: "#ef4444",
                              fontSize: "0.62rem",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              fontWeight: 700,
                            }}
                          >
                            BLOCKED
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: "var(--text-dim)",
                            marginTop: "3px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "2px",
                          }}
                        >
                          {st.email && st.email !== "N/A" && <div>✉️ {st.email}</div>}
                          {st.mobile && st.mobile !== "N/A" && <div>📱 {st.mobile}</div>}
                          {st.college && <div>🏫 {st.college} {st.year ? `(${st.year})` : ""}</div>}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <button
                          onClick={() => handleToggleBlockStudent(st.id, st.name)}
                          style={{
                            background: "rgba(52, 211, 153, 0.15)",
                            border: "1px solid rgba(52, 211, 153, 0.4)",
                            color: "#34d399",
                            borderRadius: "8px",
                            padding: "6px 12px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            whiteSpace: "nowrap",
                            transition: "all 0.15s ease",
                          }}
                          title="Unblock student and restore chat privileges"
                        >
                          <UserCheck size={13} />
                          Unblock
                        </button>

                        <button
                          onClick={() => handleDeleteAllByUser(st.id, st.name)}
                          style={{
                            background: "rgba(239, 68, 68, 0.1)",
                            border: "1px solid rgba(239, 68, 68, 0.25)",
                            color: "#fca5a5",
                            borderRadius: "8px",
                            padding: "6px 9px",
                            fontSize: "0.74rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            whiteSpace: "nowrap",
                          }}
                          title="Purge all chat messages sent by this student"
                        >
                          <Trash2 size={12} color="#fca5a5" />
                          <span>Purge Msgs</span>
                        </button>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "12px 18px",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(0, 0, 0, 0.25)",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => setShowBlockedModal(false)}
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  color: "#cbd5e1",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📚 Share Note to Study Chat Destination Picker Modal */}
      {shareNoteModal && (
        <div
          onClick={() => setShareNoteModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1360,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "linear-gradient(145deg, #0d1527, #070b14)",
              border: "1px solid rgba(6, 182, 212, 0.35)",
              borderRadius: "18px",
              width: "100%",
              maxWidth: "500px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 25px 60px rgba(0,0,0,0.85), 0 0 40px rgba(6,182,212,0.18)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(6, 182, 212, 0.08)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    background: "rgba(6, 182, 212, 0.2)",
                    borderRadius: "10px",
                    padding: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--accent-cyan)",
                  }}
                >
                  <Share2 size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#fff" }}>
                    Share Note to Study Chat
                  </h3>
                  <p style={{ margin: 0, fontSize: "0.74rem", color: "var(--text-dim)" }}>
                    Select destination room or private secret study pod
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShareNoteModal(null)}
                style={{
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "6px",
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={17} />
              </button>
            </div>

            {/* Content Body */}
            <div
              style={{
                padding: "20px",
                overflowY: "auto",
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              {/* Note Preview Box */}
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "12px",
                  padding: "14px",
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    background: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(6,182,212,0.25))",
                    border: "1px solid rgba(6,182,212,0.35)",
                    borderRadius: "10px",
                    padding: "10px",
                    color: "var(--accent-cyan)",
                    flexShrink: 0,
                  }}
                >
                  <BookOpen size={24} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: "0.92rem", color: "#fff", lineHeight: 1.3, marginBottom: "4px" }}>
                    {shareNoteModal.title || "Academic Note"}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "6px" }}>
                    {shareNoteModal.subject && (
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: "5px",
                          background: "rgba(99, 102, 241, 0.18)",
                          color: "#a5b4fc",
                          border: "1px solid rgba(99, 102, 241, 0.3)",
                        }}
                      >
                        {shareNoteModal.subject}
                      </span>
                    )}
                    {shareNoteModal.branch && (
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: "5px",
                          background: "rgba(6, 182, 212, 0.15)",
                          color: "#67e8f9",
                          border: "1px solid rgba(6, 182, 212, 0.3)",
                        }}
                      >
                        {shareNoteModal.branch}
                      </span>
                    )}
                    {shareNoteModal.year && (
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: "5px",
                          background: "rgba(16, 185, 129, 0.15)",
                          color: "#6ee7b7",
                          border: "1px solid rgba(16, 185, 129, 0.3)",
                        }}
                      >
                        {shareNoteModal.year}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Destination Selector */}
              <div>
                <label
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#cbd5e1",
                    display: "block",
                    marginBottom: "8px",
                  }}
                >
                  Choose Destination Room:
                </label>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {/* Option 1: Public Hall */}
                  <div
                    onClick={() => setShareTargetRoomId("public")}
                    style={{
                      background: shareTargetRoomId === "public" ? "rgba(99, 102, 241, 0.15)" : "rgba(255, 255, 255, 0.02)",
                      border: shareTargetRoomId === "public" ? "1.5px solid #6366f1" : "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "10px",
                      padding: "12px 14px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Globe size={18} color={shareTargetRoomId === "public" ? "#818cf8" : "var(--text-dim)"} />
                      <div>
                        <div style={{ fontSize: "0.86rem", fontWeight: 700, color: shareTargetRoomId === "public" ? "#fff" : "#cbd5e1" }}>
                          🏛️ General Student Hall
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
                          Public • Visible to all students in General Chat
                        </div>
                      </div>
                    </div>
                    {shareTargetRoomId === "public" && (
                      <CheckCircle size={18} color="#818cf8" />
                    )}
                  </div>

                  {/* Private Rooms */}
                  {(Array.isArray(rooms) ? rooms : []).filter((r) => r && r.isPrivate).map((pod) => {
                    const isSelected = shareTargetRoomId === pod.id;
                    return (
                      <div
                        key={pod.id}
                        onClick={() => setShareTargetRoomId(pod.id)}
                        style={{
                          background: isSelected ? "rgba(99, 102, 241, 0.15)" : "rgba(255, 255, 255, 0.02)",
                          border: isSelected ? "1.5px solid #6366f1" : "1px solid rgba(255, 255, 255, 0.08)",
                          borderRadius: "10px",
                          padding: "12px 14px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <Lock size={18} color={isSelected ? "#818cf8" : "var(--accent-cyan)"} />
                          <div>
                            <div style={{ fontSize: "0.86rem", fontWeight: 700, color: isSelected ? "#fff" : "#cbd5e1" }}>
                              🔒 {pod.name}
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
                              Private Study Chat • Only joined members
                            </div>
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle size={18} color="#818cf8" />
                        )}
                      </div>
                    );
                  })}

                  {/* If user has no private chats */}
                  {(Array.isArray(rooms) ? rooms : []).filter((r) => r && r.isPrivate).length === 0 && (
                    <div
                      style={{
                        padding: "10px 14px",
                        background: "rgba(99, 102, 241, 0.08)",
                        border: "1px dashed rgba(99, 102, 241, 0.3)",
                        borderRadius: "10px",
                        fontSize: "0.75rem",
                        color: "#a5b4fc",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                      }}
                    >
                      <span>🔒 No active Private Chats joined yet.</span>
                      <button
                        type="button"
                        onClick={() => {
                          setShareNoteModal(null);
                          setActiveTab("create_join");
                        }}
                        style={{
                          background: "rgba(99, 102, 241, 0.25)",
                          border: "1px solid rgba(99, 102, 241, 0.45)",
                          color: "#fff",
                          borderRadius: "6px",
                          padding: "3px 8px",
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        + Create Chat
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Optional Custom Message */}
              <div>
                <label
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#cbd5e1",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Custom Message (Optional):
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={shareCustomText}
                  onChange={(e) => setShareCustomText(e.target.value)}
                  placeholder="e.g. Check out this important unit for exams!"
                  style={{ width: "100%", fontSize: "0.82rem" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleConfirmShareNote();
                    }
                  }}
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div
              style={{
                padding: "14px 20px",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(0, 0, 0, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={() => setShareNoteModal(null)}
                style={{
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  color: "#cbd5e1",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmShareNote}
                style={{
                  background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 20px",
                  color: "#fff",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 4px 14px rgba(6, 182, 212, 0.35)",
                }}
              >
                <Send size={14} />
                <span>
                  Share to {shareTargetRoomId === "public" ? "Public Chat" : ((Array.isArray(rooms) ? rooms : []).find((r) => r && r.id === shareTargetRoomId)?.name || "Private Chat")}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          SHARE PRIVATE CHAT MODAL
          ========================================================= */}
      {shareRoomModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(8px)",
            zIndex: 100000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            animation: "fadeIn 0.2s ease-out",
          }}
          onClick={() => setShareRoomModal(null)}
        >
          <div
            style={{
              background: "linear-gradient(145deg, #0f172a, #1e293b)",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              borderRadius: "20px",
              width: "100%",
              maxWidth: "460px",
              padding: "24px",
              boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 35px rgba(6, 182, 212, 0.2)",
              color: "#fff",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "14px",
                    background: "linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(59, 130, 246, 0.25))",
                    border: "1px solid rgba(56, 189, 248, 0.45)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#38bdf8",
                  }}
                >
                  <Share2 size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#fff" }}>
                    Share Private Chat
                  </h3>
                  <div style={{ fontSize: "0.78rem", color: "var(--accent-cyan)", fontWeight: 600, marginTop: "2px" }}>
                    🔒 {shareRoomModal.name}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShareRoomModal(null)}
                style={{
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "6px",
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.15s ease",
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Subtext */}
            <p style={{ margin: "0 0 16px", fontSize: "0.8rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
              Invite classmates or study buddies to join this private session. They can join using the code or the instant invite link.
            </p>

            {/* Invite Code Box */}
            <div
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "14px",
                padding: "14px",
                marginBottom: "14px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Private Chat Invite Code
                </span>
                <span style={{ fontSize: "0.7rem", color: "#34d399", fontWeight: 600 }}>
                  Active & Ready
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    flex: 1,
                    background: "rgba(0, 0, 0, 0.35)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    fontSize: "1.1rem",
                    fontWeight: 800,
                    letterSpacing: "2px",
                    color: "#38bdf8",
                    fontFamily: "monospace",
                    textAlign: "center",
                    userSelect: "all",
                  }}
                >
                  {shareRoomModal.secretCode || "FREE-ACCESS"}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (shareRoomModal.secretCode) {
                      navigator.clipboard.writeText(shareRoomModal.secretCode);
                      setCopiedShareCode(true);
                      setTimeout(() => setCopiedShareCode(false), 2000);
                    }
                  }}
                  style={{
                    background: copiedShareCode ? "rgba(16, 185, 129, 0.25)" : "rgba(255, 255, 255, 0.08)",
                    border: copiedShareCode ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "10px",
                    padding: "10px 16px",
                    color: copiedShareCode ? "#34d399" : "#fff",
                    fontWeight: 700,
                    fontSize: "0.82rem",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.18s ease",
                    whiteSpace: "nowrap",
                  }}
                >
                  {copiedShareCode ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copiedShareCode ? "Copied!" : "Copy Code"}</span>
                </button>
              </div>
            </div>

            {/* Direct Link Box */}
            <div
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "14px",
                padding: "14px",
                marginBottom: "16px",
              }}
            >
              <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                Direct Join Link
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/?chat=private&code=${encodeURIComponent(shareRoomModal.secretCode || "")}`}
                  style={{
                    flex: 1,
                    background: "rgba(0, 0, 0, 0.35)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "10px",
                    padding: "9px 12px",
                    fontSize: "0.78rem",
                    color: "#cbd5e1",
                    fontFamily: "monospace",
                    outline: "none",
                  }}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  onClick={() => {
                    const link = `${window.location.origin}/?chat=private&code=${encodeURIComponent(shareRoomModal.secretCode || "")}`;
                    navigator.clipboard.writeText(link);
                    setCopiedShareLink(true);
                    setTimeout(() => setCopiedShareLink(false), 2000);
                  }}
                  style={{
                    background: copiedShareLink ? "rgba(16, 185, 129, 0.25)" : "linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(59, 130, 246, 0.25))",
                    border: copiedShareLink ? "1px solid #10b981" : "1px solid rgba(56, 189, 248, 0.4)",
                    borderRadius: "10px",
                    padding: "9px 16px",
                    color: copiedShareLink ? "#34d399" : "#38bdf8",
                    fontWeight: 700,
                    fontSize: "0.82rem",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.18s ease",
                    whiteSpace: "nowrap",
                  }}
                >
                  {copiedShareLink ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copiedShareLink ? "Copied!" : "Copy Link"}</span>
                </button>
              </div>
            </div>

            {/* Quick Social Share Buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
              {/* WhatsApp */}
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                  `🎓 Join my Private Chat on Free Study Material!\n\n🔒 Chat: "${shareRoomModal.name}"\n🔑 Invite Code: ${shareRoomModal.secretCode || ""}\n🔗 Link: ${window.location.origin}/?chat=private&code=${encodeURIComponent(shareRoomModal.secretCode || "")}\n\n(Encrypted & automatically deleted once everyone leaves.)`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: "rgba(37, 211, 102, 0.12)",
                  border: "1px solid rgba(37, 211, 102, 0.35)",
                  borderRadius: "12px",
                  padding: "10px 14px",
                  color: "#4ade80",
                  textDecoration: "none",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  transition: "all 0.18s ease",
                }}
              >
                <span>💬 WhatsApp</span>
              </a>

              {/* Telegram */}
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(
                  `${window.location.origin}/?chat=private&code=${encodeURIComponent(shareRoomModal.secretCode || "")}`
                )}&text=${encodeURIComponent(`🎓 Join my Private Chat: "${shareRoomModal.name}" (Code: ${shareRoomModal.secretCode || ""})`)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: "rgba(56, 189, 248, 0.12)",
                  border: "1px solid rgba(56, 189, 248, 0.35)",
                  borderRadius: "12px",
                  padding: "10px 14px",
                  color: "#38bdf8",
                  textDecoration: "none",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  transition: "all 0.18s ease",
                }}
              >
                <span>✈️ Telegram</span>
              </a>
            </div>

            {/* Native Share button if supported */}
            {typeof navigator !== "undefined" && navigator.share && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const link = `${window.location.origin}/?chat=private&code=${encodeURIComponent(shareRoomModal.secretCode || "")}`;
                    await navigator.share({
                      title: `Join Private Chat: ${shareRoomModal.name}`,
                      text: `🎓 Join my Private Chat "${shareRoomModal.name}" on Free Study Material!\n🔑 Invite Code: ${shareRoomModal.secretCode || ""}`,
                      url: link,
                    });
                  } catch (e) {
                    // ignore user abort
                  }
                }}
                style={{
                  width: "100%",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "12px",
                  padding: "9px",
                  color: "#cbd5e1",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  marginBottom: "14px",
                }}
              >
                <Share2 size={14} />
                <span>More Share Options...</span>
              </button>
            )}

            {/* Ephemeral Privacy Notice */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(99, 102, 241, 0.08)",
                border: "1px solid rgba(99, 102, 241, 0.2)",
                borderRadius: "10px",
                padding: "8px 12px",
                fontSize: "0.72rem",
                color: "#a5b4fc",
                lineHeight: 1.4,
              }}
            >
              <Lock size={14} style={{ flexShrink: 0 }} />
              <span>
                Ephemeral & Private: When all students leave, all chat messages and attachments are permanently deleted.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* RENAME PRIVATE CHAT MODAL */}
      {renameModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.78)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10001,
            padding: "16px",
          }}
          onClick={() => setRenameModalOpen(false)}
        >
          <div
            style={{
              background: "linear-gradient(145deg, #0f172a 0%, #1e293b 100%)",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              borderRadius: "16px",
              padding: "22px",
              width: "100%",
              maxWidth: "420px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Edit2 size={16} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#fff" }}>Rename Private Chat</h4>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Update room name for all members</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRenameModalOpen(false)}
                style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: "4px" }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRoomRename} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "0.76rem", color: "var(--text-dim)", display: "block", marginBottom: "6px", fontWeight: 600 }}>
                  Chat Name
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={newRoomNameInput}
                  onChange={(e) => setNewRoomNameInput(e.target.value.slice(0, 60))}
                  placeholder="e.g. DBMS Exam Revision 2026"
                  autoFocus
                  required
                  style={{ width: "100%", fontSize: "0.88rem", boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", fontSize: "0.68rem", color: "var(--text-dim)" }}>
                  <span>Visible to all current & future members</span>
                  <span>{newRoomNameInput.length}/60</span>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
                <button
                  type="button"
                  onClick={() => setRenameModalOpen(false)}
                  className="btn-secondary"
                  style={{ padding: "8px 14px", fontSize: "0.8rem" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={renameLoading || !newRoomNameInput.trim()}
                  className="btn-primary"
                  style={{
                    padding: "8px 16px",
                    fontSize: "0.8rem",
                    background: "linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)",
                    border: "none",
                    color: "#fff",
                    fontWeight: 700,
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  {renameLoading ? "Saving..." : "Save New Name"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
