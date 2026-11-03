import { useEffect } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import "./Toast.css";

const variants = {
  success: { Icon: CheckCircle2, label: "Success" },
  error: { Icon: XCircle, label: "Error" },
  info: { Icon: Info, label: "Information" },
};

export default function Toast({ message, type = "info", onDismiss, duration = 5000 }) {
  const variant = variants[type] || variants.info;
  const { Icon, label } = variant;

  useEffect(() => {
    if (!message || duration <= 0) return undefined;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  return (
    <div className={`toast toast-${type}`} role={type === "error" ? "alert" : "status"} aria-live={type === "error" ? "assertive" : "polite"}>
      <Icon size={20} aria-hidden="true" />
      <span className="toast-label">{label}</span>
      <p>{message}</p>
      <button type="button" aria-label="Dismiss notification" onClick={onDismiss}>
        <X size={18} />
      </button>
    </div>
  );
}
