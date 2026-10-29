"use client";

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
        <p className="text-2xl font-semibold mt-1">{value}</p>
        {hint && <p className="text-xs text-text-secondary mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${Math.round(Number(n) * 100)}%`);
export const gbp = (n: number | null | undefined) => (n === null || n === undefined ? "–" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(n)));
export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "–");

export async function postJson<T>(url: string, body: unknown, method: "POST" | "PATCH" | "PUT" | "DELETE" = "POST"): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || (typeof json?.error === "string" ? json.error : "") || json?.details || `Request failed (${res.status})`);
  return (json.data ?? json) as T;
}

export const pill = "px-3 py-1.5 rounded-full text-xs font-medium border";
export const pillOn = "bg-brand-accent text-brand-bg border-brand-accent";
export const pillOff = "border-brand-border text-text-secondary hover:text-text-primary";
export const btn = "rounded-lg bg-brand-accent text-brand-bg text-xs font-semibold px-3 py-1.5 disabled:opacity-50";
export const btnGhost = "rounded-lg border border-brand-border text-xs px-3 py-1.5 text-text-secondary hover:text-text-primary disabled:opacity-50";
export const field = "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm";
