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
        <div className="flex flex-col items-center gap-2">
          <Logo className="h-14" />
          <h1 className="text-xl font-semibold text-brand-900">KLH Pantry</h1>
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
      </div>
    </div>
  );
}
