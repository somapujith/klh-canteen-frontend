import { useCallback, useEffect, useState } from "react";
import { apiClient, ApiClientError } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { Navbar } from "../../components/Navbar";

interface TelegramStatus {
  linked: boolean;
  username: string | null;
  linkedAt: string | null;
  botUsername: string | null;
}

interface LinkStart {
  deepLink: string;
  expiresAt: string;
  botUsername: string;
}

/**
 * Student-only Telegram link / unlink.
 * Callers: App.tsx route /student/telegram (ProtectedRoute STUDENT); Navbar menu link.
 * API: GET/POST/DELETE /telegram. User: students link/delink; bot confirms roll+name; order logs.
 */
export function TelegramSettingsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [link, setLink] = useState<LinkStart | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiClient.get<TelegramStatus>("/telegram", token);
      setStatus(data);
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Could not load Telegram status";
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleLink() {
    if (!token) return;
    setBusy(true);
    try {
      const result = await apiClient.post<LinkStart>("/telegram/link", {}, token);
      setLink(result);
      showToast("Open the link in Telegram to finish linking", "success");
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Could not start linking";
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlink() {
    if (!token) return;
    setBusy(true);
    try {
      await apiClient.delete<{ unlinked: true }>("/telegram", token);
      setLink(null);
      showToast("Telegram unlinked", "success");
      await refresh();
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Could not unlink Telegram";
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-muted fade-in">
      <Navbar title="Telegram" backTo="/student" />

      <div className="mx-auto w-full max-w-lg px-4 py-8">
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Order updates on Telegram</h1>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
          Link your Telegram account to get order confirmations and kitchen status updates. Only students can
          link — this is personal to your roll number.
        </p>

        <div className="mt-6 rounded-2xl bg-surface border border-gray-100 flat-shadow p-5">
          {loading ? (
            <div className="h-20 rounded-xl bg-gray-100 animate-pulse" />
          ) : status?.linked ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-emerald-700">Linked</p>
                <p className="mt-1 text-sm text-gray-700">
                  {status.username ? `@${status.username}` : "Telegram account"}
                  {status.linkedAt
                    ? ` · since ${new Date(status.linkedAt).toLocaleString()}`
                    : null}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={handleUnlink}
                className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 transition-colors"
              >
                Unlink Telegram
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Not linked yet.</p>
              <button
                type="button"
                disabled={busy}
                onClick={handleLink}
                className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60 transition-colors shadow-sm"
              >
                Link Telegram
              </button>
              {link && (
                <div className="rounded-xl bg-brand-50 border border-brand-100 p-4 space-y-3">
                  <p className="text-sm text-gray-700">
                    Tap below, then press <span className="font-medium">Start</span> in Telegram. The bot will
                    confirm your roll number and name.
                  </p>
                  <a
                    href={link.deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center rounded-xl bg-[#229ED9] px-4 py-3 text-sm font-medium text-white hover:opacity-95 transition-opacity"
                  >
                    Open @{link.botUsername} in Telegram
                  </a>
                  <button
                    type="button"
                    onClick={() => refresh()}
                    className="w-full text-sm text-brand-700 hover:underline"
                  >
                    I&apos;ve linked — refresh status
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
