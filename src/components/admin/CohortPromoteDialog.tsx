import { useState } from "react";
import { createPortal } from "react-dom";
import type { CohortPreview } from "../../types/admin";

interface Props {
  /** The dry run the operator just read. `wouldDeactivate` is passed back as `expectedCount`. */
  preview: CohortPreview;
  busy: boolean;
  error: string | null;
  onConfirm: (expectedCount: number) => void;
  onCancel: () => void;
}

/**
 * The last gate before a cohort promotion. The operator must type the intake
 * prefix exactly; the expected count is carried from the preview, so if the
 * cohort shifted between preview and confirm the server rejects it with
 * COHORT_CHANGED rather than deactivating a different number of accounts.
 */
export function CohortPromoteDialog({ preview, busy, error, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === preview.prefix;
  const nothingToDo = preview.wouldDeactivate === 0;

  // Portalled to <body> deliberately: the admin shells carry `.fade-in`, whose
  // `animation-fill-mode: forwards` leaves a transform on the element. A transformed
  // ancestor becomes the containing block for `position: fixed`, which would anchor
  // this overlay to the whole page height instead of the viewport.
  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={busy ? undefined : onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirm cohort promotion"
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-red-50 border-b border-red-200 px-6 py-4">
          <h2 className="text-lg font-bold text-red-900">Deactivate intake {preview.prefix}</h2>
          <p className="text-sm text-red-800 mt-1">
            This signs out and disables <strong>{preview.wouldDeactivate}</strong> student account
            {preview.wouldDeactivate === 1 ? "" : "s"} in one call. There is no cohort-level undo — reversing it means
            reactivating accounts one bulk selection at a time.
          </p>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto min-h-0 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <dt className="text-gray-500">Roll numbers matched</dt>
            <dd className="text-gray-900 font-medium text-right">{preview.matched}</dd>
            <dt className="text-gray-500">Will be deactivated</dt>
            <dd className="text-red-800 font-bold text-right">{preview.wouldDeactivate}</dd>
            <dt className="text-gray-500">Already inactive</dt>
            <dd className="text-gray-900 font-medium text-right">{preview.alreadyInactive}</dd>
            <dt className="text-gray-500">Protected, will be skipped</dt>
            <dd className="text-gray-900 font-medium text-right">{preview.protectedSkipped.length}</dd>
            {preview.rollNumberRange && (
              <>
                <dt className="text-gray-500">Range</dt>
                <dd className="text-gray-900 font-medium text-right">
                  {preview.rollNumberRange.first} – {preview.rollNumberRange.last}
                </dd>
              </>
            )}
          </dl>

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1">
              Sample of accounts to be deactivated
              {preview.sampleTruncated && ` (first ${preview.sample.length} of ${preview.wouldDeactivate})`}
            </p>
            <ul className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
              {preview.sample.map((u) => (
                <li key={u.id} className="px-3 py-1.5 flex justify-between gap-3">
                  <span className="truncate text-gray-800">{u.name}</span>
                  <span className="shrink-0 text-gray-400">{u.rollNumber}</span>
                </li>
              ))}
            </ul>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-gray-500 mb-1">
              Type <code className="bg-gray-100 rounded px-1 py-0.5 text-gray-900">{preview.prefix}</code> to confirm
            </span>
            <input
              value={typed}
              autoFocus
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
              aria-label="Type the intake prefix to confirm"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            />
          </label>

          {error && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-red-700">{error}</div>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button
            type="button"
            disabled={!matches || busy || nothingToDo}
            onClick={() => onConfirm(preview.wouldDeactivate)}
            className="flex-1 rounded-xl bg-red-700 hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
          >
            {busy ? "Deactivating…" : `Deactivate ${preview.wouldDeactivate} accounts`}
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
