import { useState, useEffect, useRef } from "react";
import {
  X,
  Search,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  Zap,
  BookOpen,
  Upload,
  RotateCcw,
  Pencil,
  Send,
  Trash2,
  Undo2,
  MessageSquare,
} from "lucide-react";
import {
  solveCircleQuery,
  extractTextFromCroppedCanvas,
  extractMimeAndBase64,
  PENCIL_CURSOR_STYLE,
  strokePointsToSvgPath,
  computeFreehandBounds,
  renderFreehandStrokesToCanvas,
} from "../utils/circleSearchEngine";
import {
  warmupClientOcr,
  compressUploadedImageDataUrl,
  prepareCanvasForVision,
} from "../utils/clientOcr";
import { useSafariNonPassiveTouchLock, copyTextSafariSafe } from "../utils/safariCompat";
import MathMarkdown from "./MathMarkdown";
import GeminiIcon from "./GeminiIcon";

function isGenericPlaceholderText(txt = "") {
  const s = String(txt || "").trim();
  if (!s) return true;
  return /^(?:question\s*\/\s*diagram\s+from\s+page|analyze(?:,\s*identify,\s*and\s*solve)?\s+(?:this\s+)?(?:selected|drawn)|selected\s+visual\s+region|identify,\s*explain,\s*and\s*solve)/i.test(
    s
  );
}

function parseVisionExtractedHeader(markdownAnswer = "") {
  if (!markdownAnswer || typeof markdownAnswer !== "string") return "";
  const match = markdownAnswer.match(
    /(?:\*\*|##?\s*)?(?:📝\s*)?Extracted\s+Text(?:\s*\/\s*Formula)?\s*:?\s*(?:\*\*)?\s*([^\n]+(?:\n(?!\s*(?:\*\*|##|---|\d+\.))[^\n]+)*)/i
  );
  if (!match || !match[1]) return "";
  const cleaned = match[1].replace(/^\*+|\*+$/g, "").trim();
  if (!cleaned || /^(?:n\/a|none|diagram\s+only)$/i.test(cleaned)) return "";
  return cleaned.slice(0, 600);
}

export default function CircleSearchModal({
  isOpen,
  onClose,
  circleData = null, // { text, source, croppedImage, isPureSketch, bounds, noteId, subject, context }
  onOpenNote,
  onRedrawWithPencil,
  allNotes = [],
}) {
  const [activeTab, setActiveTab] = useState("ai"); // 'ai' | 'notes'
  const [queryText, setQueryText] = useState("");
  const [followUpInput, setFollowUpInput] = useState("");
  const [isSolving, setIsSolving] = useState(false);
  const [solveStatus, setSolveStatus] = useState("");
  const [messages, setMessages] = useState([]); // [{ id, role: 'user'|'assistant', text, image, cached, cacheTier, provider, latencyMs }]
  const [copiedMsgId, setCopiedMsgId] = useState(null);
  const [copiedQuery, setCopiedQuery] = useState(false);
  const [isOcrCopying, setIsOcrCopying] = useState(false);
  const [copiedOcr, setCopiedOcr] = useState(false);
  const [isPadOcrCopying, setIsPadOcrCopying] = useState(false);
  const [copiedPadOcr, setCopiedPadOcr] = useState(false);
  const [liveExtractedText, setLiveExtractedText] = useState("");
  const [isAutoExtracting, setIsAutoExtracting] = useState(false);
  const [matchingNotes, setMatchingNotes] = useState([]);

  // Input Modes: 'pencil' | 'image' | 'text'
  const [uploadedImageSrc, setUploadedImageSrc] = useState(circleData?.croppedImage || null);
  const [activeInputMode, setActiveInputMode] = useState(
    circleData?.croppedImage ? "image" : circleData?.text ? "text" : "pencil"
  );
  const [showTopInputPanel, setShowTopInputPanel] = useState(!circleData);

  // Freehand Pencil Strokes for Photo Selection & Standalone Pencil Pad
  const [imageStrokes, setImageStrokes] = useState([]);
  const [currentImageStroke, setCurrentImageStroke] = useState(null);
  const [padStrokes, setPadStrokes] = useState([]);
  const [currentPadStroke, setCurrentPadStroke] = useState(null);

  const isDrawingImgRef = useRef(false);
  const isDrawingPadRef = useRef(false);
  const isSolvingRef = useRef(false);
  const lastProcessedCircleFingerprintRef = useRef(null);
  const imgOcrDebounceRef = useRef(null);
  const imageContainerRef = useRef(null);
  const padContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const latestAiMessageRef = useRef(null);
  const chatScrollContainerRef = useRef(null);

  // Prevent iOS/iPadOS Safari scroll hijacking & pointercancel on Pencil Pad & Photo selection
  useSafariNonPassiveTouchLock(
    padContainerRef,
    Boolean(isOpen && showTopInputPanel && activeInputMode === "pencil"),
    ""
  );
  useSafariNonPassiveTouchLock(
    imageContainerRef,
    Boolean(isOpen && showTopInputPanel && activeInputMode === "image" && uploadedImageSrc),
    ""
  );

  const SUGGESTED_QUERIES = [
    "Solve Laplace transform of $e^{2t} \\sin(3t)$",
    "Banker's Algorithm safe state conditions in OS",
    "Dijkstra Shortest Path algorithm with time complexity",
    "Derive Maxwell's 4 electromagnetic equations",
  ];

  const FOLLOW_UP_CHIPS = [
    "💡 Isko simple Hinglish me samjhao",
    "📝 Short exam revision points do",
    "🧮 Ek solved numerical example dikhao",
    "❓ Isse related 3 viva questions batao",
  ];

  // Smart-scroll: When AI answer arrives, smoothly scroll directly to the START/TOP of the AI answer
  // so the student can immediately read the full solution from Line 1!
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "assistant") {
        const scrollToAiAnswer = () => {
          if (!chatScrollContainerRef.current) return;
          if (latestAiMessageRef.current) {
            const targetTop = Math.max(0, latestAiMessageRef.current.offsetTop - 10);
            chatScrollContainerRef.current.scrollTo({ top: targetTop, behavior: "smooth" });
          } else {
            chatScrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
          }
        };

        scrollToAiAnswer();
        const t1 = setTimeout(scrollToAiAnswer, 70);
        const t2 = setTimeout(scrollToAiAnswer, 220);
        return () => {
          clearTimeout(t1);
          clearTimeout(t2);
        };
      } else {
        if (chatScrollContainerRef.current) {
          chatScrollContainerRef.current.scrollTo({
            top: chatScrollContainerRef.current.scrollHeight,
            behavior: "smooth",
          });
        }
      }
    }
  }, [messages, isSolving]);

  const buildConversationContext = (priorMessages) => {
    const effectiveSelected = liveExtractedText || (!circleData?.isPureSketch ? circleData?.text : "");
    const baseCtx =
      circleData?.context ||
      (effectiveSelected && !isGenericPlaceholderText(effectiveSelected)
        ? `Selected Content: ${effectiveSelected}`
        : "");
    const recentTurns = (priorMessages || [])
      .slice(-6)
      .map((m) => `${m.role === "user" ? "Student" : "AI Tutor"}: ${String(m.text || "").slice(0, 900)}`)
      .join("\n");

    if (!recentTurns) return baseCtx;
    return `[CONVERSATION_CONTEXT]\n${baseCtx ? `${baseCtx}\n\n` : ""}Recent Conversation:\n${recentTurns}\n\nInstruction: Answer the student's latest question directly. It may be a follow-up related to the selected/drawn item above OR a brand-new academic question.`;
  };

  const findMatchingNotes = (text) => {
    if (!text || !Array.isArray(allNotes) || allNotes.length === 0) return;
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (words.length === 0) {
      setMatchingNotes(allNotes.slice(0, 5));
      return;
    }
    const scored = allNotes.map((n) => {
      let score = 0;
      const title = (n.title || "").toLowerCase();
      const subj = (n.subject || "").toLowerCase();
      const desc = (n.description || "").toLowerCase();
      const ocr = (n.ocrText || "").toLowerCase();

      words.forEach((w) => {
        if (title.includes(w)) score += 5;
        if (subj.includes(w)) score += 4;
        if (desc.includes(w)) score += 2;
        if (ocr.includes(w)) score += 3;
      });
      return { note: n, score };
    });

    const filtered = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((s) => s.note);

    setMatchingNotes(filtered.length > 0 ? filtered : allNotes.slice(0, 4));
  };

  // Fast background handwriting extraction from any DataURL image (full or pencil-cropped)
  const autoExtractFromImageSource = async (imgDataUrl, strokesForCrop = []) => {
    if (!imgDataUrl) return "";
    setIsAutoExtracting(true);
    try {
      const extracted = await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = async () => {
          try {
            const rect = imageContainerRef.current?.getBoundingClientRect();
            const hasValidRect = rect && rect.width > 10 && rect.height > 10;
            const cropBounds =
              hasValidRect && strokesForCrop.length > 0
                ? computeFreehandBounds(strokesForCrop, rect.width, rect.height)
                : null;

            const scaleX = hasValidRect ? img.naturalWidth / rect.width : 1;
            const scaleY = hasValidRect ? img.naturalHeight / rect.height : 1;
            const cropW = cropBounds ? Math.max(1, Math.round(cropBounds.width * scaleX)) : img.naturalWidth;
            const cropH = cropBounds ? Math.max(1, Math.round(cropBounds.height * scaleY)) : img.naturalHeight;

            const cropCanvas = document.createElement("canvas");
            cropCanvas.width = cropW;
            cropCanvas.height = cropH;
            const ctx = cropCanvas.getContext("2d");
            if (!ctx) return resolve("");

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, cropW, cropH);
            ctx.drawImage(
              img,
              cropBounds ? Math.round(cropBounds.x * scaleX) : 0,
              cropBounds ? Math.round(cropBounds.y * scaleY) : 0,
              cropW,
              cropH,
              0,
              0,
              cropW,
              cropH
            );

            const ocrRes = await extractTextFromCroppedCanvas(cropCanvas);
            resolve((ocrRes?.text || "").trim());
          } catch (_) {
            resolve("");
          }
        };
        img.onerror = () => resolve("");
        img.src = imgDataUrl;
      });

      if (extracted) {
        setLiveExtractedText(extracted);
        findMatchingNotes(extracted);
      }
      return extracted;
    } finally {
      setIsAutoExtracting(false);
    }
  };

  const runSolveTurn = async ({
    promptText,
    displayUserText = null,
    imageToSolve = null,
    isInitial = false,
  }) => {
    const cleanPrompt = (promptText || "").trim();
    if (!cleanPrompt && !imageToSolve) return;
    if (isSolvingRef.current) return;
    isSolvingRef.current = true;

    // Immediately hide top studio so the answer has 100% full vertical height to display!
    setShowTopInputPanel(false);

    const userBubble = {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: "user",
      text: displayUserText || cleanPrompt || "✏️ Analyze handwritten / drawn structure",
      image: imageToSolve || null,
    };

    const priorMsgs = isInitial ? [] : messages;
    const nextMessages = [...priorMsgs, userBubble];
    setMessages(nextMessages);
    setIsSolving(true);
    setActiveTab("ai");
    setSolveStatus(
      imageToSolve
        ? "⚡ Reading handwriting & solving with LPU Vision AI..."
        : "Formulating step-by-step academic answer..."
    );

    try {
      const convContext = isInitial ? (circleData?.context || "") : buildConversationContext(priorMsgs);
      const parsedImage = imageToSolve ? extractMimeAndBase64(imageToSolve, "image/jpeg") : null;

      const res = await solveCircleQuery({
        query: cleanPrompt,
        imageBase64: parsedImage?.base64 || null,
        imageMimeType: parsedImage?.mimeType || "image/jpeg",
        context: convContext,
        noteId: circleData?.noteId || "",
        subject: circleData?.subject || "",
        skipCache: !isInitial,
        onProgress: (status) => setSolveStatus(status),
      });

      const aiBubble = {
        id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: "assistant",
        text: res.answer,
        cached: res.cached,
        cacheTier: res.cacheTier,
        provider: res.provider,
        latencyMs: res.latencyMs,
      };
      setMessages((prev) => [...prev, aiBubble]);

      // Surface Vision AI's handwritten transcription into the Quick Copy ribbon automatically!
      const parsedHeader = imageToSolve ? parseVisionExtractedHeader(res.answer) : "";
      if (parsedHeader) {
        setLiveExtractedText((prev) => prev || parsedHeader);
        findMatchingNotes(parsedHeader);
      } else if (cleanPrompt && !isGenericPlaceholderText(cleanPrompt)) {
        findMatchingNotes(cleanPrompt);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "assistant",
          text: `⚠️ Could not generate response: ${err.message}. Please try rephrasing your question.`,
          provider: "error",
        },
      ]);
    } finally {
      setIsSolving(false);
      isSolvingRef.current = false;
      setSolveStatus("");
    }
  };

  // Sync when circleData changes (from Read PDF Pencil OR Home Screen Pencil)
  useEffect(() => {
    if (!isOpen) {
      lastProcessedCircleFingerprintRef.current = null;
      return;
    }
    warmupClientOcr();

    if (circleData) {
      const rawIncomingText = (circleData.text || "").trim();
      const hasRealText = !circleData.isPureSketch && !isGenericPlaceholderText(rawIncomingText);
      const incomingImg = circleData.croppedImage || null;
      const circleFingerprint = `${rawIncomingText}__${incomingImg ? incomingImg.slice(0, 120) : ""}__${circleData.noteId || ""}`;

      if (lastProcessedCircleFingerprintRef.current === circleFingerprint) {
        return;
      }
      lastProcessedCircleFingerprintRef.current = circleFingerprint;

      setQueryText(hasRealText ? rawIncomingText : "");
      setLiveExtractedText(hasRealText ? rawIncomingText : "");
      setUploadedImageSrc(incomingImg);
      setImageStrokes([]);
      setPadStrokes([]);
      setMessages([]);
      setShowTopInputPanel(false);
      setActiveInputMode(incomingImg ? "image" : "text");

      if (rawIncomingText || incomingImg) {
        const displayLabel = circleData.isPureSketch
          ? "✏️ Drawn Structure / Handwritten Formula"
          : hasRealText
            ? (rawIncomingText.length > 95 ? `${rawIncomingText.slice(0, 95).trim()}...` : rawIncomingText)
            : "📝 Handwritten / Visual Selection";
        const effectivePrompt = hasRealText
          ? rawIncomingText
          : "Transcribe any handwritten text, math equations, or symbols accurately and solve/explain step-by-step.";

        runSolveTurn({
          promptText: effectivePrompt,
          displayUserText: displayLabel,
          imageToSolve: incomingImg,
          isInitial: true,
        });

        if (hasRealText) {
          findMatchingNotes(rawIncomingText);
        } else if (incomingImg && !circleData.isPureSketch) {
          // Run fast parallel handwriting extraction so Copy Text ribbon populates in ~0.45s!
          autoExtractFromImageSource(incomingImg, []);
        }
      }
    } else {
      lastProcessedCircleFingerprintRef.current = null;
      setQueryText("");
      setLiveExtractedText("");
      setMessages([]);
      setUploadedImageSrc(null);
      setImageStrokes([]);
      setPadStrokes([]);
      setShowTopInputPanel(true);
      setActiveInputMode("pencil");
    }
  }, [circleData, isOpen]);

  // Global Ctrl+V image paste support (with instant JPEG compression + auto handwriting OCR)
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
              const compressed = await compressUploadedImageDataUrl(event.target.result, 1560);
              setUploadedImageSrc(compressed);
              setActiveInputMode("image");
              setShowTopInputPanel(true);
              setImageStrokes([]);
              setLiveExtractedText("");
              autoExtractFromImageSource(compressed, []);
            };
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isOpen]);

  const handleSendFollowUp = (customQuestion = null) => {
    const q = (typeof customQuestion === "string" ? customQuestion : followUpInput).trim();
    if (!q || isSolving) return;
    setShowTopInputPanel(false);
    setFollowUpInput("");
    runSolveTurn({
      promptText: q,
      displayUserText: q,
      imageToSolve: null,
      isInitial: false,
    });
  };

  const handleCopyMessage = (id, text) => {
    if (!text) return;
    copyTextSafariSafe(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  // Freehand Pencil Drawing on Uploaded Photo
  const handleImgPointerDown = (e) => {
    if (!imageContainerRef.current) return;
    e.preventDefault();
    if (imgOcrDebounceRef.current) clearTimeout(imgOcrDebounceRef.current);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    const rect = imageContainerRef.current.getBoundingClientRect();
    const pt = {
      x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, e.clientY - rect.top)),
    };
    isDrawingImgRef.current = true;
    setCurrentImageStroke([pt]);
  };

  const handleImgPointerMove = (e) => {
    if (!isDrawingImgRef.current || !currentImageStroke || !imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const pt = {
      x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, e.clientY - rect.top)),
    };
    setCurrentImageStroke((prev) => [...(prev || []), pt]);
  };

  const handleImgPointerUp = (e) => {
    if (!isDrawingImgRef.current) return;
    isDrawingImgRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    if (currentImageStroke && currentImageStroke.length > 0) {
      const nextStrokes = [...imageStrokes, currentImageStroke];
      setImageStrokes(nextStrokes);
      if (imgOcrDebounceRef.current) clearTimeout(imgOcrDebounceRef.current);
      imgOcrDebounceRef.current = setTimeout(() => {
        if (uploadedImageSrc) {
          autoExtractFromImageSource(uploadedImageSrc, nextStrokes);
        }
      }, 420);
    }
    setCurrentImageStroke(null);
  };

  // Freehand Pencil Drawing on Blank Pencil Pad
  const handlePadPointerDown = (e) => {
    if (!padContainerRef.current) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    const rect = padContainerRef.current.getBoundingClientRect();
    const pt = {
      x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, e.clientY - rect.top)),
    };
    isDrawingPadRef.current = true;
    setCurrentPadStroke([pt]);
  };

  const handlePadPointerMove = (e) => {
    if (!isDrawingPadRef.current || !currentPadStroke || !padContainerRef.current) return;
    const rect = padContainerRef.current.getBoundingClientRect();
    const pt = {
      x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, e.clientY - rect.top)),
    };
    setCurrentPadStroke((prev) => [...(prev || []), pt]);
  };

  const handlePadPointerUp = (e) => {
    if (!isDrawingPadRef.current) return;
    isDrawingPadRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    if (currentPadStroke && currentPadStroke.length > 0) {
      setPadStrokes((prev) => [...prev, currentPadStroke]);
    }
    setCurrentPadStroke(null);
  };

  const handleCopyPadHandwriting = async () => {
    if (padStrokes.length === 0 || isPadOcrCopying) return;
    setIsPadOcrCopying(true);
    try {
      const copied = await copyTextSafariSafe(async () => {
        const rendered = renderFreehandStrokesToCanvas(padStrokes, {
          background: "#ffffff",
          strokeColor: "#0f172a",
          lineWidth: 2.8,
        });
        if (!rendered?.canvas) return "";
        const ocrRes = await extractTextFromCroppedCanvas(rendered.canvas);
        const txt = (ocrRes?.text || "").trim();
        if (txt) {
          setLiveExtractedText(txt);
          setQueryText(txt);
        }
        return txt;
      });
      if (copied) {
        setCopiedPadOcr(true);
        setTimeout(() => setCopiedPadOcr(false), 2200);
      }
    } catch (_) {
    } finally {
      setIsPadOcrCopying(false);
    }
  };

  const handleSolvePencilPad = () => {
    if (padStrokes.length === 0) return;
    const rendered = renderFreehandStrokesToCanvas(padStrokes, {
      background: "#ffffff",
      strokeColor: "#0f172a",
      lineWidth: 2.8,
    });
    if (!rendered?.dataUrl) return;
    const customPrompt =
      queryText.trim() ||
      "Transcribe any handwritten formula/text accurately, then identify, explain, and solve this drawn structure, diagram, or equation step-by-step.";
    setShowTopInputPanel(false);
    runSolveTurn({
      promptText: customPrompt,
      displayUserText: queryText.trim() ? `✏️ ${queryText.trim()}` : "✏️ Drawn Pencil Formula / Structure",
      imageToSolve: rendered.dataUrl,
      isInitial: messages.length === 0,
    });
  };

  const handleCopyCroppedText = async () => {
    if (!uploadedImageSrc) return;
    if (liveExtractedText && !isAutoExtracting) {
      await copyTextSafariSafe(liveExtractedText);
      setCopiedOcr(true);
      setTimeout(() => setCopiedOcr(false), 2200);
      return;
    }
    setIsOcrCopying(true);
    try {
      const copied = await copyTextSafariSafe(async () => {
        const extracted = await autoExtractFromImageSource(uploadedImageSrc, imageStrokes);
        return (extracted || liveExtractedText || queryText || "Diagram / Formula").trim();
      });
      if (copied) {
        setCopiedOcr(true);
        setTimeout(() => setCopiedOcr(false), 2200);
      }
    } catch (e) {
      console.warn("OCR copy error:", e);
    } finally {
      setIsOcrCopying(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const compressed = await compressUploadedImageDataUrl(event.target.result, 1560);
      setUploadedImageSrc(compressed);
      setActiveInputMode("image");
      setShowTopInputPanel(true);
      setImageStrokes([]);
      setLiveExtractedText("");
      autoExtractFromImageSource(compressed, []);
    };
    reader.readAsDataURL(file);
  };

  const handleSolveImageRegion = () => {
    if (!uploadedImageSrc) return;
    const rect = imageContainerRef.current?.getBoundingClientRect();
    const cropBounds = rect ? computeFreehandBounds(imageStrokes, rect.width, rect.height) : null;
    setShowTopInputPanel(false);

    if (!cropBounds) {
      const displayLabel = queryText.trim()
        ? queryText.trim()
        : liveExtractedText
          ? `📸 ${liveExtractedText.slice(0, 95).trim()}${liveExtractedText.length > 95 ? "..." : ""}`
          : "📸 Handwritten Notes / Image Analysis";
      const effectivePrompt =
        queryText.trim() ||
        (liveExtractedText
          ? `Handwritten text detected: "${liveExtractedText}". Verify against the image and solve/explain step-by-step.`
          : "Transcribe any handwritten text/formulas accurately and solve/explain this image step-by-step.");
      runSolveTurn({
        promptText: effectivePrompt,
        displayUserText: displayLabel,
        imageToSolve: uploadedImageSrc,
        isInitial: messages.length === 0,
      });
      return;
    }

    const savedRect = rect;
    const img = new Image();
    img.onload = () => {
      const r = savedRect;
      const scaleX = img.naturalWidth / ((r && r.width) || 1);
      const scaleY = img.naturalHeight / ((r && r.height) || 1);

      const cropCanvas = document.createElement("canvas");
      const cropW = Math.max(1, Math.round(cropBounds.width * scaleX));
      const cropH = Math.max(1, Math.round(cropBounds.height * scaleY));
      cropCanvas.width = cropW;
      cropCanvas.height = cropH;

      const ctx = cropCanvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, cropW, cropH);
        ctx.drawImage(
          img,
          Math.round(cropBounds.x * scaleX),
          Math.round(cropBounds.y * scaleY),
          cropW,
          cropH,
          0,
          0,
          cropW,
          cropH
        );
        const prepared = prepareCanvasForVision(cropCanvas, 1360);
        const croppedDataUrl = prepared?.dataUrl || cropCanvas.toDataURL("image/jpeg", 0.88);
        const displayLabel = queryText.trim()
          ? queryText.trim()
          : liveExtractedText
            ? `✏️ ${liveExtractedText.slice(0, 95).trim()}${liveExtractedText.length > 95 ? "..." : ""}`
            : "✏️ Pencil-Selected Handwritten Region";
        runSolveTurn({
          promptText:
            queryText.trim() ||
            (liveExtractedText
              ? `Handwritten selection: "${liveExtractedText}". Verify against the cropped image and solve step-by-step.`
              : "Transcribe any handwritten text/equation in this pencil-selected region and solve step-by-step."),
          displayUserText: displayLabel,
          imageToSolve: croppedDataUrl,
          isInitial: messages.length === 0,
        });
      }
    };
    img.onerror = () => {
      runSolveTurn({
        promptText: queryText.trim() || "Analyze and solve this image step-by-step",
        displayUserText: queryText.trim() || "📸 Handwritten Notes",
        imageToSolve: uploadedImageSrc,
        isInitial: messages.length === 0,
      });
    };
    img.src = uploadedImageSrc;
  };

  if (!isOpen) return null;

  const activeImgStrokes = currentImageStroke ? [...imageStrokes, currentImageStroke] : imageStrokes;
  const activePadStrokes = currentPadStroke ? [...padStrokes, currentPadStroke] : padStrokes;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(0, 0, 0, 0.78)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
      onClick={onClose}
    >
      <div
        className="dark-modal-surface"
        style={{
          width: "100%",
          maxWidth: "800px",
          height: "min(92vh, 880px)",
          maxHeight: "calc(100dvh - 16px)",
          minHeight: "min(480px, calc(100dvh - 16px))",
          background: "linear-gradient(180deg, #0f172a 0%, #090d16 100%)",
          border: "1.5px solid rgba(56, 189, 248, 0.42)",
          borderRadius: "22px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.92), 0 0 40px rgba(56, 189, 248, 0.22)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          color: "#fff",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            flexShrink: 0,
            background: "linear-gradient(135deg, rgba(2, 132, 199, 0.18), rgba(99, 102, 241, 0.18))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, rgba(2, 132, 199, 0.35), rgba(99, 102, 241, 0.35))",
                border: "1.5px solid rgba(56, 189, 248, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <GeminiIcon size={20} withRing />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: "1.02rem", color: "#f8fafc", letterSpacing: "-0.2px" }}>
                Pencil &amp; Circle Search AI
              </div>
              <div style={{ fontSize: "0.72rem", color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                Draw Any Structure with Pencil, Select Screen Content &amp; Ask Follow-Up Questions
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            {onRedrawWithPencil && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRedrawWithPencil();
                }}
                style={{
                  background: "linear-gradient(135deg, #0284c7, #6366f1)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  color: "#fff",
                  borderRadius: "999px",
                  padding: "6px 12px",
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
                title="Activate Freehand Pencil directly on the screen / PDF"
              >
                <Pencil size={13} />
                <span>✏️ Screen Pencil</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowTopInputPanel((v) => !v)}
              style={{
                background: showTopInputPanel ? "rgba(56, 189, 248, 0.22)" : "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(56, 189, 248, 0.35)",
                color: "#7dd3fc",
                borderRadius: "999px",
                padding: "6px 11px",
                fontSize: "0.73rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
              title="Toggle Pencil Sketch Pad / Image Upload"
            >
              <Pencil size={12} />
              <span>{showTopInputPanel ? "Hide Pad" : "Pencil Pad / Photo"}</span>
            </button>

            <button
              onClick={onClose}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Close (ESC)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Circled / Extracted Handwritten Text Quick Ribbon */}
        {(liveExtractedText || (circleData?.text && !circleData?.isPureSketch && !isGenericPlaceholderText(circleData.text))) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "7px 16px",
              background: "rgba(56, 189, 248, 0.08)",
              borderBottom: "1px solid rgba(56, 189, 248, 0.2)",
              gap: "8px",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}>
              <GeminiIcon size={15} withRing />
              <div style={{ fontSize: "0.76rem", color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <strong style={{ color: "#38bdf8" }}>Extracted: </strong>
                {liveExtractedText || circleData?.text}
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => {
                  const textVal = liveExtractedText || circleData?.text || "";
                  if (!textVal) return;
                  copyTextSafariSafe(textVal);
                  setCopiedQuery(true);
                  setTimeout(() => setCopiedQuery(false), 2000);
                }}
                style={{
                  background: copiedQuery ? "rgba(16, 185, 129, 0.25)" : "rgba(255, 255, 255, 0.1)",
                  border: copiedQuery ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.2)",
                  color: copiedQuery ? "#34d399" : "#f1f5f9",
                  borderRadius: "14px",
                  padding: "3px 10px",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                {copiedQuery ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                <span>{copiedQuery ? "Copied!" : "📋 Copy Text"}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("notes")}
                style={{
                  background: activeTab === "notes" ? "rgba(99, 102, 241, 0.25)" : "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  color: "#a5b4fc",
                  borderRadius: "14px",
                  padding: "3px 10px",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Search size={12} />
                <span>Notes ({matchingNotes.length})</span>
              </button>
            </div>
          </div>
        )}

        {/* Collapsible Top Input Studio: Pencil Pad | Photo + Pencil | Type Question */}
        {showTopInputPanel && (
          <div
            style={{
              padding: "10px 18px",
              background: "rgba(15, 23, 42, 0.72)",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setActiveInputMode("pencil")}
                style={{
                  padding: "5px 12px",
                  borderRadius: "8px",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: activeInputMode === "pencil" ? "rgba(56, 189, 248, 0.22)" : "rgba(255, 255, 255, 0.05)",
                  color: activeInputMode === "pencil" ? "#38bdf8" : "#94a3b8",
                  border: activeInputMode === "pencil" ? "1px solid rgba(56, 189, 248, 0.45)" : "1px solid transparent",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <Pencil size={13} />
                <span>✏️ Draw Any Structure (Pencil)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveInputMode("image");
                  if (!uploadedImageSrc && fileInputRef.current) {
                    fileInputRef.current.click();
                  }
                }}
                style={{
                  padding: "5px 12px",
                  borderRadius: "8px",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: activeInputMode === "image" ? "rgba(99, 102, 241, 0.22)" : "rgba(255, 255, 255, 0.05)",
                  color: activeInputMode === "image" ? "#a5b4fc" : "#94a3b8",
                  border: activeInputMode === "image" ? "1px solid rgba(99, 102, 241, 0.45)" : "1px solid transparent",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <Upload size={13} />
                <span>📸 Photo + Pencil</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveInputMode("text")}
                style={{
                  padding: "5px 12px",
                  borderRadius: "8px",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: activeInputMode === "text" ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.05)",
                  color: activeInputMode === "text" ? "#34d399" : "#94a3b8",
                  border: activeInputMode === "text" ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid transparent",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <span>✍️ Type Formula / Question</span>
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleImageUpload}
            />

            {activeInputMode === "pencil" && (
              <div>
                <div
                  ref={padContainerRef}
                  onPointerDown={handlePadPointerDown}
                  onPointerMove={handlePadPointerMove}
                  onPointerUp={handlePadPointerUp}
                  onPointerCancel={handlePadPointerUp}
                  style={{
                    position: "relative",
                    height: "175px",
                    borderRadius: "12px",
                    border: "1.5px solid rgba(56, 189, 248, 0.4)",
                    background: "#020617",
                    cursor: PENCIL_CURSOR_STYLE,
                    touchAction: "none",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    WebkitTouchCallout: "none",
                    overflow: "hidden",
                  }}
                >
                  {activePadStrokes.length === 0 && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none",
                        color: "#64748b",
                        fontSize: "0.8rem",
                      }}
                    >
                      <Pencil size={24} color="#38bdf8" style={{ marginBottom: "6px", opacity: 0.75 }} />
                      <span>Draw any structure, graph, circuit, shape, or math equation with your pencil</span>
                    </div>
                  )}
                  <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                    {activePadStrokes.map((st, idx) => {
                      const d = strokePointsToSvgPath(st);
                      return d ? (
                        <path
                          key={idx}
                          d={d}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : null;
                    })}
                  </svg>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", gap: "8px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => setPadStrokes((p) => p.slice(0, -1))}
                      disabled={padStrokes.length === 0}
                      style={{
                        background: "rgba(255,255,255,0.07)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        color: "#cbd5e1",
                        borderRadius: "8px",
                        padding: "5px 10px",
                        fontSize: "0.74rem",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Undo2 size={12} />
                      <span>Undo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPadStrokes([])}
                      disabled={padStrokes.length === 0}
                      style={{
                        background: "rgba(244, 63, 94, 0.15)",
                        border: "1px solid rgba(244, 63, 94, 0.35)",
                        color: "#fda4af",
                        borderRadius: "8px",
                        padding: "5px 10px",
                        fontSize: "0.74rem",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Trash2 size={12} />
                      <span>Clear</span>
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={handleCopyPadHandwriting}
                      disabled={isPadOcrCopying || padStrokes.length === 0}
                      style={{
                        background: copiedPadOcr ? "rgba(16, 185, 129, 0.25)" : "rgba(255, 255, 255, 0.08)",
                        border: copiedPadOcr ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.18)",
                        color: copiedPadOcr ? "#34d399" : "#e2e8f0",
                        borderRadius: "8px",
                        padding: "6px 12px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: padStrokes.length === 0 ? "not-allowed" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                      title="Extract handwritten text / formula from your pencil sketch"
                    >
                      {copiedPadOcr ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                      <span>
                        {copiedPadOcr ? "Copied!" : isPadOcrCopying ? "⚡ Reading..." : "📋 Extract & Copy Text"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSolvePencilPad}
                      disabled={isSolving || padStrokes.length === 0}
                      className="btn-primary"
                      style={{
                        padding: "6px 16px",
                        borderRadius: "8px",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <Sparkles size={14} />
                      <span>{isSolving ? "Analyzing..." : "✨ Get Result of Drawing"}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeInputMode === "image" && (
              <div>
                {!uploadedImageSrc ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: "2px dashed rgba(99, 102, 241, 0.4)",
                      borderRadius: "12px",
                      padding: "20px 14px",
                      textAlign: "center",
                      cursor: "pointer",
                      background: "rgba(99, 102, 241, 0.05)",
                    }}
                  >
                    <Upload size={24} color="#818cf8" style={{ margin: "0 auto 6px" }} />
                    <div style={{ fontSize: "0.84rem", fontWeight: 700, color: "#fff" }}>
                      Click to Upload or Paste (Ctrl+V) Handwritten Notes / Diagram Photo
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontSize: "0.74rem", color: "#38bdf8", fontWeight: 600 }}>
                        ✏️ Draw any shape/line with pencil over the handwritten part you want extracted/solved:
                      </span>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {imageStrokes.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setImageStrokes([]);
                              if (uploadedImageSrc) autoExtractFromImageSource(uploadedImageSrc, []);
                            }}
                            style={{ background: "none", border: "none", color: "#cbd5e1", fontSize: "0.72rem", cursor: "pointer" }}
                          >
                            Clear Marks
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setUploadedImageSrc(null);
                            setImageStrokes([]);
                            setLiveExtractedText("");
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#f87171",
                            fontSize: "0.72rem",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                          }}
                        >
                          <RotateCcw size={11} />
                          <span>Change Image</span>
                        </button>
                      </div>
                    </div>

                    <div
                      ref={imageContainerRef}
                      onPointerDown={handleImgPointerDown}
                      onPointerMove={handleImgPointerMove}
                      onPointerUp={handleImgPointerUp}
                      onPointerCancel={handleImgPointerUp}
                      style={{
                        position: "relative",
                        maxHeight: "155px",
                        overflow: "hidden",
                        borderRadius: "10px",
                        border: "1.5px solid rgba(56, 189, 248, 0.35)",
                        background: "#020617",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: PENCIL_CURSOR_STYLE,
                        userSelect: "none",
                        WebkitUserSelect: "none",
                        WebkitTouchCallout: "none",
                        touchAction: "none",
                      }}
                    >
                      <img
                        src={uploadedImageSrc}
                        alt="Uploaded Crop"
                        style={{
                          maxWidth: "100%",
                          maxHeight: "155px",
                          objectFit: "contain",
                          pointerEvents: "none",
                        }}
                      />
                      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                        {activeImgStrokes.map((st, idx) => {
                          const d = strokePointsToSvgPath(st);
                          return d ? (
                            <path
                              key={idx}
                              d={d}
                              fill="none"
                              stroke="#38bdf8"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          ) : null;
                        })}
                      </svg>
                    </div>

                    {/* Live Auto-Extracted Handwritten Text Bar */}
                    {(isAutoExtracting || liveExtractedText) && (
                      <div
                        style={{
                          marginTop: "7px",
                          padding: "6px 10px",
                          borderRadius: "8px",
                          background: "rgba(56, 189, 248, 0.08)",
                          border: "1px solid rgba(56, 189, 248, 0.25)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "8px",
                          fontSize: "0.75rem",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <strong style={{ color: "#38bdf8" }}>
                            {isAutoExtracting ? "⚡ Reading handwriting: " : "📝 Handwritten Text: "}
                          </strong>
                          <span>{liveExtractedText || "Extracting via AI Vision..."}</span>
                        </div>
                        {liveExtractedText && (
                          <button
                            type="button"
                            onClick={() => {
                              setQueryText(liveExtractedText);
                              setActiveInputMode("text");
                            }}
                            style={{
                              background: "rgba(99, 102, 241, 0.2)",
                              border: "1px solid rgba(99, 102, 241, 0.4)",
                              color: "#c7d2fe",
                              borderRadius: "6px",
                              padding: "2px 8px",
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              flexShrink: 0,
                            }}
                          >
                            ✍️ Edit Text
                          </button>
                        )}
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
                      <button
                        type="button"
                        onClick={handleCopyCroppedText}
                        disabled={isOcrCopying}
                        style={{
                          background: copiedOcr ? "rgba(16, 185, 129, 0.25)" : "rgba(255, 255, 255, 0.08)",
                          border: copiedOcr ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.18)",
                          color: copiedOcr ? "#34d399" : "#e2e8f0",
                          borderRadius: "8px",
                          padding: "6px 12px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                        }}
                      >
                        {copiedOcr ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                        <span>
                          {copiedOcr
                            ? "Copied!"
                            : isOcrCopying || isAutoExtracting
                              ? "⚡ Reading..."
                              : "📋 Copy Text"}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSolveImageRegion}
                        disabled={isSolving}
                        className="btn-primary"
                        style={{
                          padding: "6px 16px",
                          borderRadius: "8px",
                          fontSize: "0.76rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <GeminiIcon size={14} />
                        <span>{isSolving ? "Analyzing..." : "✨ Get Result"}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeInputMode === "text" && (
              <div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    placeholder="Type or paste any question or formula..."
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && queryText.trim()) {
                        e.preventDefault();
                        setShowTopInputPanel(false);
                        runSolveTurn({
                          promptText: queryText,
                          displayUserText: queryText,
                          isInitial: messages.length === 0,
                        });
                      }
                    }}
                    style={{
                      flex: 1,
                      background: "rgba(0, 0, 0, 0.4)",
                      border: "1px solid rgba(56, 189, 248, 0.35)",
                      color: "#fff",
                      borderRadius: "10px",
                      padding: "9px 13px",
                      fontSize: "0.84rem",
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!queryText.trim()) return;
                      setShowTopInputPanel(false);
                      runSolveTurn({
                        promptText: queryText,
                        displayUserText: queryText,
                        isInitial: messages.length === 0,
                      });
                    }}
                    disabled={isSolving || !queryText.trim()}
                    className="btn-primary"
                    style={{
                      padding: "0 16px",
                      borderRadius: "10px",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Sparkles size={14} />
                    <span>Solve</span>
                  </button>
                </div>

                {messages.length === 0 && (
                  <div style={{ display: "flex", gap: "6px", overflowX: "auto", padding: "7px 0 2px" }}>
                    {SUGGESTED_QUERIES.map((q, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setQueryText(q);
                          setShowTopInputPanel(false);
                          runSolveTurn({ promptText: q, displayUserText: q, isInitial: true });
                        }}
                        style={{
                          background: "rgba(255, 255, 255, 0.04)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          borderRadius: "14px",
                          padding: "3px 10px",
                          fontSize: "0.71rem",
                          color: "#94a3b8",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab Switcher: AI Conversation & Result vs Related Notes */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(10, 15, 30, 0.5)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setActiveTab("ai")}
            style={{
              flex: 1,
              padding: "9px",
              background: activeTab === "ai" ? "rgba(56, 189, 248, 0.12)" : "transparent",
              border: "none",
              borderBottom: activeTab === "ai" ? "2px solid #38bdf8" : "2px solid transparent",
              color: activeTab === "ai" ? "#38bdf8" : "#94a3b8",
              fontWeight: 700,
              fontSize: "0.82rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <MessageSquare size={14} />
            <span>AI Result &amp; Follow-Up Chat ({messages.filter((m) => m.role === "assistant").length})</span>
          </button>
          <button
            onClick={() => setActiveTab("notes")}
            style={{
              flex: 1,
              padding: "9px",
              background: activeTab === "notes" ? "rgba(99, 102, 241, 0.12)" : "transparent",
              border: "none",
              borderBottom: activeTab === "notes" ? "2px solid #818cf8" : "2px solid transparent",
              color: activeTab === "notes" ? "#818cf8" : "#94a3b8",
              fontWeight: 700,
              fontSize: "0.82rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <BookOpen size={14} />
            <span>Matching Notes ({matchingNotes.length})</span>
          </button>
        </div>

        {/* Main Scrollable Thread / Notes Body */}
        <div ref={chatScrollContainerRef} style={{ flex: "1 1 auto", minHeight: "180px", overflowY: "auto", padding: "16px 18px", WebkitOverflowScrolling: "touch" }}>
          {activeTab === "ai" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {messages.length === 0 && !isSolving && (
                <div style={{ textAlign: "center", padding: "28px 16px", color: "#94a3b8" }}>
                  <div style={{ marginBottom: "10px" }}>
                    <GeminiIcon size={36} withRing />
                  </div>
                  <div style={{ fontWeight: 700, color: "#e2e8f0", marginBottom: "4px" }}>
                    Draw any structure above with the Pencil, or ask any question below!
                  </div>
                  <div style={{ fontSize: "0.76rem", color: "#64748b" }}>
                    You can ask follow-up questions related to your selection or any other topic anytime.
                  </div>
                </div>
              )}

              {messages.map((msg, idx) =>
                msg.role === "user" ? (
                  <div key={msg.id} style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div
                      style={{
                        maxWidth: "85%",
                        maxHeight: "140px",
                        overflowY: "auto",
                        background: "linear-gradient(135deg, rgba(2, 132, 199, 0.28), rgba(99, 102, 241, 0.28))",
                        border: "1px solid rgba(56, 189, 248, 0.38)",
                        borderRadius: "16px 16px 4px 16px",
                        padding: "10px 14px",
                        color: "#f8fafc",
                        fontSize: "0.84rem",
                      }}
                    >
                      {msg.image && (
                        <div style={{ marginBottom: "6px" }}>
                          <img
                            src={msg.image}
                            alt="Selected structure"
                            style={{
                              maxWidth: "140px",
                              maxHeight: "65px",
                              objectFit: "contain",
                              borderRadius: "6px",
                              display: "block",
                              border: "1px solid rgba(255,255,255,0.22)",
                              background: "#020617",
                            }}
                          />
                        </div>
                      )}
                      <div>{msg.text}</div>
                    </div>
                  </div>
                ) : (
                  <div
                    key={msg.id}
                    ref={idx === messages.length - 1 ? latestAiMessageRef : null}
                    style={{
                      background: "rgba(0, 0, 0, 0.34)",
                      border: "1px solid rgba(255, 255, 255, 0.09)",
                      borderRadius: "16px 16px 16px 4px",
                      padding: "14px 16px",
                      fontSize: "0.87rem",
                      lineHeight: "1.65",
                      color: "#f1f5f9",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "8px",
                        flexWrap: "wrap",
                        gap: "6px",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          fontSize: "0.69rem",
                          padding: "2px 9px",
                          borderRadius: "999px",
                          background: msg.cached ? "rgba(16, 185, 129, 0.15)" : "rgba(56, 189, 248, 0.15)",
                          color: msg.cached ? "#34d399" : "#38bdf8",
                          fontWeight: 700,
                        }}
                      >
                        <Zap size={11} />
                        {msg.cached
                          ? `⚡ ${msg.cacheTier || "Turso Cache"} (0ms)`
                          : `✨ AI Tutor (${msg.provider || "Gemini"}${msg.latencyMs ? ` • ${msg.latencyMs}ms` : ""})`}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.text)}
                        style={{
                          background: "rgba(255, 255, 255, 0.07)",
                          border: "1px solid rgba(255, 255, 255, 0.14)",
                          borderRadius: "7px",
                          padding: "3px 9px",
                          color: copiedMsgId === msg.id ? "#34d399" : "#cbd5e1",
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        {copiedMsgId === msg.id ? <Check size={11} /> : <Copy size={11} />}
                        <span>{copiedMsgId === msg.id ? "Copied" : "Copy"}</span>
                      </button>
                    </div>

                    <MathMarkdown content={msg.text} />
                  </div>
                )
              )}

              {isSolving && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "12px 14px",
                    background: "rgba(56, 189, 248, 0.08)",
                    border: "1px solid rgba(56, 189, 248, 0.22)",
                    borderRadius: "14px",
                    fontSize: "0.8rem",
                    color: "#bae6fd",
                  }}
                >
                  <div
                    style={{
                      width: "18px",
                      height: "18px",
                      border: "2.5px solid rgba(56, 189, 248, 0.25)",
                      borderTop: "2.5px solid #38bdf8",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                      flexShrink: 0,
                    }}
                  />
                  <span>{solveStatus || "Generating step-by-step answer..."}</span>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          ) : (
            <div>
              <div style={{ fontSize: "0.82rem", color: "#94a3b8", marginBottom: "12px" }}>
                Related lecture notes covering this topic across your library:
              </div>

              {matchingNotes.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {matchingNotes.map((note) => (
                    <div
                      key={note.id || note._id}
                      style={{
                        padding: "12px 14px",
                        background: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        if (onOpenNote) onOpenNote(note);
                        onClose();
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1, paddingRight: "12px" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#fff", marginBottom: "2px" }}>
                          {note.title || "Academic Notes"}
                        </div>
                        <div style={{ fontSize: "0.74rem", color: "#94a3b8", display: "flex", gap: "8px" }}>
                          <span>📚 {note.subject || "Subject"}</span>
                          {note.branch && <span>• 🏛️ {note.branch}</span>}
                        </div>
                      </div>
                      <ExternalLink size={16} color="#38bdf8" />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                  No exact matching notes found in the vault.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pinned Follow-Up & Any-Question Conversation Box (Works in BOTH Read PDF & Home Circle Search!) */}
        <div
          style={{
            padding: "10px 16px 12px",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            background: "rgba(10, 15, 30, 0.92)",
            flexShrink: 0,
          }}
        >
          {messages.length > 0 && (
            <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "8px", scrollbarWidth: "none" }}>
              {FOLLOW_UP_CHIPS.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={isSolving}
                  onClick={() => handleSendFollowUp(chip)}
                  style={{
                    background: "rgba(56, 189, 248, 0.1)",
                    border: "1px solid rgba(56, 189, 248, 0.28)",
                    color: "#bae6fd",
                    borderRadius: "999px",
                    padding: "4px 10px",
                    fontSize: "0.71rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {chip}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMessages([])}
                style={{
                  background: "rgba(244, 63, 94, 0.12)",
                  border: "1px solid rgba(244, 63, 94, 0.3)",
                  color: "#fda4af",
                  borderRadius: "999px",
                  padding: "4px 10px",
                  fontSize: "0.71rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                🗑️ Clear Chat
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Ask anything related to this result OR ask any other question..."
              value={followUpInput}
              onChange={(e) => setFollowUpInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendFollowUp();
                }
              }}
              style={{
                flex: 1,
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(56, 189, 248, 0.4)",
                color: "#fff",
                borderRadius: "12px",
                padding: "10px 14px",
                fontSize: "0.84rem",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => handleSendFollowUp()}
              disabled={isSolving || !followUpInput.trim()}
              style={{
                background: "linear-gradient(135deg, #0284c7, #6366f1)",
                border: "none",
                color: "#fff",
                borderRadius: "12px",
                padding: "10px 16px",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                opacity: isSolving || !followUpInput.trim() ? 0.55 : 1,
              }}
            >
              <Send size={14} />
              <span>Ask</span>
            </button>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
