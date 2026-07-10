import { useState, type FormEvent } from "react";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { AdminNav } from "../../components/AdminNav";

interface ImportResult {
  row: number;
  rollNumber: string;
  status: "created" | "skipped";
  reason?: string;
}

export function AdminStudentsPage() {
  const { token } = useAuth();
  const [csv, setCsv] = useState("");
  const [results, setResults] = useState<ImportResult[]>([]);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    setUploading(true);
    try {
      const res = await apiClient.post<{ results: ImportResult[] }>("/admin/students/bulk", { csv }, token ?? undefined);
      setResults(res.results);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <AdminNav />
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <form onSubmit={handleUpload} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <label htmlFor="csv-input" className="block text-sm font-medium text-gray-700">
            Paste CSV (columns: name,rollNumber,email,password)
          </label>
          <textarea
            id="csv-input"
            aria-label="csv"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={8}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 font-mono text-sm"
            placeholder={"name,rollNumber,email,password\nAsha Rao,23BCE001,asha@klh.edu.in,pass1234"}
          />
          <button
            disabled={uploading}
            className="rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </form>

        {results.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4 overflow-x-auto">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-2">Row</th>
                  <th className="pb-2">Roll Number</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.row} className="border-t border-gray-100">
                    <td className="py-1.5">{r.row}</td>
                    <td className="py-1.5">{r.rollNumber}</td>
                    <td className="py-1.5">
                      <span className={r.status === "created" ? "text-green-700" : "text-yellow-700"}>
                        {r.status}
                        {r.reason ? ` (${r.reason})` : ""}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
