import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import MermaidDiagram from "./MermaidDiagram";
import { useTechFlags } from "../utils/techFlagsStore";

/**
 * 🧮 Render LaTeX math safely using KaTeX
 */
function renderMathSafely(mathText, isBlock = false) {
  try {
    const clean = String(mathText || "").trim();
    if (!clean) return "";
    return katex.renderToString(clean, {
      displayMode: isBlock,
      throwOnError: false,
      output: "htmlAndMathml",
    });
  } catch (err) {
    return `<code class="math-fallback">${escapeHtml(mathText)}</code>`;
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Detects whether a string is a bare LaTeX equation without explicit delimiters
 */
function isBareLatex(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  // Skip markdown headings, bullets, callout badges, blockquotes
  if (/^([#\-*•>]|\d+\.|\*\*📌|\*\*⚡|\*\*💡|\*\*🎯|\*\*⚠️)/.test(trimmed)) return false;

  const hasLatexCommands = /\\(frac|sqrt|boxed|mathcal|mathbf|mathrm|text|int|sum|prod|lim|alpha|beta|theta|lambda|sigma|omega|partial|nabla|infty|pm|times|cdot|le|ge|neq|approx|equiv|rightarrow|leftarrow|Rightarrow|Leftarrow|cap|cup|in|subset|forall|exists|Re|Im|sin|cos|tan|log|ln|exp|det|vec|hat|bar|dot|ddot|quad|qquad)\b/.test(trimmed);
  const hasMathSyntax = /[a-zA-Z0-9]\^\{|\_\{|\\frac\{|\\boxed\{|\\mathcal\{/.test(trimmed);
  const startsWithEq = /^[A-Za-z0-9\(\)\'\"]+\s*=\s*\\/.test(trimmed) || /^=\s*\\/.test(trimmed);

  return hasLatexCommands || hasMathSyntax || startsWithEq;
}

/**
 * Format inline markdown (bold, italic, code, links) while protecting KaTeX HTML
 */
function formatInlineMarkdown(text) {
  if (!text) return "";

  const mathPlaceholders = [];

  // Extract inline math \( ... \)
  let safeText = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, eq) => {
    const clean = eq.trim();
    if (!clean) return "";
    const idx = mathPlaceholders.length;
    mathPlaceholders.push(`<span class="katex-inline-wrapper" style="display: inline-block; vertical-align: middle; margin: 0 2px; padding: 1px 4px; background: rgba(99, 102, 241, 0.12); border-radius: 4px;">${renderMathSafely(clean, false)}</span>`);
    return `%%%MATH_HOLDER_${idx}%%%`;
  });

  // Extract inline math $ ... $ (ignoring currency numbers like $50 or $100)
  safeText = safeText.replace(/(^|[^\\])\$([^\$\n]+?)\$/g, (match, prefix, eq) => {
    if (/^\s*\d/.test(eq)) return match;
    const clean = eq.trim();
    if (!clean) return prefix;
    const idx = mathPlaceholders.length;
    mathPlaceholders.push(`<span class="katex-inline-wrapper" style="display: inline-block; vertical-align: middle; margin: 0 2px; padding: 1px 4px; background: rgba(99, 102, 241, 0.12); border-radius: 4px;">${renderMathSafely(clean, false)}</span>`);
    return `${prefix}%%%MATH_HOLDER_${idx}%%%`;
  });

  // Sanitize HTML to prevent Stored & Reflected XSS injection
  safeText = escapeHtml(safeText);

  // Bold: **text** or __text__
  safeText = safeText.replace(/\*\*(.+?)\*\*/g, '<strong style="color: #ffffff; font-weight: 750; letter-spacing: -0.1px;">$1</strong>');
  safeText = safeText.replace(/__(.+?)__/g, '<strong style="color: #ffffff; font-weight: 750; letter-spacing: -0.1px;">$1</strong>');

  // Inline code: `code`
  safeText = safeText.replace(/`([^`]+)`/g, '<code style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 6px; padding: 2px 7px; font-size: 0.84em; font-family: \'JetBrains Mono\', Consolas, monospace; color: #38bdf8; box-shadow: 0 0 10px rgba(56, 189, 248, 0.12);">$1</code>');

  // Italic: *text*
  safeText = safeText.replace(/(^|[^\*])\*([^\*\n]+?)\*([^\*]|$)/g, '$1<em style="color: #cbd5e1;">$2</em>$3');

  // Restore math placeholders with rendered KaTeX HTML
  safeText = safeText.replace(/%%%MATH_HOLDER_(\d+)%%%/g, (_, idx) => {
    return mathPlaceholders[parseInt(idx, 10)] || "";
  });

  return safeText;
}

/**
 * Splits raw markdown into alternating text and ```mermaid code segments.
 */
export function splitMarkdownAndMermaid(rawContent = "") {
  if (!rawContent) return [];
  const source = String(rawContent);
  const regex = /```mermaid\s*\n([\s\S]*?)```/gi;
  const segments = [];
  let lastIdx = 0;
  let match;

  while ((match = regex.exec(source)) !== null) {
    if (match.index > lastIdx) {
      const textChunk = source.slice(lastIdx, match.index).trim();
      if (textChunk) segments.push({ type: "markdown", content: textChunk });
    }
    const diagramCode = (match[1] || "").trim();
    if (diagramCode) {
      segments.push({ type: "mermaid", content: diagramCode });
    }
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < source.length) {
    const tail = source.slice(lastIdx).trim();
    if (tail) segments.push({ type: "markdown", content: tail });
  }

  return segments;
}

function renderMarkdownBlockToHtml(content = "") {
  if (!content) return "";

  const blockPlaceholders = [];

  // Step 1: Pre-extract multi-line Block Math $$...$$ BEFORE line splitting
  let preprocessed = String(content).replace(/\$\$([\s\S]*?)\$\$/g, (_, eq) => {
    const clean = eq.trim();
    if (!clean) return "";
    const idx = blockPlaceholders.length;
    blockPlaceholders.push(renderMathSafely(clean, true));
    return `\n\n%%%MATH_BLOCK_${idx}%%%\n\n`;
  });

  // Step 2: Pre-extract multi-line Block Math \[ ... \] BEFORE line splitting
  preprocessed = preprocessed.replace(/\\\[([\s\S]*?)\\\]/g, (_, eq) => {
    const clean = eq.trim();
    if (!clean) return "";
    const idx = blockPlaceholders.length;
    blockPlaceholders.push(renderMathSafely(clean, true));
    return `\n\n%%%MATH_BLOCK_${idx}%%%\n\n`;
  });

  // Step 3: Pre-extract LaTeX standard environments: \begin{equation|align|gather}...
  preprocessed = preprocessed.replace(/\\begin\{(equation|align|gather|multline|bmatrix|pmatrix|matrix|cases)\*?\}[\s\S]*?\\end\{\1\*?\}/g, (fullMatch) => {
    const clean = fullMatch.trim();
    if (!clean) return "";
    const idx = blockPlaceholders.length;
    blockPlaceholders.push(renderMathSafely(clean, true));
    return `\n\n%%%MATH_BLOCK_${idx}%%%\n\n`;
  });

  // Step 4: Discard orphan delimiters on isolated lines
  preprocessed = preprocessed.replace(/^\s*\\\]\s*$/gm, "");
  preprocessed = preprocessed.replace(/^\s*\\\[\s*$/gm, "");

  const lines = preprocessed.split("\n");
  const blocks = [];
  let inList = false;
  let listItems = [];
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBlockLines = [];
  let bareLatexGroup = [];

  const flushList = () => {
    if (inList && listItems.length > 0) {
      blocks.push(
        `<ul style="margin: 10px 0 16px 0; padding-left: 22px; display: flex; flex-direction: column; gap: 8px; list-style-type: disc;">${listItems.join("")}</ul>`
      );
      listItems = [];
      inList = false;
    }
  };

  const flushCodeBlock = () => {
    if (inCodeBlock && codeBlockLines.length > 0) {
      const rawCode = codeBlockLines.join("\n");
      blocks.push(
        `<div style="margin: 14px 0; border-radius: 12px; background: rgba(10, 15, 29, 0.95); border: 1px solid rgba(99, 102, 241, 0.28); overflow: hidden; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);"><div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 14px; background: rgba(99, 102, 241, 0.12); border-bottom: 1px solid rgba(99, 102, 241, 0.2); font-size: 0.72rem; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: 0.5px;"><span>💻 ${escapeHtml(codeBlockLang || "Code")}</span><span style="font-size: 0.68rem; color: #64748b;">Academic Snippet</span></div><pre style="margin: 0; padding: 12px 16px; overflow-x: auto; font-family: 'JetBrains Mono', Consolas, monospace; font-size: 0.82rem; line-height: 1.6; color: #38bdf8;"><code>${escapeHtml(rawCode)}</code></pre></div>`
      );
      codeBlockLines = [];
      inCodeBlock = false;
      codeBlockLang = "";
    }
  };

  const flushBareLatex = () => {
    if (bareLatexGroup.length > 0) {
      const combinedMath = bareLatexGroup.length > 1
        ? `\\begin{aligned} ${bareLatexGroup.join(" \\\\ ")} \\end{aligned}`
        : bareLatexGroup[0];
      const rendered = renderMathSafely(combinedMath, true);
      blocks.push(
        `<div class="katex-block-wrapper" style="margin: 14px 0; overflow-x: auto; padding: 12px 18px; background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.88)); border-radius: 12px; border: 1px solid rgba(139, 92, 246, 0.35); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45); backdrop-filter: blur(12px);">${rendered}</div>`
      );
      bareLatexGroup = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Check code blocks ```
    if (trimmed.startsWith("```")) {
      flushList();
      flushBareLatex();
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        inCodeBlock = true;
        codeBlockLang = trimmed.replace(/^```/, "").trim();
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    if (!trimmed) {
      flushList();
      flushBareLatex();
      continue;
    }

    // Check pre-extracted block math placeholders
    if (trimmed.startsWith("%%%MATH_BLOCK_")) {
      flushList();
      flushBareLatex();
      const match = trimmed.match(/%%%MATH_BLOCK_(\d+)%%%/);
      if (match) {
        const idx = parseInt(match[1], 10);
        const mathHtml = blockPlaceholders[idx] || "";
        if (mathHtml) {
          blocks.push(
            `<div class="katex-block-wrapper" style="margin: 14px 0; overflow-x: auto; padding: 12px 18px; background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.88)); border-radius: 12px; border: 1px solid rgba(139, 92, 246, 0.35); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45); backdrop-filter: blur(12px);">${mathHtml}</div>`
          );
        }
      }
      continue;
    }

    // Check bare LaTeX equations without delimiters
    if (isBareLatex(trimmed)) {
      flushList();
      bareLatexGroup.push(trimmed);
      continue;
    }

    flushBareLatex();

    // 1. Creative Gradient Headers: ###, ##, #
    if (/^#{1,6}\s+/.test(trimmed)) {
      flushList();
      const level = (trimmed.match(/^#+/) || ["#"])[0].length;
      const text = trimmed.replace(/^#+\s*/, "");
      
      let headerStyle = "";
      if (level === 1) {
        headerStyle = "margin: 20px 0 10px 0; font-size: 1.25rem; font-weight: 800; background: linear-gradient(135deg, #38bdf8 0%, #a78bfa 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -0.3px; display: flex; align-items: center; gap: 8px;";
      } else if (level === 2) {
        headerStyle = "margin: 18px 0 8px 0; font-size: 1.08rem; font-weight: 750; background: linear-gradient(135deg, #a78bfa 0%, #34d399 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; display: flex; align-items: center; gap: 7px;";
      } else {
        headerStyle = "margin: 14px 0 6px 0; font-size: 0.96rem; font-weight: 700; color: #f1f5f9; border-left: 3px solid #38bdf8; padding-left: 8px; display: flex; align-items: center; gap: 6px;";
      }

      blocks.push(
        `<h${level} style="${headerStyle}">${formatInlineMarkdown(text)}</h${level}>`
      );
      continue;
    }

    // 2. Standalone Themed Academic Callout Cards (⚡ Formulas, 💡 Insights, 🎯 Solutions, ⚠️ Pitfalls)
    if (/^\*\*(📌|⚡|💡|🔥|📊|📖|🎯|🧠|⚠️|🔬)?\s*.*?\*\*$/.test(trimmed)) {
      flushList();
      const innerText = trimmed.replace(/^\*\*/, "").replace(/\*\*$/, "").trim();
      let borderAccent = "rgba(56, 189, 248, 0.4)";
      let bgAccent = "linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(14, 165, 233, 0.04))";
      let textAccent = "#38bdf8";
      let iconBadge = "📌";

      if (innerText.includes("⚡") || innerText.toLowerCase().includes("formula") || innerText.toLowerCase().includes("theorem")) {
        borderAccent = "rgba(245, 158, 11, 0.45)";
        bgAccent = "linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(217, 119, 6, 0.04))";
        textAccent = "#fbbf24";
        iconBadge = "⚡";
      } else if (innerText.includes("💡") || innerText.toLowerCase().includes("takeaway") || innerText.toLowerCase().includes("concept")) {
        borderAccent = "rgba(52, 211, 153, 0.45)";
        bgAccent = "linear-gradient(135deg, rgba(52, 211, 153, 0.12), rgba(16, 185, 129, 0.04))";
        textAccent = "#34d399";
        iconBadge = "💡";
      } else if (innerText.includes("🎯") || innerText.toLowerCase().includes("exam") || innerText.toLowerCase().includes("solution")) {
        borderAccent = "rgba(139, 92, 246, 0.45)";
        bgAccent = "linear-gradient(135deg, rgba(139, 92, 246, 0.14), rgba(99, 102, 241, 0.05))";
        textAccent = "#c084fc";
        iconBadge = "🎯";
      } else if (innerText.includes("⚠️") || innerText.toLowerCase().includes("warning") || innerText.toLowerCase().includes("mistake")) {
        borderAccent = "rgba(244, 63, 94, 0.45)";
        bgAccent = "linear-gradient(135deg, rgba(244, 63, 94, 0.12), rgba(225, 29, 72, 0.04))";
        textAccent = "#fda4af";
        iconBadge = "⚠️";
      }

      blocks.push(
        `<div style="margin: 18px 0 12px 0; padding: 9px 16px; background: ${bgAccent}; border: 1px solid ${borderAccent}; border-left: 4px solid ${textAccent}; border-radius: 10px; font-weight: 800; font-size: 0.94rem; color: ${textAccent}; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 18px rgba(0, 0, 0, 0.3);"><span style="font-size: 1.1rem;">${iconBadge}</span><span>${formatInlineMarkdown(innerText)}</span></div>`
      );
      continue;
    }

    // 3. Bullet points: - item, * item, • item
    if (/^[-*•]\s+/.test(trimmed)) {
      inList = true;
      const text = trimmed.replace(/^[-*•]\s+/, "");
      listItems.push(
        `<li style="line-height: 1.7; color: #f1f5f9; font-size: 0.88rem; margin-bottom: 4px;">${formatInlineMarkdown(text)}</li>`
      );
      continue;
    }

    // 4. Numbered list: 1. item
    if (/^\d+\.\s+/.test(trimmed)) {
      inList = true;
      const text = trimmed.replace(/^\d+\.\s+/, "");
      listItems.push(
        `<li style="line-height: 1.7; color: #f1f5f9; font-size: 0.88rem; margin-bottom: 4px;">${formatInlineMarkdown(text)}</li>`
      );
      continue;
    }

    // 5. Blockquote: > text
    if (/^>\s+/.test(trimmed)) {
      flushList();
      const text = trimmed.replace(/^>\s+/, "");
      blocks.push(
        `<blockquote style="margin: 12px 0; padding: 10px 16px; border-left: 3.5px solid #8b5cf6; background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(139, 92, 246, 0.05)); border-radius: 0 10px 10px 0; color: #e2e8f0; font-style: italic; box-shadow: 0 2px 10px rgba(0,0,0,0.2);">${formatInlineMarkdown(text)}</blockquote>`
      );
      continue;
    }

    // 6. Normal paragraph
    flushList();
    blocks.push(
      `<p style="margin: 9px 0; line-height: 1.7; color: #f1f5f9; font-size: 0.88rem;">${formatInlineMarkdown(trimmed)}</p>`
    );
  }

  flushList();
  flushBareLatex();
  flushCodeBlock();
  return blocks.join("");
}

/**
 * ⚡ MathMarkdown: Renders rich markdown + KaTeX math + Mermaid diagrams
 */
export default function MathMarkdown({ content = "", className = "", style = {} }) {
  const { enableAiMermaid } = useTechFlags();

  const renderedSegments = useMemo(() => {
    const rawParts = splitMarkdownAndMermaid(content);
    return rawParts.map((part) => {
      if (part.type === "mermaid") {
        if (!enableAiMermaid) {
          return {
            type: "html",
            html: `<pre style="margin:10px 0;padding:10px;border-radius:8px;background:rgba(15,23,42,0.7);color:#94a3b8;font-size:0.75rem;overflow-x:auto;">${escapeHtml(part.content)}</pre>`,
          };
        }
        return { type: "mermaid", code: part.content };
      }
      return { type: "html", html: renderMarkdownBlockToHtml(part.content) };
    });
  }, [content, enableAiMermaid]);

  return (
    <div
      className={`math-markdown-container ${className}`}
      style={{
        lineHeight: 1.65,
        wordBreak: "break-word",
        ...style,
      }}
    >
      {renderedSegments.map((seg, idx) =>
        seg.type === "mermaid" ? (
          <MermaidDiagram key={`mmd-${idx}`} code={seg.code} />
        ) : (
          <div key={`md-${idx}`} dangerouslySetInnerHTML={{ __html: seg.html }} />
        )
      )}
    </div>
  );
}
