import React, { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * 🧮 Render LaTeX math safely using KaTeX
 */
function renderMathSafely(mathText, isBlock = false) {
  try {
    return katex.renderToString(mathText.trim(), {
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
 * Replace LaTeX markers \( ... \), \[ ... \], $$ ... $$, and $ ... $ with KaTeX HTML
 */
function processLatex(text) {
  if (!text) return "";

  // 1. Block math: $$ ... $$ or \[ ... \]
  let out = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, eq) => {
    return `<div class="katex-block-wrapper" style="margin: 10px 0; overflow-x: auto; padding: 6px 0;">${renderMathSafely(eq, true)}</div>`;
  });

  out = out.replace(/\\\[([\s\S]*?)\\\]/g, (_, eq) => {
    return `<div class="katex-block-wrapper" style="margin: 10px 0; overflow-x: auto; padding: 6px 0;">${renderMathSafely(eq, true)}</div>`;
  });

  // 2. Inline math: \( ... \)
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_, eq) => {
    return `<span class="katex-inline-wrapper" style="display: inline-block; vertical-align: middle; margin: 0 2px;">${renderMathSafely(eq, false)}</span>`;
  });

  // 3. Inline math: $ ... $ (ensuring not followed/preceded by currency numbers like $50)
  out = out.replace(/(^|[^\\])\$([^\$\n]+?)\$/g, (match, prefix, eq) => {
    // Avoid matching currency like "$100" or "$ 50"
    if (/^\s*\d/.test(eq)) return match;
    return `${prefix}<span class="katex-inline-wrapper" style="display: inline-block; vertical-align: middle; margin: 0 2px;">${renderMathSafely(eq, false)}</span>`;
  });

  return out;
}

/**
 * Format inline markdown (bold, italic, code, links) after math placeholders
 */
function formatInlineMarkdown(text) {
  if (!text) return "";

  // First process LaTeX so equations don't get messed up by markdown formatting
  let res = processLatex(text);

  // Bold: **text** or __text__
  res = res.replace(/\*\*(.+?)\*\*/g, '<strong style="color: #f8fafc; font-weight: 700;">$1</strong>');
  res = res.replace(/__(.+?)__/g, '<strong style="color: #f8fafc; font-weight: 700;">$1</strong>');

  // Inline code: `code`
  res = res.replace(/`([^`]+)`/g, '<code style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 4px; padding: 2px 6px; font-size: 0.85em; font-family: monospace; color: #38bdf8;">$1</code>');

  // Italic: *text* (when not preceded/followed by *)
  res = res.replace(/(^|[^\*])\*([^\*\n]+?)\*([^\*]|$)/g, '$1<em style="color: #cbd5e1;">$2</em>$3');

  return res;
}

/**
 * ⚡ MathMarkdown: Renders rich markdown + KaTeX mathematical formulas
 */
export default function MathMarkdown({ content = "", className = "", style = {} }) {
  const htmlContent = useMemo(() => {
    if (!content) return "";

    const lines = String(content).split("\n");
    const blocks = [];
    let inList = false;
    let listItems = [];

    const flushList = () => {
      if (inList && listItems.length > 0) {
        blocks.push(
          `<ul style="margin: 8px 0 14px 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; list-style-type: disc;">${listItems.join("")}</ul>`
        );
        listItems = [];
        inList = false;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      if (!trimmed) {
        flushList();
        continue;
      }

      // 1. Headers: ###, ##, #
      if (/^#{1,6}\s+/.test(trimmed)) {
        flushList();
        const level = (trimmed.match(/^#+/) || ["#"])[0].length;
        const text = trimmed.replace(/^#+\s*/, "");
        const fontSize = level === 1 ? "1.2rem" : level === 2 ? "1.05rem" : "0.95rem";
        const color = level === 1 ? "#38bdf8" : level === 2 ? "#a78bfa" : "#f1f5f9";
        blocks.push(
          `<h${level} style="margin: 16px 0 8px 0; font-size: ${fontSize}; font-weight: 700; color: ${color}; display: flex; align-items: center; gap: 6px;">${formatInlineMarkdown(text)}</h${level}>`
        );
        continue;
      }

      // 2. Standalone Section Header lines like "**⚡ Key Formulas & Theorems**"
      if (/^\*\*(📌|⚡|💡|🔥|📊|📖|🎯)?\s*.*?\*\*$/.test(trimmed)) {
        flushList();
        const innerText = trimmed.replace(/^\*\*/, "").replace(/\*\*$/, "").trim();
        let borderAccent = "rgba(56, 189, 248, 0.4)";
        let bgAccent = "rgba(56, 189, 248, 0.08)";
        let textAccent = "#38bdf8";

        if (innerText.includes("⚡") || innerText.toLowerCase().includes("formula")) {
          borderAccent = "rgba(245, 158, 11, 0.4)";
          bgAccent = "rgba(245, 158, 11, 0.08)";
          textAccent = "#fbbf24";
        } else if (innerText.includes("💡") || innerText.toLowerCase().includes("takeaway")) {
          borderAccent = "rgba(52, 211, 153, 0.4)";
          bgAccent = "rgba(52, 211, 153, 0.08)";
          textAccent = "#34d399";
        } else if (innerText.includes("📌") || innerText.toLowerCase().includes("summary")) {
          borderAccent = "rgba(139, 92, 246, 0.4)";
          bgAccent = "rgba(139, 92, 246, 0.08)";
          textAccent = "#c084fc";
        }

        blocks.push(
          `<div style="margin: 18px 0 10px 0; padding: 6px 14px; background: ${bgAccent}; border-left: 3px solid ${borderAccent}; border-radius: 6px; font-weight: 800; font-size: 0.95rem; color: ${textAccent}; display: flex; align-items: center; gap: 6px;">${formatInlineMarkdown(innerText)}</div>`
        );
        continue;
      }

      // 3. Bullet points: - item, * item, • item
      if (/^[-*•]\s+/.test(trimmed)) {
        inList = true;
        const text = trimmed.replace(/^[-*•]\s+/, "");
        listItems.push(
          `<li style="line-height: 1.65; color: #e2e8f0; font-size: 0.88rem;">${formatInlineMarkdown(text)}</li>`
        );
        continue;
      }

      // 4. Numbered list: 1. item
      if (/^\d+\.\s+/.test(trimmed)) {
        inList = true;
        const text = trimmed.replace(/^\d+\.\s+/, "");
        listItems.push(
          `<li style="line-height: 1.65; color: #e2e8f0; font-size: 0.88rem;">${formatInlineMarkdown(text)}</li>`
        );
        continue;
      }

      // 5. Blockquote: > text
      if (/^>\s+/.test(trimmed)) {
        flushList();
        const text = trimmed.replace(/^>\s+/, "");
        blocks.push(
          `<blockquote style="margin: 10px 0; padding: 8px 14px; border-left: 3px solid #6366f1; background: rgba(99, 102, 241, 0.08); border-radius: 0 8px 8px 0; color: #cbd5e1; font-style: italic;">${formatInlineMarkdown(text)}</blockquote>`
        );
        continue;
      }

      // 6. Normal paragraph
      flushList();
      blocks.push(
        `<p style="margin: 8px 0; line-height: 1.65; color: #e2e8f0; font-size: 0.88rem;">${formatInlineMarkdown(trimmed)}</p>`
      );
    }

    flushList();
    return blocks.join("");
  }, [content]);

  return (
    <div
      className={`math-markdown-container ${className}`}
      style={{
        lineHeight: 1.65,
        wordBreak: "break-word",
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
