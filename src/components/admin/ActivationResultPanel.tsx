import { skipLabel, skipReasonCopy } from "../../lib/adminUsers";
import type { ActivationResult } from "../../types/admin";

interface Props {
  result: ActivationResult;
  onDismiss: () => void;
}

/**
 * Every (de)activation can silently leave accounts untouched — protected accounts,
 * your own account, ids that no longer exist. An operator who asked for 40 and got
 * 38 needs to see which two and why, or it reads as a bug.
 */
export function ActivationResultPanel({ result, onDismiss }: Props) {
  const skipped = result.skipped ?? [];
  const verb = result.active ? "Reactivated" : "Deactivated";
  const allSkipped = result.changed === 0 && skipped.length > 0;

  return (
    <div
      className={`rounded-2xl border p-4 space-y-3 ${
        allSkipped ? "bg-amber-50 border-amber-200" : "bg-surface border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-gray-800">
          <strong>
            {verb} {result.changed}
          </strong>{" "}
          of {result.requested} account{result.requested === 1 ? "" : "s"}.
          {skipped.length > 0 && (
            <>
              {" "}
              <span className="text-amber-800 font-semibold">
                {skipped.length} skipped
              </span>{" "}
              — see below.
            </>
          )}
          {!result.active && result.changed > 0 && (
            <span className="block text-xs text-gray-500 mt-1">
              Existing sessions for those accounts were invalidated. Order history is untouched.
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors"
        >
          Dismiss
        </button>
      </div>

      {skipped.length > 0 && (
        <ul className="divide-y divide-amber-100 border border-amber-200 rounded-xl bg-white/70 max-h-52 overflow-y-auto">
          {skipped.map((skip, index) => (
            <li key={skip.id ?? skip.email ?? index} className="px-3 py-2 text-sm flex flex-col sm:flex-row sm:justify-between gap-1">
              <span className="font-medium text-gray-800 truncate">{skipLabel(skip)}</span>
              <span className="text-gray-500 sm:text-right sm:shrink-0 sm:max-w-[60%]">{skipReasonCopy(skip.reason)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
