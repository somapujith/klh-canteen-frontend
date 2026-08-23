import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** `danger` reserves the heavier red-700 fill for actions that change many accounts. */
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal replacement for window.confirm on admin actions, so the operator can be
 * shown *what* they are about to change instead of a one-line browser prompt.
 */
export function ConfirmDialog({ open, title, children, confirmLabel, tone = "default", busy = false, onConfirm, onCancel }: Props) {
  if (!open) return null;

  const confirmClass =
    tone === "danger"
      ? "bg-red-700 hover:bg-red-800 focus:ring-red-300"
      : "bg-brand-600 hover:bg-brand-700 focus:ring-brand-500/30";

  // Portalled to <body> deliberately: the admin shells carry `.fade-in`, whose
  // `animation-fill-mode: forwards` leaves a transform on the element. A transformed
  // ancestor becomes the containing block for `position: fixed`, which would anchor
  // this overlay to the whole page height instead of the viewport.
  return createPortal(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={busy ? undefined : onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <div className="text-sm text-gray-600 space-y-2">{children}</div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 rounded-xl text-white py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 ${confirmClass}`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
