"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OverviewTab } from "@/components/sales/overview-tab";
import { PricingTab } from "@/components/sales/pricing-tab";
import { ChannelsTab } from "@/components/sales/channels-tab";
import { ConciergeTab } from "@/components/sales/concierge-tab";
import { ReviewsTab } from "@/components/sales/reviews-tab";
import { OperatorsTab } from "@/components/sales/operators-tab";

const TABS = [
  { id: "overview", label: "Proof report" },
  { id: "pricing", label: "Pricing agent" },
  { id: "channels", label: "Channels" },
  { id: "concierge", label: "Concierge" },
  { id: "reviews", label: "Reviews" },
  { id: "operators", label: "Operators" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/**
 * Sales module home: the online-first revenue agent in one place. Each tab
 * is a thin view over the Sales APIs; the work happens in the cron and the
 * database functions.
 */
export default function SalesPage() {
  return (
    <Suspense fallback={null}>
      <SalesPageInner />
    </Suspense>
  );
}

function SalesPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? (params.get("session") ? "concierge" : "overview")) as TabId;
  const go = (id: TabId) => router.replace(`/dashboard/sales${id === "overview" ? "" : `?tab=${id}`}`, { scroll: false });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary">Sales</h1>
        <p className="text-sm text-text-secondary mt-1">Online-first: direct and OTA sales at a premium rate, with the proof operators will ask for.</p>
      </div>
      <div className="flex gap-2 flex-wrap" role="tablist">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => go(t.id)} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${tab === t.id ? "bg-brand-accent text-brand-bg border-brand-accent" : "border-brand-border text-text-secondary hover:text-text-primary"}`} data-testid={`sales-tab-${t.id}`}>{t.label}</button>)}
      </div>
      {tab === "overview" && <OverviewTab />}
      {tab === "pricing" && <PricingTab />}
      {tab === "channels" && <ChannelsTab />}
      {tab === "concierge" && <ConciergeTab initialSession={params.get("session")} />}
      {tab === "reviews" && <ReviewsTab />}
      {tab === "operators" && <OperatorsTab />}
    </div>
  );
}
