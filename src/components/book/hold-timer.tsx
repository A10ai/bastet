"use client";

import { useEffect, useState } from "react";
import { formatCountdown, type BookStrings } from "@/lib/book-i18n";

/** Counts down the hold deadline and tells the page when it has passed. */
export function HoldTimer({ expiresAt, s, onExpired }: { expiresAt: string | null; s: BookStrings; onExpired: () => void }) {
  const [remaining, setRemaining] = useState<number>(() => (expiresAt ? Math.max(0, new Date(expiresAt).getTime() - Date.now()) : 0));
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setRemaining(ms);
      if (ms === 0) onExpired();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpired]);
  if (!expiresAt) return null;
  if (remaining === 0) return <p className="text-sm text-status-error" data-testid="hold-expired">{s.holdExpired}</p>;
  return (
    <p className="text-sm text-text-secondary" data-testid="hold-timer">
      {s.holdExpiresIn} <span className={`font-mono font-semibold ${remaining < 5 * 60_000 ? "text-status-error" : "text-text-primary"}`}>{formatCountdown(remaining)}</span>
    </p>
  );
}
