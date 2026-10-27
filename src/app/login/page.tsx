"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeRedirectPath } from "@/lib/safe-redirect";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  const [step, setStep] = useState<"password" | "mfa">(searchParams.get("step") === "mfa" ? "mfa" : "password");
  const [code, setCode] = useState("");

  /**
   * After a password sign-in the server reports whether this account has an
   * enrolled authenticator. If so the session stays at aal1 and every
   * protected route refuses it until the code is verified here.
   */
  async function needsSecondFactor(): Promise<boolean> {
    try {
      const res = await fetch("/api/v1/auth/mfa", { credentials: "same-origin" });
      if (!res.ok) return false;
      const json = await res.json();
      return !!json?.data?.verification_required;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    if (step === "mfa") {
      needsSecondFactor().then((needed) => { if (!needed) setStep("password"); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const csrfRes = await fetch("/api/v1/csrf", { credentials: "same-origin" });
      const csrf = (await csrfRes.json())?.data?.token as string | undefined;
      const statusRes = await fetch("/api/v1/auth/mfa", { credentials: "same-origin" });
      const factorId = (await statusRes.json())?.data?.factors?.[0]?.id as string | undefined;
      if (!factorId) {
        setError("No authenticator is enrolled for this account.");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/v1/auth/mfa", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
        body: JSON.stringify({ action: "verify", factor_id: factorId, code: code.trim() }),
      });
      if (!res.ok) {
        setError("That code was not accepted. Codes change every 30 seconds.");
        setLoading(false);
        return;
      }
      router.push(redirect);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error?.message || data?.error || "Invalid credentials");
        setLoading(false);
        return;
      }

      if (await needsSecondFactor()) {
        setStep("mfa");
        setLoading(false);
        return;
      }

      router.push(redirect);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  if (step === "mfa") {
    return (
      <div className="bg-brand-card border border-brand-border rounded-xl p-8">
        <h2 className="text-xl font-semibold text-text-primary mb-2">Two-factor verification</h2>
        <p className="text-sm text-text-secondary mb-6">Enter the six-digit code from your authenticator app.</p>
        <form onSubmit={handleMfa} className="space-y-4">
          <div>
            <label htmlFor="totp" className="block text-sm font-medium text-text-secondary mb-1.5">Authenticator code</label>
            <input
              id="totp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2.5 bg-brand-bg border border-brand-border rounded-lg text-text-primary tracking-widest text-center text-lg focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400/40 transition-colors"
              placeholder="123456"
            />
          </div>
          {error && (
            <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-lg text-status-error text-sm">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading || code.trim().length < 6}
            className="w-full py-2.5 px-4 gold-gradient text-navy-950 font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="bg-brand-card border border-brand-border rounded-xl p-8">
      <h2 className="text-xl font-semibold text-text-primary mb-6">
        Staff Login
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-text-secondary mb-1.5"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2.5 bg-brand-bg border border-brand-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400/40 transition-colors"
            placeholder="you@hospitai.uk"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-text-secondary mb-1.5"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-3 py-2.5 bg-brand-bg border border-brand-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400/40 transition-colors"
            placeholder="Enter your password"
          />
        </div>

        {error && (
          <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-lg text-status-error text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 gold-gradient text-navy-950 font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg px-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-bold text-white">
            Hospit<span className="text-cyan-400">AI</span>
          </h1>
          <p className="text-text-secondary mt-1 text-sm">
            The AI operating system for hotels
          </p>
        </div>

        <Suspense
          fallback={
            <div className="bg-brand-card border border-brand-border rounded-xl p-8 text-center text-text-secondary">
              Loading...
            </div>
          }
        >
          <LoginForm />
        </Suspense>

        <p className="text-center text-text-muted text-xs mt-6">
          HospitAI
        </p>
      </div>
    </div>
  );
}
