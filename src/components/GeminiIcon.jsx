import React from "react";

/**
 * ✨ GeminiIcon: Official Google Gemini 4-Pointed Sparkle & Astroid Star
 * Features the signature Google multi-color gradient (Electric Cyan, Luminous Indigo, Magenta & Warm Gold)
 * with a radiant white center core for ultra-high contrast on any dark, blue, or vibrant background.
 * If withRing=true, renders a crisp, high-visibility Circle-to-Search viewfinder ring.
 */
export default function GeminiIcon({
  size = 16,
  style = {},
  className = "",
  withRing = false,
  color = null,
  ringColor = null,
}) {
  const gradId = React.useId
    ? `gemini_grad_${React.useId().replace(/[^a-zA-Z0-9]/g, "_")}`
    : `gemini_grad_${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        ...style,
      }}
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* Vibrant High-Contrast Google Gemini Multi-Tone Gradient */}
        <linearGradient id={gradId} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="22%" stopColor="#67e8f9" />
          <stop offset="50%" stopColor="#a78bfa" />
          <stop offset="78%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
      </defs>

      {withRing ? (
        <>
          {/* ⭕ Crisp High-Visibility Circle-to-Search Viewfinder Ring */}
          <circle
            cx="12"
            cy="12"
            r="10.2"
            stroke={ringColor || "#ffffff"}
            strokeWidth="2.2"
            strokeDasharray="2.8 2"
            opacity="1"
            style={{
              filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45))",
            }}
          />
          {/* Centered Large 4-Pointed Gemini Astroid Star (Crisp High-Visibility White Core) */}
          <path
            d="M 12 4.2 Q 12 12 4.2 12 Q 12 12 12 19.8 Q 12 12 19.8 12 Q 12 12 12 4.2 Z"
            fill={color || "#ffffff"}
            style={{
              filter: "drop-shadow(0 1px 2.5px rgba(0, 0, 0, 0.45))",
            }}
          />
          {/* 💎 Luminous White Diamond Center Core */}
          <circle cx="12" cy="12" r="1.8" fill="#ffffff" opacity="1" />
        </>
      ) : (
        <>
          {/* Primary 4-pointed Gemini Astroid Star */}
          <path
            d="M 12 2 Q 12 12 2 12 Q 12 12 12 22 Q 12 12 22 12 Q 12 12 12 2 Z"
            fill={color || `url(#${gradId})`}
            style={{
              filter: "drop-shadow(0 0 3px rgba(255, 255, 255, 0.7)) drop-shadow(0 0 6px rgba(56, 189, 248, 0.6))",
            }}
          />
          {/* 💎 Luminous White Diamond Center Core */}
          <circle cx="12" cy="12" r="2.2" fill="#ffffff" opacity="0.95" />
          {/* Secondary Companion Accent Sparkle */}
          <path
            d="M 19 2 Q 19 5.2 15.8 5.2 Q 19 5.2 19 8.4 Q 19 5.2 22.2 5.2 Q 19 5.2 19 2 Z"
            fill={color || `url(#${gradId})`}
            opacity="0.95"
          />
          <circle cx="19" cy="5.2" r="0.9" fill="#ffffff" opacity="0.95" />
        </>
      )}
    </svg>
  );
}
