import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { GripVertical } from "lucide-react";

/**
 * 🛸 Movable 3D Floating Action Widget
 * - Mobile: Ultra-sleek, compact 44px round 3D icon orb (icon-only, no clutter)
 * - Desktop: Sleek 3D tactile pill with grip handle and label
 * - 100% Draggable (Touch on Mobile + Mouse on Desktop)
 * - Anti-overflow Viewport Clamping (Guaranteed NEVER cuts off on right/left/top/bottom)
 * - Dock Clearance: Strictly prevents bottom widgets from hiding behind mobile dock
 * - Intelligent Drag vs Tap threshold (moved > 4px = drag, else click)
 * - Continuous 3D floating animation & physics when idle
 * - Position saved to localStorage per widget ID with safe boundary sanitization
 * - Safe z-index (1055 default, 1070 while dragging) floating above mobile dock
 */
export default function Movable3DFloatingWidget({
  id,
  defaultPos,
  onClick,
  title,
  icon,
  label,
  bgGradient,
  glowColor = "rgba(37, 99, 235, 0.45)",
  borderGradient = "rgba(255, 255, 255, 0.35)",
  badge = null,
  animIndex = 1,
  className = "",
  style = {},
}) {
  const [pos, setPos] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const widgetRef = useRef(null);
  const dragInfoRef = useRef({
    startX: 0,
    startY: 0,
    elemStartX: 0,
    elemStartY: 0,
    hasMoved: false,
  });
  const cleanupListenersRef = useRef(null);
  const lastTouchTimeRef = useRef(0);

  const defRight = defaultPos?.right;
  const defLeft = defaultPos?.left;
  const defBottom = defaultPos?.bottom;
  const defTop = defaultPos?.top;

  const STORAGE_KEY = `fsm_widget_pos_v2_${id}`;

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      if (cleanupListenersRef.current) {
        cleanupListenersRef.current();
        cleanupListenersRef.current = null;
      }
    };
  }, []);

  // 1. Initialize position with accurate content width estimation and safe edge bounds
  useEffect(() => {
    if (typeof window === "undefined") return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const isMobile = w < 640;

    // Mobile: 44px round icon button | Desktop: pill with icon + grip + label
    const estimatedW = isMobile
      ? 44
      : label
      ? Math.max(130, label.length * 9.5 + 58)
      : 54;
    const estimatedH = 44;

    const minX = 12;
    const maxX = Math.max(10, w - estimatedW - 14);
    const minY = 12;
    // On mobile, strictly keep clear of the bottom navigation dock (~76px)
    const maxY = isMobile
      ? Math.max(10, h - estimatedH - 76)
      : Math.max(10, h - estimatedH - 14);

    // Retrieve saved position
    let saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      const oldSaved = localStorage.getItem(`fsm_widget_pos_${id}`);
      if (oldSaved) {
        try {
          const parsed = JSON.parse(oldSaved);
          if (typeof parsed.x === "number" && typeof parsed.y === "number") {
            saved = oldSaved;
          }
        } catch (_) {}
      }
    }

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          setPos({
            x: Math.max(minX, Math.min(maxX, parsed.x)),
            y: Math.max(minY, Math.min(maxY, parsed.y)),
          });
          return;
        }
      } catch (_) {}
    }

    // Default coordinates calculation
    let initX = 14;
    let initY = h - estimatedH - 24;

    if (defRight != null) {
      initX = w - (defRight + estimatedW);
    } else if (defLeft != null) {
      initX = defLeft;
    }

    // On mobile screens, elevate bottom default position so it clears the mobile bottom dock (~76px)
    const mobileBottomOffset = isMobile ? 64 : 0;
    if (defBottom != null) {
      const effectiveBottom = defBottom + mobileBottomOffset;
      initY = h - (effectiveBottom + estimatedH);
    } else if (defTop != null) {
      initY = defTop;
    }

    setPos({
      x: Math.max(minX, Math.min(maxX, initX)),
      y: Math.max(minY, Math.min(maxY, initY)),
    });
  }, [id, defRight, defLeft, defBottom, defTop, label]);

  // 2. Exact DOM post-mount clamp: dynamically measures rendered DOM width/height
  useLayoutEffect(() => {
    if (!widgetRef.current) return;
    const rect = widgetRef.current.getBoundingClientRect();
    const actualWidth = rect.width;
    const actualHeight = rect.height;
    const isMobile = window.innerWidth < 640;

    setPos((prev) => {
      if (!prev) return prev;
      const maxX = Math.max(10, window.innerWidth - actualWidth - 14);
      const maxY = isMobile
        ? Math.max(10, window.innerHeight - actualHeight - 76)
        : Math.max(10, window.innerHeight - actualHeight - 14);

      const clampedX = Math.max(12, Math.min(maxX, prev.x));
      const clampedY = Math.max(12, Math.min(maxY, prev.y));

      if (clampedX !== prev.x || clampedY !== prev.y) {
        return { x: clampedX, y: clampedY };
      }
      return prev;
    });
  }, [label]);

  // 3. Keep within viewport on resize or orientation change
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => {
        if (!prev) return prev;
        const rect = widgetRef.current?.getBoundingClientRect();
        const isMobile = window.innerWidth < 640;
        const currentW = rect?.width || (isMobile ? 44 : 135);
        const currentH = rect?.height || 44;
        const maxX = Math.max(10, window.innerWidth - currentW - 14);
        const maxY = isMobile
          ? Math.max(10, window.innerHeight - currentH - 76)
          : Math.max(10, window.innerHeight - currentH - 14);
        return {
          x: Math.max(12, Math.min(maxX, prev.x)),
          y: Math.max(12, Math.min(maxY, prev.y)),
        };
      });
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  // 4. Mouse Drag Handler (Desktop)
  const handleMouseDown = (e) => {
    // Avoid simulated mouse event right after touch
    if (Date.now() - lastTouchTimeRef.current < 600) return;
    if (e.button !== 0) return; // Only left-click
    e.stopPropagation();

    if (cleanupListenersRef.current) {
      cleanupListenersRef.current();
    }

    const info = dragInfoRef.current;
    info.startX = e.clientX;
    info.startY = e.clientY;
    info.elemStartX = pos ? pos.x : 0;
    info.elemStartY = pos ? pos.y : 0;
    info.hasMoved = false;

    const handleMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - info.startX;
      const dy = moveEvent.clientY - info.startY;

      if (!info.hasMoved && Math.hypot(dx, dy) > 4) {
        info.hasMoved = true;
        setIsDragging(true);
      }

      if (info.hasMoved) {
        moveEvent.preventDefault();
        const isMobile = window.innerWidth < 640;
        const rect = widgetRef.current?.getBoundingClientRect() || (isMobile ? { width: 44, height: 44 } : { width: 135, height: 44 });
        const maxX = Math.max(10, window.innerWidth - rect.width - 14);
        const maxY = isMobile
          ? Math.max(10, window.innerHeight - rect.height - 76)
          : Math.max(10, window.innerHeight - rect.height - 14);

        const newX = Math.max(12, Math.min(maxX, info.elemStartX + dx));
        const newY = Math.max(12, Math.min(maxY, info.elemStartY + dy));

        setPos({ x: newX, y: newY });
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      cleanupListenersRef.current = null;

      if (info.hasMoved) {
        setPos((currentPos) => {
          if (currentPos) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentPos));
          }
          return currentPos;
        });
        setTimeout(() => {
          setIsDragging(false);
          info.hasMoved = false;
        }, 120);
      } else {
        setIsDragging(false);
      }
    };

    cleanupListenersRef.current = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // 5. Touch Drag Handler (Phone & Tablet)
  const handleTouchStart = (e) => {
    if (!e.touches || !e.touches[0]) return;
    lastTouchTimeRef.current = Date.now();
    e.stopPropagation();

    if (cleanupListenersRef.current) {
      cleanupListenersRef.current();
    }

    const touch = e.touches[0];
    const info = dragInfoRef.current;
    info.startX = touch.clientX;
    info.startY = touch.clientY;
    info.elemStartX = pos ? pos.x : 0;
    info.elemStartY = pos ? pos.y : 0;
    info.hasMoved = false;

    const handleTouchMove = (moveEvent) => {
      if (!moveEvent.touches || !moveEvent.touches[0]) return;
      if (moveEvent.cancelable) {
        moveEvent.preventDefault(); // Stop screen scrolling while dragging widget!
      }

      const t = moveEvent.touches[0];
      const dx = t.clientX - info.startX;
      const dy = t.clientY - info.startY;

      if (!info.hasMoved && Math.hypot(dx, dy) > 4) {
        info.hasMoved = true;
        setIsDragging(true);
      }

      if (info.hasMoved) {
        const isMobile = window.innerWidth < 640;
        const rect = widgetRef.current?.getBoundingClientRect() || { width: 44, height: 44 };
        const maxX = Math.max(10, window.innerWidth - rect.width - 14);
        const maxY = isMobile
          ? Math.max(10, window.innerHeight - rect.height - 76)
          : Math.max(10, window.innerHeight - rect.height - 14);

        const newX = Math.max(12, Math.min(maxX, info.elemStartX + dx));
        const newY = Math.max(12, Math.min(maxY, info.elemStartY + dy));

        setPos({ x: newX, y: newY });
      }
    };

    const handleTouchEnd = () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
      cleanupListenersRef.current = null;

      if (info.hasMoved) {
        setPos((currentPos) => {
          if (currentPos) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentPos));
          }
          return currentPos;
        });
        setTimeout(() => {
          setIsDragging(false);
          info.hasMoved = false;
        }, 120);
      } else {
        setIsDragging(false);
      }
    };

    cleanupListenersRef.current = () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };

    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchEnd);
  };

  const handleClick = (e) => {
    if (dragInfoRef.current.hasMoved) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (onClick) onClick(e);
  };

  if (!pos) return null;

  return (
    <div
      ref={widgetRef}
      className={`movable-3d-widget movable-3d-anim-${animIndex} ${isDragging ? "is-dragging" : ""} ${className}`}
      style={{
        position: "fixed",
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        zIndex: isDragging ? 1070 : 1055,
        touchAction: "none",
        cursor: isDragging ? "grabbing" : "grab",
        ...style,
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onClick={handleClick}
      title={`${title} (Drag anywhere on screen)`}
    >
      <div
        className="movable-3d-inner"
        style={{
          background: bgGradient,
          boxShadow: isDragging
            ? `0 18px 36px -4px ${glowColor}, 0 8px 18px rgba(0, 0, 0, 0.28), inset 0 1.5px 1.5px rgba(255, 255, 255, 0.75)`
            : `0 10px 28px -4px ${glowColor}, inset 0 1.5px 1.5px rgba(255, 255, 255, 0.6), inset 0 -2px 5px rgba(0, 0, 0, 0.25)`,
          border: `1.5px solid ${borderGradient}`,
        }}
      >
        <span className="movable-3d-grip" title="Drag to move widget">
          <GripVertical size={13} style={{ opacity: 0.8, flexShrink: 0 }} />
        </span>
        <div className="movable-3d-icon-wrap">
          {icon}
          {badge}
        </div>
        {label && <span className="movable-3d-label">{label}</span>}
      </div>
    </div>
  );
}
