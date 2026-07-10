import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo } from "../components/Logo";

export function LoginPage() {
  const { login, role } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(identifier, password);
      navigate(role === "ADMIN" ? "/admin" : "/student", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 space-y-6">
        <div className="flex flex-col items-center gap-2 mb-4">
          <Logo className="h-24" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="identifier" className="block text-sm font-medium text-gray-700">
              Email or Roll Number
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-600 text-white py-2.5 font-medium hover:bg-brand-700 disabled:opacity-50 transition"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>

        {import.meta.env.DEV && (
          <div className="pt-4 border-t border-gray-100 flex gap-2">
            <button
              onClick={() => {
                setIdentifier("student@klh.edu.in");
                setPassword("student123");
              }}
              className="flex-1 rounded-xl bg-gray-100 text-gray-700 py-2 text-sm font-medium hover:bg-gray-200 transition"
              type="button"
            >
              Fill Student
            </button>
            <button
              onClick={() => {
                setIdentifier("admin@klh.edu.in");
                setPassword("changeme123");
              }}
              className="flex-1 rounded-xl bg-gray-100 text-gray-700 py-2 text-sm font-medium hover:bg-gray-200 transition"
              type="button"
            >
              Fill Admin
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
