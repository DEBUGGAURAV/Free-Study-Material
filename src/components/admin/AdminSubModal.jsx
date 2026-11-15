import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * 🪟 Shared Lightweight Admin Sub-Modal Wrapper
 * Eliminates repetitive modal boilerplate, guarantees pure white studio theme,
 * auto-locks backdrop, handles Escape key, and reduces DOM depth.
 */
export default function AdminSubModal({
  isOpen,
  onClose,
  title,
  subtitle = "",
  icon: Icon = null,
  accentColor = "#2563eb",
  maxWidth = "560px",
  children,
  footer = null,
  zIndex = 1200,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay adm-modal-overlay"
      onClick={onClose}
      style={{ zIndex }}
    >
      <div
        className="modal-content adm-modal-card"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="adm-modal-header">
          <div className="adm-modal-header-left">
            {Icon && (
              <div
                className="adm-modal-icon-badge"
                style={{
                  background: `${accentColor}15`,
                  color: accentColor,
                  border: `1.5px solid ${accentColor}35`,
                }}
              >
                <Icon size={18} />
              </div>
            )}
            <div>
              <h3 className="adm-modal-title">{title}</h3>
              {subtitle && <p className="adm-modal-subtitle">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            className="adm-modal-close-btn"
            onClick={onClose}
            title="Close dialog (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        <div className="adm-modal-body">{children}</div>

        {footer && <div className="adm-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
