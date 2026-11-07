import React from "react";

/**
 * ✨ GeminiIcon: Official Google Gemini 4-Pointed Sparkle & Astroid Star
 * Features the signature multi-tone cyan-indigo-purple gradient.
 * If withRing=true, renders a sleek Circle-to-Search outer ring.
 */
export default function GeminiIcon({ size = 16, style = {}, className = "", withRing = false }) {
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
        <linearGradient id={gradId} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="45%" stopColor="#818cf8" />
          <stop offset="85%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
      </defs>

      {withRing ? (
        <>
          {/* Circular Search Accent Ring */}
          <circle
            cx="12"
            cy="12"
            r="10.5"
            stroke={`url(#${gradId})`}
            strokeWidth="1.6"
            strokeDasharray="3 2"
            opacity="0.85"
          />
          {/* Centered Gemini Star */}
          <path
            d="M 12 5.5 Q 12 12 5.5 12 Q 12 12 12 18.5 Q 12 12 18.5 12 Q 12 12 12 5.5 Z"
            fill={`url(#${gradId})`}
          />
        </>
      ) : (
        <>
          {/* Primary 4-pointed Gemini Astroid Star */}
          <path
            d="M 12 2 Q 12 12 2 12 Q 12 12 12 22 Q 12 12 22 12 Q 12 12 12 2 Z"
            fill={`url(#${gradId})`}
          />
          {/* Secondary Companion Accent Sparkle */}
          <path
            d="M 19 2 Q 19 5.2 16 5.2 Q 19 5.2 19 8.4 Q 19 5.2 22 5.2 Q 19 5.2 19 2 Z"
            fill={`url(#${gradId})`}
            opacity="0.9"
          />
        </>
      )}
    </svg>
  );
}

