import { useState, type ChangeEvent } from "react";
import { apiClient, ApiClientError } from "../lib/apiClient";

interface RosterResult {
  row: number;
  rollNumber: string;
  name: string;
  status: "created" | "skipped";
  reason?: string;
}

interface RosterSummary {
  created: number;
  skipped: number;
  defaultPassword: string;
  results: RosterResult[];
}

interface Props {
  token: string | null;
  onImported: () => void;
}

/**
 * Superadmin-only roster upload: a `name,rollNumber` CSV becomes STUDENT
 * accounts. Email and password are derived server-side, so the file carries
 * no credentials.
 */
export function BulkAddStudents({ token, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RosterSummary | null>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setError(null);
    setSummary(null);
  }

  async function handleUpload() {
    if (!file) return;
    setImporting(true);
    setError(null);
    setSummary(null);
    try {
      const csv = await file.text();
      const result = await apiClient.post<RosterSummary>("/superadmin/students/bulk", { csv }, token ?? undefined);
      setSummary(result);
      onImported();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Import failed. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  const skipped = summary?.results.filter((r) => r.status === "skipped") ?? [];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Bulk add students</h2>
        <p className="text-sm text-gray-500 mt-1">
          Upload a CSV with <code className="text-xs bg-gray-100 rounded px-1 py-0.5">name,rollNumber</code> columns.
          Each student logs in with their roll number. Accounts that already exist are skipped.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="Student roster CSV"
          onChange={handleFileChange}
          className="flex-1 text-sm text-gray-600 file:mr-3 file:rounded-xl file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
        />
        <button
          onClick={handleUpload}
          disabled={!file || importing}
          className="rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 text-sm font-semibold transition-colors"
        >
          {importing ? "Importing…" : "Import students"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">{error}</div>
      )}

      {summary && (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-sm text-green-800">
            Created <strong>{summary.created}</strong> student{summary.created === 1 ? "" : "s"}, skipped{" "}
            <strong>{summary.skipped}</strong>. Default password:{" "}
            <code className="bg-white border border-green-200 rounded px-1.5 py-0.5">{summary.defaultPassword}</code>
          </div>

          {skipped.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                View {skipped.length} skipped row{skipped.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-2 max-h-48 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-xl">
                {skipped.map((r) => (
                  <li key={r.row} className="px-3 py-2 flex justify-between gap-3">
                    <span className="text-gray-700 truncate">
                      Row {r.row}: {r.name || "(no name)"} {r.rollNumber && `— ${r.rollNumber}`}
                    </span>
                    <span className="text-gray-500 shrink-0">{r.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
