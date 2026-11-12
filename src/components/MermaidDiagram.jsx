/**
 * 🧠 Lazy-Loaded Interactive Mermaid.js Diagram Renderer
 * Zero-cost client SVG rendering with strict XSS sanitization, zoom controls,
 * raw source toggle, and 1-click SVG/PNG export.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Code2, Copy, Check, Download, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

let mermaidApiPromise = null;

async function getMermaidInstance() {
  if (!mermaidApiPromise) {
    mermaidApiPromise = import("mermaid").then((mod) => {
      const m = mod.default || mod;
      m.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "dark",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        themeVariables: {
          primaryColor: "#1e293b",
          primaryTextColor: "#f8fafc",
          primaryBorderColor: "#38bdf8",
          lineColor: "#38bdf8",
          secondaryColor: "#312e81",
          tertiaryColor: "#0f172a",
          background: "#0f172a",
          mainBkg: "#1e293b",
          nodeBorder: "#38bdf8",
          clusterBkg: "rgba(30, 41, 59, 0.7)",
          clusterBorder: "rgba(56, 189, 248, 0.35)",
        },
      });
      return m;
    });
  }
  return mermaidApiPromise;
}

export function sanitizeMermaidCode(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .trim();
}

export default function MermaidDiagram({ code = "" }) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const cleanCode = sanitizeMermaidCode(code);
  const [svgMarkup, setSvgMarkup] = useState("");
  const [renderError, setRenderError] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function renderDiagram() {
      if (!cleanCode) return;
      setRenderError("");
      try {
        const mermaid = await getMermaidInstance();
        const uniqueRenderId = `fsm_mmd_${reactId}_${Date.now().toString(36)}`;
        const { svg } = await mermaid.render(uniqueRenderId, cleanCode);
        if (!cancelled) {
          setSvgMarkup(svg || "");
        }
      } catch (err) {
        if (!cancelled) {
          setRenderError(err?.message || "Invalid Mermaid syntax");
          setSvgMarkup("");
        }
      }
    }
    renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [cleanCode, reactId]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(cleanCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };

  const handleDownloadSvg = () => {
    if (!svgMarkup) return;
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diagram-${Date.now()}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!cleanCode) return null;

  return (
    <div
      style={{
        margin: "12px 0",
        borderRadius: "12px",
        border: "1px solid rgba(56, 189, 248, 0.28)",
        background: "linear-gradient(145deg, rgba(15, 23, 42, 0.92), rgba(30, 41, 59, 0.85))",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          padding: "7px 12px",
          background: "rgba(56, 189, 248, 0.08)",
          borderBottom: "1px solid rgba(56, 189, 248, 0.18)",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "0.74rem", fontWeight: 800, color: "#38bdf8", display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span>🧠 Interactive AI Concept Diagram</span>
        </span>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
          {svgMarkup && !showRaw && (
            <>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}
                title="Zoom Out"
                style={toolBtnStyle}
              >
                <ZoomOut size={12} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                title="Reset Zoom"
                style={toolBtnStyle}
              >
                <RotateCcw size={12} />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.0, +(z + 0.15).toFixed(2)))}
                title="Zoom In"
                style={toolBtnStyle}
              >
                <ZoomIn size={12} />
              </button>
              <button
                type="button"
                onClick={handleDownloadSvg}
                title="Download Vector SVG Diagram"
                style={toolBtnStyle}
              >
                <Download size={12} />
                <span>SVG</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowRaw((s) => !s)}
            title="Toggle Mermaid Source"
            style={toolBtnStyle}
          >
            <Code2 size={12} />
            <span>{showRaw ? "Visual" : "Code"}</span>
          </button>
          <button type="button" onClick={handleCopy} title="Copy Diagram Code" style={toolBtnStyle}>
            {copied ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {showRaw || renderError ? (
        <div style={{ padding: "12px" }}>
          {renderError && (
            <div style={{ fontSize: "0.72rem", color: "#fbbf24", marginBottom: "6px" }}>
              ⚠️ Showing diagram code ({renderError})
            </div>
          )}
          <pre
            style={{
              margin: 0,
              padding: "10px",
              borderRadius: "8px",
              background: "rgba(2, 6, 23, 0.75)",
              color: "#cbd5e1",
              fontSize: "0.75rem",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {cleanCode}
          </pre>
        </div>
      ) : !svgMarkup ? (
        <div style={{ padding: "18px", textAlign: "center", fontSize: "0.78rem", color: "#94a3b8" }}>
          Rendering flowchart diagram...
        </div>
      ) : (
        <div
          ref={containerRef}
          style={{
            padding: "14px",
            overflowX: "auto",
            display: "flex",
            justifyContent: "center",
            background: "rgba(2, 6, 23, 0.4)",
          }}
        >
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top center",
              transition: "transform 0.15s ease",
              maxWidth: "100%",
            }}
            dangerouslySetInnerHTML={{ __html: svgMarkup }}
          />
        </div>
      )}
    </div>
  );
}

const toolBtnStyle = {
  background: "rgba(15, 23, 42, 0.7)",
  border: "1px solid rgba(148, 163, 184, 0.25)",
  color: "#cbd5e1",
  borderRadius: "6px",
  padding: "3px 7px",
  fontSize: "0.7rem",
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "3px",
};
