"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sun,
  Sunset,
  Moon,
  RefreshCw,
  Loader2,
  Building2,
  DollarSign,
  Sparkles,
  Wrench,
  Wallet,
  Users,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BriefingItem {
  text: string;
  trend?: "up" | "down" | "flat";
  alert?: boolean;
}

interface BriefingSection {
  title: string;
  icon: string;
  items: BriefingItem[];
}

interface PriorityAction {
  text: string;
  link: string;
  priority: "high" | "medium" | "low";
}

interface HealthScore {
  overall: number;
  dimensions: Record<string, number>;
}

interface BriefingData {
  greeting: string;
  date: string;
  property: string;
  sections: {
    occupancy: BriefingSection;
    revenue: BriefingSection;
    housekeeping: BriefingSection;
    maintenance: BriefingSection;
    finance: BriefingSection;
    guests: BriefingSection;
  };
  top_actions: PriorityAction[];
  health_score: HealthScore;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECTION_ORDER = [
  "occupancy",
  "revenue",
  "housekeeping",
  "maintenance",
  "finance",
  "guests",
] as const;

const SECTION_ICONS: Record<string, React.ElementType> = {
  occupancy: Building2,
  revenue: DollarSign,
  housekeeping: Sparkles,
  maintenance: Wrench,
  finance: Wallet,
  guests: Users,
};

function getGreetingIcon() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return <Sun className="h-7 w-7 text-[#22D3EE]" />;
  if (hour >= 12 && hour < 18) return <Sunset className="h-7 w-7 text-[#22D3EE]" />;
  return <Moon className="h-7 w-7 text-[#22D3EE]" />;
}

function getHealthLabel(score: number): { label: string; color: string } {
  if (score >= 85) return { label: "Excellent", color: "bg-status-success/10 text-status-success" };
  if (score >= 70) return { label: "Good", color: "bg-status-info/10 text-status-info" };
  if (score >= 50) return { label: "Attention needed", color: "bg-status-warning/10 text-status-warning" };
  return { label: "Critical", color: "bg-status-error/10 text-status-error" };
}

function priorityClasses(priority: string) {
  switch (priority) {
    case "high":
      return "border-status-error/40 bg-status-error/5 hover:border-status-error/60";
    case "medium":
      return "border-yellow-500/40 bg-yellow-500/5 hover:border-yellow-500/60";
    default:
      return "border-bastet-border hover:border-bastet-gold/30";
  }
}

function priorityDotColor(priority: string) {
  switch (priority) {
    case "high":
      return "bg-status-error";
    case "medium":
      return "bg-yellow-500";
    default:
      return "bg-text-muted";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BriefingPage() {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBriefing = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch("/api/v1/briefing");
      const json = await res.json();
      setData(json.data);
    } catch {
      // Fail gracefully
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[#22D3EE]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-text-secondary">Unable to load briefing.</p>
        <Button variant="secondary" onClick={() => fetchBriefing()}>
          Retry
        </Button>
      </div>
    );
  }

  const health = data.health_score || { overall: 0, dimensions: {} };
  const healthMeta = getHealthLabel(health.overall || 0);
  const actions = (data.top_actions || []).slice(0, 5);
  const arrivalItem = data.sections.guests?.items?.find((i) =>
    /arrival/i.test(i.text)
  );
  const departureItem = data.sections.guests?.items?.find((i) =>
    /departure/i.test(i.text)
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-8 pb-12">
      {/* ----------------------------------------------------------------- */}
      {/* 1. Greeting Header                                                */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getGreetingIcon()}
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              {data.greeting}
            </h1>
            <p className="text-sm text-text-secondary">
              {data.date} &middot; {data.property}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fetchBriefing(true)}
          disabled={refreshing}
        >
          <RefreshCw
            className={cn("h-4 w-4 mr-1.5", refreshing && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 2. Health Score + Summary (2-col)                                  */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left — Health Score */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">
                Property Health
              </h2>
              <Badge className={healthMeta.color}>{healthMeta.label}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 mb-6">
              <span className="text-5xl font-extrabold text-[#22D3EE]">
                {health.overall}
              </span>
              <span className="text-lg text-text-secondary mb-1">/100</span>
            </div>
            <div className="space-y-3">
              {Object.entries(health.dimensions || {}).map(([key, value]) => (
                <div key={key}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-text-secondary capitalize">
                      {key.replace(/_/g, " ")}
                    </span>
                    <span className="text-text-primary font-medium">
                      {value}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-bastet-border rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#22D3EE] transition-all duration-500"
                      style={{ width: `${Math.min(value, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Right — Today's Summary */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">
              Today&apos;s Summary
            </h2>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Actions pending */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-[#22D3EE]/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-[#22D3EE]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">
                  {actions.length}
                </p>
                <p className="text-xs text-text-secondary">Actions pending</p>
              </div>
            </div>

            {/* Quick stats row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-bastet-border/30 p-3">
                <p className="text-xs text-text-secondary mb-0.5">Arrivals</p>
                <p className="text-lg font-semibold text-text-primary">
                  {arrivalItem
                    ? arrivalItem.text.match(/\d+/)?.[0] ?? "--"
                    : "--"}
                </p>
              </div>
              <div className="rounded-lg bg-bastet-border/30 p-3">
                <p className="text-xs text-text-secondary mb-0.5">
                  Departures
                </p>
                <p className="text-lg font-semibold text-text-primary">
                  {departureItem
                    ? departureItem.text.match(/\d+/)?.[0] ?? "--"
                    : "--"}
                </p>
              </div>
            </div>

            {/* Occupancy headline */}
            {data.sections.occupancy?.items?.[0] && (
              <div className="text-sm text-text-secondary">
                {data.sections.occupancy.items[0].text}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 3. Priority Actions                                               */}
      {/* ----------------------------------------------------------------- */}
      {actions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">
            Priority Actions
          </h2>
          <div className="space-y-2">
            {actions.map((action, idx) => (
              <Link key={idx} href={action.link}>
                <Card
                  hover
                  className={cn(
                    "flex items-center gap-4 px-5 py-3 border transition-colors",
                    priorityClasses(action.priority)
                  )}
                >
                  {/* Number badge */}
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-bastet-border text-xs font-bold text-text-primary shrink-0">
                    {idx + 1}
                  </span>
                  {/* Dot */}
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full shrink-0",
                      priorityDotColor(action.priority)
                    )}
                  />
                  {/* Text */}
                  <span className="text-sm text-text-primary flex-1">
                    {action.text}
                  </span>
                  <ChevronRight className="h-4 w-4 text-text-muted shrink-0" />
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 4. Section Cards (2-col grid)                                     */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {SECTION_ORDER.map((key) => {
          const section = data.sections[key];
          if (!section) return null;
          const Icon = SECTION_ICONS[key] ?? Building2;
          return (
            <Card key={key}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-[#22D3EE]" />
                  <h3 className="text-sm font-semibold text-text-primary">
                    {section.title}
                  </h3>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {section.items.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-text-secondary"
                    >
                      {/* Trend / Alert indicator */}
                      {item.alert ? (
                        <AlertTriangle className="h-4 w-4 text-status-error shrink-0 mt-0.5" />
                      ) : item.trend === "up" ? (
                        <TrendingUp className="h-4 w-4 text-status-success shrink-0 mt-0.5" />
                      ) : item.trend === "down" ? (
                        <TrendingDown className="h-4 w-4 text-status-error shrink-0 mt-0.5" />
                      ) : (
                        <span className="h-4 w-4 shrink-0" />
                      )}
                      <span className={cn(item.alert && "text-status-error font-medium")}>
                        {item.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 5. Footer                                                         */}
      {/* ----------------------------------------------------------------- */}
      <p className="text-center text-xs text-text-muted pt-4">
        Briefing generated by HospitAI
      </p>
    </div>
  );
}
