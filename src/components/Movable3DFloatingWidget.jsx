import React, { useState, useEffect, useRef } from "react";

/**
 * 🛸 Movable 3D Floating Action Widget
 * - Clean, sleek 3D tactile pill with zero clutter (drag dots removed)
 * - Desktop: Unified, perfectly aligned width pills (exact vertical alignment)
 * - Mobile: Ultra-sleek, compact 44px round 3D icon orb
 * - 100% Draggable (Touch on Mobile + Mouse on Desktop)
 * - Native right/left anchoring guarantees zero side-space or awkward offsets
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
  const [hasUserMoved, setHasUserMoved] = useState(false);
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

  const STORAGE_KEY = `fsm_widget_pos_v4_${id}`;

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      if (cleanupListenersRef.current) {
        cleanupListenersRef.current();
        cleanupListenersRef.current = null;
      }
    };
  }, []);

  // 1. Initialize from localStorage if explicitly moved by user in v4
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          const w = window.innerWidth;
          const h = window.innerHeight;
          const isMobile = w < 640;
          const minX = 12;
          const maxX = Math.max(10, w - 150);
          const minY = 12;
          const maxY = isMobile ? Math.max(10, h - 106) : Math.max(10, h - 58);
          setPos({
            x: Math.max(minX, Math.min(maxX, parsed.x)),
            y: Math.max(minY, Math.min(maxY, parsed.y)),
          });
          setHasUserMoved(true);
        }
      } catch (_) {}
    }
  }, [STORAGE_KEY]);

  // 2. Viewport safety clamp on resize/orientation change if moved
  useEffect(() => {
    const handleResize = () => {
      if (!hasUserMoved) return;
      setPos((prev) => {
        if (!prev) return prev;
        const rect = widgetRef.current?.getBoundingClientRect();
        const isMobile = window.innerWidth < 640;
        const currentW = rect?.width || (isMobile ? 44 : 148);
        const currentH = rect?.height || 44;
        const maxX = Math.max(10, window.innerWidth - currentW - 14);
        const maxY = isMobile
          ? Math.max(10, window.innerHeight - currentH - 62)
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
  }, [hasUserMoved]);

  // 3. Mouse Drag Handler (Desktop)
  const handleMouseDown = (e) => {
    if (Date.now() - lastTouchTimeRef.current < 600) return;
    if (e.button !== 0) return; // Only left-click
    e.stopPropagation();

    if (cleanupListenersRef.current) {
      cleanupListenersRef.current();
    }

    const rect = widgetRef.current?.getBoundingClientRect();
    const currentX = rect ? rect.left : 0;
    const currentY = rect ? rect.top : 0;

    const info = dragInfoRef.current;
    info.startX = e.clientX;
    info.startY = e.clientY;
    info.elemStartX = currentX;
    info.elemStartY = currentY;
    info.hasMoved = false;

    const handleMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - info.startX;
      const dy = moveEvent.clientY - info.startY;

      if (!info.hasMoved && Math.hypot(dx, dy) > 4) {
        info.hasMoved = true;
        setIsDragging(true);
        setHasUserMoved(true);
      }

      if (info.hasMoved) {
        moveEvent.preventDefault();
        const isMobile = window.innerWidth < 640;
        const r = widgetRef.current?.getBoundingClientRect() || (isMobile ? { width: 44, height: 44 } : { width: 148, height: 44 });
        const maxX = Math.max(10, window.innerWidth - r.width - 14);
        const maxY = isMobile
          ? Math.max(10, window.innerHeight - r.height - 62)
          : Math.max(10, window.innerHeight - r.height - 14);

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

  // 4. Touch Drag Handler (Mobile & Touch Devices)
  const handleTouchStart = (e) => {
    lastTouchTimeRef.current = Date.now();
    if (!e.touches || !e.touches[0]) return;

    if (cleanupListenersRef.current) {
      cleanupListenersRef.current();
    }

    const rect = widgetRef.current?.getBoundingClientRect();
    const currentX = rect ? rect.left : 0;
    const currentY = rect ? rect.top : 0;

    const touch = e.touches[0];
    const info = dragInfoRef.current;
    info.startX = touch.clientX;
    info.startY = touch.clientY;
    info.elemStartX = currentX;
    info.elemStartY = currentY;
    info.hasMoved = false;

    const handleTouchMove = (moveEvent) => {
      if (!moveEvent.touches || !moveEvent.touches[0]) return;
      if (moveEvent.cancelable) {
        moveEvent.preventDefault(); // Stop screen scrolling while dragging widget
      }

      const t = moveEvent.touches[0];
      const dx = t.clientX - info.startX;
      const dy = t.clientY - info.startY;

      if (!info.hasMoved && Math.hypot(dx, dy) > 4) {
        info.hasMoved = true;
        setIsDragging(true);
        setHasUserMoved(true);
      }

      if (info.hasMoved) {
        const isMobile = window.innerWidth < 640;
        const r = widgetRef.current?.getBoundingClientRect() || { width: 44, height: 44 };
        const maxX = Math.max(10, window.innerWidth - r.width - 14);
        const maxY = isMobile
          ? Math.max(10, window.innerHeight - r.height - 62)
          : Math.max(10, window.innerHeight - r.height - 14);

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
    e.stopPropagation();
    if (dragInfoRef.current.hasMoved) {
      e.preventDefault();
      return;
    }
    if (onClick) onClick(e);
  };

  const isMobileScreen = typeof window !== "undefined" ? window.innerWidth < 640 : false;
  const mobileBottomOffset = isMobileScreen ? 50 : 0;

  const positioningStyles = hasUserMoved && pos
    ? {
        position: "fixed",
        left: `${pos.x}px`,
        top: `${pos.y}px`,
      }
    : {
        position: "fixed",
        ...(defRight != null ? { right: `${defRight}px` } : { left: `${defLeft ?? 16}px` }),
        ...(defBottom != null ? { bottom: `${defBottom + mobileBottomOffset}px` } : { top: `${defTop ?? 16}px` }),
      };

  return (
    <div
      ref={widgetRef}
      className={`movable-3d-widget movable-3d-anim-${animIndex} ${isDragging ? "is-dragging" : ""} ${className}`}
      style={{
        ...positioningStyles,
        zIndex: isDragging ? 1260 : 1210,
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
        <div className="movable-3d-icon-wrap">
          {icon}
          {badge}
        </div>
        {label && <span className="movable-3d-label">{label}</span>}
      </div>
    </div>
  );
}
