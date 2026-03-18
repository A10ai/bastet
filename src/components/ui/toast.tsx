"use client";

import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, Cpu, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Toast {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error" | "ai_decision";
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextType>({
  addToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

// ---------------------------------------------------------------------------
// Color and icon mapping
// ---------------------------------------------------------------------------

function getToastStyles(type: string): { border: string; icon: string; bg: string } {
  switch (type) {
    case "success":
      return { border: "border-l-emerald-400", icon: "text-emerald-400", bg: "bg-emerald-400/5" };
    case "warning":
      return { border: "border-l-amber-400", icon: "text-amber-400", bg: "bg-amber-400/5" };
    case "error":
      return { border: "border-l-red-400", icon: "text-red-400", bg: "bg-red-400/5" };
    case "ai_decision":
      return { border: "border-l-purple-400", icon: "text-purple-400", bg: "bg-purple-400/5" };
    case "info":
    default:
      return { border: "border-l-cyan-400", icon: "text-cyan-400", bg: "bg-cyan-400/5" };
  }
}

function getToastIcon(type: string) {
  switch (type) {
    case "success":
      return CheckCircle2;
    case "warning":
      return AlertTriangle;
    case "error":
      return XCircle;
    case "ai_decision":
      return Cpu;
    case "info":
    default:
      return Info;
  }
}

// ---------------------------------------------------------------------------
// Toast Provider
// ---------------------------------------------------------------------------

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-4), { ...toast, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toast container */}
      <div
        className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Single Toast Item
// ---------------------------------------------------------------------------

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Enter animation
    const enterTimer = requestAnimationFrame(() => setIsVisible(true));

    // Auto-dismiss after 5 seconds
    const dismissTimer = setTimeout(() => {
      setIsLeaving(true);
      setTimeout(() => onDismiss(toast.id), 300);
    }, 5000);

    return () => {
      cancelAnimationFrame(enterTimer);
      clearTimeout(dismissTimer);
    };
  }, [toast.id, onDismiss]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  const styles = getToastStyles(toast.type);
  const Icon = getToastIcon(toast.type);

  return (
    <div
      className={`pointer-events-auto w-80 bg-bastet-card border border-bastet-border border-l-4 ${styles.border} ${styles.bg} rounded-lg shadow-xl shadow-black/30 transition-all duration-300 ${
        isVisible && !isLeaving
          ? "opacity-100 translate-x-0"
          : "opacity-0 translate-x-4"
      }`}
      role="alert"
    >
      <div className="flex items-start gap-3 p-3">
        <div className={`flex-shrink-0 mt-0.5 ${styles.icon}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{toast.title}</p>
          <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
            {toast.message}
          </p>
        </div>
        <button
          onClick={handleClose}
          className="flex-shrink-0 p-0.5 text-text-muted hover:text-text-secondary transition-colors"
          aria-label="Dismiss notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
