"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link2, Copy, Check, Loader2, Ban } from "lucide-react";

/**
 * Staff control for the guest portal link of a booking: create (shown once,
 * copy to clipboard or paste into a message) and revoke.
 */
export function PortalLinkButton({ bookingId, disabled }: { bookingId: string; disabled?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [expires, setExpires] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/bookings/${bookingId}/portal-link`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { setError(json.error?.message || json.error || "Could not create the link"); return; }
      setUrl(json.data.url);
      setExpires(json.data.expires_at);
    } finally {
      setBusy(false);
    }
  };
  const revoke = async () => {
    setBusy(true);
    try {
      await fetch(`/api/v1/bookings/${bookingId}/portal-link`, { method: "DELETE" });
      setUrl(null);
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <Button variant="secondary" size="sm" onClick={create} disabled={busy || disabled} data-testid="portal-link-create">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />} Guest portal link
        </Button>
        {url && (
          <Button variant="ghost" size="sm" onClick={revoke} disabled={busy} data-testid="portal-link-revoke"><Ban className="w-4 h-4 mr-2" /> Revoke links</Button>
        )}
      </div>
      {error && <p className="text-xs text-status-error">{error}</p>}
      {url && (
        <div className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-bg/40 px-3 py-2">
          <code className="text-xs text-text-secondary break-all flex-1" data-testid="portal-link-url">{url}</code>
          <button onClick={copy} className="text-text-muted hover:text-text-primary" aria-label="Copy link">{copied ? <Check className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4" />}</button>
        </div>
      )}
      {url && expires && <p className="text-xs text-text-muted">Send this to the guest. It shows their stay, terms and bill, and takes online check-in. Valid until {new Date(expires).toLocaleDateString("en-GB")}; shown only once.</p>}
    </div>
  );
}
