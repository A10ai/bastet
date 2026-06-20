"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { CSRF_HEADER_NAME } from "@/lib/csrf-constants";

interface CSRFContextType {
  /** The current CSRF token, or null while loading / if not yet fetched. */
  token: string | null;
  /** True while the initial token fetch is in progress. */
  loading: boolean;
  /**
   * Returns the headers object needed to make a CSRF-protected mutation.
   * If the token is not yet available, returns an empty object (the request
   * will be rejected by the server with 403).
   */
  getCSRFHeaders: () => Record<string, string>;
}

const CSRFContext = createContext<CSRFContextType | null>(null);

/**
 * Fetches a CSRF token on mount (GET /api/v1/csrf) and provides it via context.
 * The server sets the `hospitai-csrf` httpOnly cookie on the same response,
 * so the client only needs the token value to echo back in the header.
 *
 * Place this provider high in the tree (e.g. dashboard layout) so that all
 * authenticated mutations can access the token via `useCSRFToken()`.
 */
export function CSRFTokenProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchToken() {
      try {
        const res = await fetch("/api/v1/csrf", {
          method: "GET",
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const json = (await res.json()) as { data?: { token?: string } };
        const t = json?.data?.token ?? null;
        if (!cancelled) {
          setToken(t);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    fetchToken();
    return () => {
      cancelled = true;
    };
  }, []);

  const getCSRFHeaders = useCallback((): Record<string, string> => {
    if (!token) return {};
    return { [CSRF_HEADER_NAME]: token };
  }, [token]);

  return (
    <CSRFContext.Provider value={{ token, loading, getCSRFHeaders }}>
      {children}
    </CSRFContext.Provider>
  );
}

/**
 * Access the current CSRF token. Must be used inside <CSRFTokenProvider>.
 */
export function useCSRFToken(): CSRFContextType {
  const ctx = useContext(CSRFContext);
  if (ctx === null) {
    throw new Error("useCSRFToken must be used within a CSRFTokenProvider");
  }
  return ctx;
}