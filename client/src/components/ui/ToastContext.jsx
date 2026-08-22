import { createContext, useCallback, useContext, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircleIcon, AlertCircleIcon, InfoIcon, XIcon } from "./icons.jsx";

const ToastContext = createContext(null);
const ICONS = { success: CheckCircleIcon, error: AlertCircleIcon, info: InfoIcon };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message, tone = "info", duration = 4500) => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { id, message, tone }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const api = {
    notify,
    success: (message, duration) => notify(message, "success", duration),
    error: (message, duration) => notify(message, "error", duration),
    info: (message, duration) => notify(message, "info", duration),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="toast-viewport" aria-live="polite" aria-atomic="true">
          {toasts.map((t) => {
            const IconCmp = ICONS[t.tone] || InfoIcon;
            return (
              <div key={t.id} className={`toast toast-${t.tone}`} role="status">
                <span className="toast-icon">
                  <IconCmp />
                </span>
                <span className="toast-body">{t.message}</span>
                <button
                  type="button"
                  className="toast-close"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                >
                  <XIcon />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
