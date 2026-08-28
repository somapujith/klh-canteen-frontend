import { useEffect, useRef } from "react";

/**
 * Google's own "Sign in with Google" button, rendered by Google Identity
 * Services.
 *
 * Shared between the student login page and the guest counter gate. It lives
 * here rather than in either page because the GIS <script> must be loaded
 * exactly once per document: two copies of the loader racing each other would
 * append two script tags and leave `window.google` initialised against
 * whichever client happened to resolve last.
 *
 * `clientId` is per-flow on purpose — DRK students, KLH students and KLH
 * guests each have their own OAuth client, and the backend checks the ID
 * token's `aud` against the one for that flow. Re-keying the effect on
 * `clientId` is what stops a stale `initialize()` from a previous flow being
 * reused after a switch.
 */
const GOOGLE_GSI_SRC = "https://accounts.google.com/gsi/client";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

let gsiLoadPromise: Promise<void> | null = null;

/** Loads the GIS script once and resolves immediately on every call after. */
export function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiLoadPromise) return gsiLoadPromise;

  gsiLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Sign-In")));
      return;
    }
    const script = document.createElement("script");
    script.src = GOOGLE_GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Sign-In"));
    document.head.appendChild(script);
  });
  return gsiLoadPromise;
}

export function GoogleSignInButton({
  clientId,
  onCredential,
  onError,
  text = "signin_with",
}: {
  clientId: string | undefined;
  onCredential: (idToken: string) => void;
  onError: (message: string) => void;
  /** GIS button label variant, e.g. "continue_with" reads better on a gate. */
  text?: "signin_with" | "continue_with" | "signup_with";
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    loadGoogleIdentityServices()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => onCredential(response.credential),
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          width: 320,
          text,
        });
      })
      .catch(() => {
        if (!cancelled) onError("Google Sign-In could not be loaded. Check your connection and try again.");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  if (!clientId) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}
