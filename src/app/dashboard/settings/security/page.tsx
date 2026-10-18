"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, ShieldAlert, Loader2, Trash2 } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCSRFToken } from "@/components/CSRFTokenProvider";

interface Factor {
  id: string;
  friendly_name?: string | null;
  created_at: string;
}
interface MfaStatus {
  factors: Factor[];
  current_level: string | null;
  next_level: string | null;
  enrolled: boolean;
  verification_required: boolean;
}

/**
 * Settings > Security: enrol and manage an authenticator app (TOTP) through
 * /api/v1/auth/mfa. Owners and admins must enrol before they can use the rest
 * of the system (see src/lib/mfa.ts); every enrolled user verifies once per
 * session.
 */
export default function SecuritySettingsPage() {
  const { getCSRFHeaders, loading: csrfLoading } = useCSRFToken();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/mfa", { credentials: "same-origin" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || json?.error || `HTTP ${res.status}`);
      setStatus(json.data as MfaStatus);
    } catch (err) {
      setError(`Could not load security status: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/v1/auth/mfa", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...getCSRFHeaders() },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || json?.error || `HTTP ${res.status}`);
    return json.data;
  };

  const startEnrol = async () => {
    setError(""); setNotice(""); setBusy(true);
    try {
      const data = await post({ action: "enroll" });
      setEnrolling({ id: data.factor_id, qr: data.qr_code, secret: data.secret });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start enrolment");
    } finally {
      setBusy(false);
    }
  };

  const confirmEnrol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrolling) return;
    setError(""); setBusy(true);
    try {
      await post({ action: "verify", factor_id: enrolling.id, code: code.trim() });
      setEnrolling(null); setCode("");
      setNotice("Authenticator enrolled. You will be asked for a code at every sign-in.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  };

  const cancelEnrol = async () => {
    if (enrolling) await post({ action: "unenroll", factor_id: enrolling.id }).catch(() => {});
    setEnrolling(null); setCode(""); setError("");
  };

  const remove = async (factorId: string) => {
    setError(""); setBusy(true);
    try {
      await post({ action: "unenroll", factor_id: factorId });
      setNotice("Authenticator removed.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove factor");
    } finally {
      setBusy(false);
    }
  };

  const enrolled = !!status?.enrolled;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/settings" className="p-2 rounded-lg hover:bg-bastet-card transition-colors">
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">Security</h1>
          <p className="text-sm text-text-secondary mt-1">Two-factor authentication for your account</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {enrolled ? <ShieldCheck className="w-5 h-5 text-emerald-400" /> : <ShieldAlert className="w-5 h-5 text-amber-400" />}
            <h3 className="text-lg font-semibold text-text-primary">Authenticator app</h3>
          </div>
          <p className="text-xs text-text-muted mt-1" data-testid="mfa-status">
            {loading
              ? "Checking…"
              : enrolled
                ? `Enabled. This session is ${status?.current_level === "aal2" ? "verified" : "not yet verified"}.`
                : "Not enabled. Owners and admins must enable this before using HospitAI."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {notice && <div className="p-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-sm text-emerald-200">{notice}</div>}
          {error && <div className="p-3 rounded-lg border border-status-error/20 bg-status-error/10 text-sm text-status-error">{error}</div>}

          {!enrolling && !enrolled && (
            <Button onClick={startEnrol} disabled={busy || loading || csrfLoading}>
              {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Set up authenticator
            </Button>
          )}

          {enrolling && (
            <form onSubmit={confirmEnrol} className="space-y-4">
              <p className="text-sm text-text-secondary">
                Scan this QR code with Google Authenticator, 1Password or Authy, then enter the six-digit code.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URI from Supabase */}
                <img src={enrolling.qr} alt="Authenticator QR code" width={180} height={180} className="rounded-lg bg-white p-2" />
                <div className="text-xs text-text-muted break-all">
                  <p className="mb-1">Cannot scan? Enter this key manually:</p>
                  <code data-testid="totp-secret" className="font-mono text-text-primary">{enrolling.secret}</code>
                </div>
              </div>
              <Input id="totp-code" label="Six-digit code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
              <div className="flex gap-3">
                <Button type="submit" disabled={busy || code.trim().length < 6}>
                  {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Verify and enable
                </Button>
                <Button type="button" variant="secondary" onClick={cancelEnrol} disabled={busy}>Cancel</Button>
              </div>
            </form>
          )}

          {enrolled && !enrolling && (
            <ul className="divide-y divide-bastet-border">
              {status!.factors.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm text-text-primary">{f.friendly_name || "Authenticator app"}</p>
                    <p className="text-xs text-text-muted">Added {new Date(f.created_at).toLocaleDateString("en-GB")}</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => remove(f.id)} disabled={busy}>
                    <Trash2 className="w-4 h-4 mr-1" /> Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
