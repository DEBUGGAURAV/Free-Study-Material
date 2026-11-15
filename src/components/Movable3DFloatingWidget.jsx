import React, { useState, useEffect, useRef } from "react";

/**
 * 🛸 Movable 3D Floating Action Widget
 * - Fully Draggable (Mouse + Touch on Mobile)
 * - Intelligent Drag vs Tap threshold (moved > 6px = drag, else click)
 * - Continuous 3D floating animation & physics on mobile & desktop
 * - Persistent position saved to localStorage with viewport boundary clamping
 * - Performance optimized: primitive deps & unmount listener cleanup
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

  // Destructure primitive values so inline object literal doesn't re-trigger effect on every parent render
  const defRight = defaultPos?.right;
  const defLeft = defaultPos?.left;
  const defBottom = defaultPos?.bottom;
  const defTop = defaultPos?.top;

  // Cleanup any active dragging listeners on unmount to prevent leaks
  useEffect(() => {
    return () => {
      if (cleanupListenersRef.current) {
        cleanupListenersRef.current();
        cleanupListenersRef.current = null;
      }
    };
  }, []);

  // 1. Initialize position from localStorage or calculate default coordinates
  useEffect(() => {
    if (typeof window === "undefined") return;

    const saved = localStorage.getItem(`fsm_widget_pos_${id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          const maxX = Math.max(10, window.innerWidth - 65);
          const maxY = Math.max(10, window.innerHeight - 55);
          setPos({
            x: Math.max(8, Math.min(maxX, parsed.x)),
            y: Math.max(8, Math.min(maxY, parsed.y)),
          });
          return;
        }
      } catch (_) {}
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    const isMobile = w < 640;
    const elemW = isMobile ? 105 : 130;
    const elemH = 44;

    let initX = 16;
    let initY = h - 68;

    if (defRight != null) {
      initX = w - (defRight + elemW);
    } else if (defLeft != null) {
      initX = defLeft;
    }

    if (defBottom != null) {
      initY = h - (defBottom + elemH);
    } else if (defTop != null) {
      initY = defTop;
    }

    setPos({
      x: Math.max(8, Math.min(w - elemW - 8, initX)),
      y: Math.max(8, Math.min(h - elemH - 8, initY)),
    });
  }, [id, defRight, defLeft, defBottom, defTop]);

  // 2. Keep within viewport bounds on screen resize or orientation change
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => {
        if (!prev) return prev;
        const rect = widgetRef.current?.getBoundingClientRect() || { width: 110, height: 44 };
        const maxX = Math.max(8, window.innerWidth - rect.width - 8);
        const maxY = Math.max(8, window.innerHeight - rect.height - 8);
        return {
          x: Math.max(8, Math.min(maxX, prev.x)),
          y: Math.max(8, Math.min(maxY, prev.y)),
        };
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 3. Mouse Drag Handler
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Only primary mouse button
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

      if (!info.hasMoved && Math.hypot(dx, dy) > 5) {
        info.hasMoved = true;
        setIsDragging(true);
      }

      if (info.hasMoved) {
        moveEvent.preventDefault();
        const rect = widgetRef.current?.getBoundingClientRect() || { width: 120, height: 44 };
        const maxX = Math.max(8, window.innerWidth - rect.width - 8);
        const maxY = Math.max(8, window.innerHeight - rect.height - 8);

        const newX = Math.max(8, Math.min(maxX, info.elemStartX + dx));
        const newY = Math.max(8, Math.min(maxY, info.elemStartY + dy));

        setPos({ x: newX, y: newY });
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      cleanupListenersRef.current = null;

      if (info.hasMoved) {
        setTimeout(() => setIsDragging(false), 50);
        setPos((currentPos) => {
          if (currentPos) {
            localStorage.setItem(`fsm_widget_pos_${id}`, JSON.stringify(currentPos));
          }
          return currentPos;
        });
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

  // 4. Touch Drag Handler (Phone & Tablet)
  const handleTouchStart = (e) => {
    if (!e.touches || !e.touches[0]) return;
    const touch = e.touches[0];

    if (cleanupListenersRef.current) {
      cleanupListenersRef.current();
    }

    const info = dragInfoRef.current;
    info.startX = touch.clientX;
    info.startY = touch.clientY;
    info.elemStartX = pos ? pos.x : 0;
    info.elemStartY = pos ? pos.y : 0;
    info.hasMoved = false;

    const handleTouchMove = (moveEvent) => {
      if (!moveEvent.touches || !moveEvent.touches[0]) return;
      const t = moveEvent.touches[0];
      const dx = t.clientX - info.startX;
      const dy = t.clientY - info.startY;

      if (!info.hasMoved && Math.hypot(dx, dy) > 6) {
        info.hasMoved = true;
        setIsDragging(true);
      }

      if (info.hasMoved) {
        moveEvent.preventDefault();
        const rect = widgetRef.current?.getBoundingClientRect() || { width: 105, height: 44 };
        const maxX = Math.max(8, window.innerWidth - rect.width - 8);
        const maxY = Math.max(8, window.innerHeight - rect.height - 8);

        const newX = Math.max(8, Math.min(maxX, info.elemStartX + dx));
        const newY = Math.max(8, Math.min(maxY, info.elemStartY + dy));

        setPos({ x: newX, y: newY });
      }
    };

    const handleTouchEnd = () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      cleanupListenersRef.current = null;

      if (info.hasMoved) {
        setTimeout(() => setIsDragging(false), 50);
        setPos((currentPos) => {
          if (currentPos) {
            localStorage.setItem(`fsm_widget_pos_${id}`, JSON.stringify(currentPos));
          }
          return currentPos;
        });
      } else {
        setIsDragging(false);
      }
    };

    cleanupListenersRef.current = () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };

    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
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
        zIndex: 1040,
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
          boxShadow: `0 10px 28px -4px ${glowColor}, inset 0 1.5px 1.5px rgba(255, 255, 255, 0.6), inset 0 -2px 5px rgba(0, 0, 0, 0.25)`,
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
