"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Loader2,
  Send,
  PlaneTakeoff,
  PlaneLanding,
  Mail,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabType = "arrivals" | "departures" | "compose" | "history";

interface OverviewData {
  arrivals_today: number;
  departures_today: number;
  arrivals_tomorrow: number;
  messages_sent_7d: number;
}

interface GuestRow {
  id: string;
  guest_name: string;
  apartment: string;
  check_in_date: string;
  nights: number;
  channel: string;
  status: string;
}

interface Template {
  id: string;
  name: string;
  slug: string;
  subject: string;
  body: string;
}

interface GuestOption {
  id: string;
  name: string;
  apartment?: string;
}

interface HistoryItem {
  id: string;
  timestamp: string;
  guest_name: string;
  subject: string;
  channel: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS: { key: TabType; label: string }[] = [
  { key: "arrivals", label: "Today's Arrivals" },
  { key: "departures", label: "Today's Departures" },
  { key: "compose", label: "Compose" },
  { key: "history", label: "History" },
];

const CHANNEL_OPTIONS = [
  { key: "email", label: "Email", icon: Mail },
  { key: "sms", label: "SMS", icon: Smartphone },
  { key: "whatsapp", label: "WhatsApp", icon: MessageSquare },
] as const;

const CHANNEL_COLORS: Record<string, string> = {
  email: "bg-cyan-500/15 text-cyan-400 border border-cyan-400/20",
  sms: "bg-purple-500/15 text-purple-400 border border-purple-400/20",
  whatsapp: "bg-emerald-500/15 text-emerald-400 border border-emerald-400/20",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MessagingPage() {
  const [activeTab, setActiveTab] = useState<TabType>("arrivals");
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Arrivals / Departures
  const [arrivals, setArrivals] = useState<GuestRow[]>([]);
  const [arrivalsLoading, setArrivalsLoading] = useState(false);
  const [departures, setDepartures] = useState<GuestRow[]>([]);
  const [departuresLoading, setDeparturesLoading] = useState(false);

  // Compose
  const [templates, setTemplates] = useState<Template[]>([]);
  const [guests, setGuests] = useState<GuestOption[]>([]);
  const [selectedGuest, setSelectedGuest] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

  // History
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Fetch overview ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchOverview = async () => {
      setOverviewLoading(true);
      try {
        const res = await fetch("/api/v1/messaging?type=overview");
        const json = await res.json();
        setOverview(json.data || null);
      } catch {
        setOverview(null);
      } finally {
        setOverviewLoading(false);
      }
    };
    fetchOverview();
  }, []);

  // ── Fetch tab data ──────────────────────────────────────────────────
  const fetchArrivals = useCallback(async () => {
    setArrivalsLoading(true);
    try {
      const res = await fetch("/api/v1/messaging?type=arrivals");
      const json = await res.json();
      setArrivals(json.data || []);
    } catch {
      setArrivals([]);
    } finally {
      setArrivalsLoading(false);
    }
  }, []);

  const fetchDepartures = useCallback(async () => {
    setDeparturesLoading(true);
    try {
      const res = await fetch("/api/v1/messaging?type=departures");
      const json = await res.json();
      setDepartures(json.data || []);
    } catch {
      setDepartures([]);
    } finally {
      setDeparturesLoading(false);
    }
  }, []);

  const fetchCompose = useCallback(async () => {
    try {
      const [tRes, gRes] = await Promise.all([
        fetch("/api/v1/messaging?type=templates"),
        fetch("/api/v1/guests?status=checked_in"),
      ]);
      const tJson = await tRes.json();
      const gJson = await gRes.json();
      setTemplates(tJson.data || []);
      setGuests(
        (gJson.data || []).map((g: { id: string; first_name?: string; last_name?: string; apartment?: { name?: string } }) => ({
          id: g.id,
          name: [g.first_name, g.last_name].filter(Boolean).join(" ") || "Guest",
          apartment: g.apartment?.name,
        }))
      );
    } catch {
      setTemplates([]);
      setGuests([]);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/v1/messaging?type=history");
      const json = await res.json();
      setHistory(json.data || []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "arrivals") fetchArrivals();
    if (activeTab === "departures") fetchDepartures();
    if (activeTab === "compose") fetchCompose();
    if (activeTab === "history") fetchHistory();
  }, [activeTab, fetchArrivals, fetchDepartures, fetchCompose, fetchHistory]);

  // ── Compose helpers ─────────────────────────────────────────────────
  const handleTemplateChange = (slug: string) => {
    setSelectedTemplate(slug);
    const tpl = templates.find((t) => t.slug === slug);
    if (tpl) {
      setSubject(tpl.subject);
      setBody(tpl.body);
    }
  };

  const prefillCompose = (guestName: string, templateSlug: string) => {
    setActiveTab("compose");
    // Set guest by name match if available
    const match = guests.find((g) => g.name === guestName);
    if (match) setSelectedGuest(match.id);
    // Pre-select template
    const tpl = templates.find((t) => t.slug === templateSlug);
    if (tpl) {
      setSelectedTemplate(tpl.slug);
      setSubject(tpl.subject);
      setBody(tpl.body);
    } else {
      setSelectedTemplate(templateSlug);
    }
  };

  const handleSend = async () => {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/v1/messaging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_id: selectedGuest || undefined,
          channel,
          subject,
          body,
          template: selectedTemplate || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setSendResult({ ok: true, message: json.message || "Message sent successfully" });
        setSubject("");
        setBody("");
        setSelectedTemplate("");
        setSelectedGuest("");
      } else {
        setSendResult({ ok: false, message: json.error || "Failed to send message" });
      }
    } catch {
      setSendResult({ ok: false, message: "Network error — please try again" });
    } finally {
      setSending(false);
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────
  const Spinner = () => (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
    </div>
  );

  const renderOverviewCards = () => {
    const cards = [
      { label: "Arrivals Today", value: overview?.arrivals_today ?? "—", icon: PlaneLanding, color: "text-cyan-400" },
      { label: "Departures Today", value: overview?.departures_today ?? "—", icon: PlaneTakeoff, color: "text-purple-400" },
      { label: "Arrivals Tomorrow", value: overview?.arrivals_tomorrow ?? "—", icon: Clock, color: "text-amber-400" },
      { label: "Messages Sent (7d)", value: overview?.messages_sent_7d ?? "—", icon: Send, color: "text-emerald-400" },
    ];

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="flex items-center gap-4 py-5">
              <div className={cn("w-10 h-10 rounded-lg bg-bastet-gold/10 flex items-center justify-center", c.color)}>
                <c.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">{c.label}</p>
                <p className="text-2xl font-bold text-text-primary">
                  {overviewLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : c.value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderGuestTable = (
    rows: GuestRow[],
    loading: boolean,
    emptyMsg: string,
    actionLabel: string,
    templateSlug: string,
  ) => {
    if (loading) return <Spinner />;
    if (rows.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
          <Users className="w-10 h-10 mb-3 opacity-40" />
          <p>{emptyMsg}</p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bastet-border text-text-secondary text-left">
              <th className="pb-3 font-medium">Guest Name</th>
              <th className="pb-3 font-medium">Apartment</th>
              <th className="pb-3 font-medium">Check-in Date</th>
              <th className="pb-3 font-medium">Nights</th>
              <th className="pb-3 font-medium">Channel</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-bastet-border/50 hover:bg-bastet-card/50 transition-colors">
                <td className="py-3 text-text-primary font-medium">{row.guest_name}</td>
                <td className="py-3 text-text-secondary">{row.apartment}</td>
                <td className="py-3 text-text-secondary">{formatDate(row.check_in_date)}</td>
                <td className="py-3 text-text-secondary">{row.nights}</td>
                <td className="py-3">
                  <Badge className={CHANNEL_COLORS[row.channel?.toLowerCase()] || ""}>
                    {row.channel || "—"}
                  </Badge>
                </td>
                <td className="py-3">
                  <Badge status={row.status} variant="status" />
                </td>
                <td className="py-3 text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => prefillCompose(row.guest_name, templateSlug)}
                  >
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    {actionLabel}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCompose = () => (
    <div className="space-y-5 max-w-2xl">
      {/* Guest selector */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1.5">Guest</label>
        <select
          className="w-full bg-bastet-bg border border-bastet-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          value={selectedGuest}
          onChange={(e) => setSelectedGuest(e.target.value)}
        >
          <option value="">Select a guest...</option>
          {guests.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}{g.apartment ? ` — ${g.apartment}` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Template selector */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1.5">Template</label>
        <select
          className="w-full bg-bastet-bg border border-bastet-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          value={selectedTemplate}
          onChange={(e) => handleTemplateChange(e.target.value)}
        >
          <option value="">No template</option>
          {templates.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Channel selector */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1.5">Channel</label>
        <div className="flex gap-2">
          {CHANNEL_OPTIONS.map((ch) => (
            <button
              key={ch.key}
              type="button"
              onClick={() => setChannel(ch.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                channel === ch.key
                  ? "bg-cyan-500/15 text-cyan-400 border-cyan-400/30"
                  : "bg-bastet-card border-bastet-border text-text-secondary hover:text-text-primary"
              )}
            >
              <ch.icon className="w-4 h-4" />
              {ch.label}
            </button>
          ))}
        </div>
      </div>

      {/* Subject */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1.5">Subject</label>
        <input
          type="text"
          className="w-full bg-bastet-bg border border-bastet-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          placeholder="Message subject..."
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      {/* Body */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1.5">Message</label>
        <textarea
          rows={6}
          className="w-full bg-bastet-bg border border-bastet-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-400/40 resize-y"
          placeholder="Write your message..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      {/* Send button + feedback */}
      <div className="flex items-center gap-4">
        <Button
          onClick={handleSend}
          disabled={sending || (!subject && !body)}
        >
          {sending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Send Message
            </>
          )}
        </Button>

        {sendResult && (
          <div className={cn("flex items-center gap-2 text-sm", sendResult.ok ? "text-emerald-400" : "text-red-400")}>
            {sendResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {sendResult.message}
          </div>
        )}
      </div>
    </div>
  );

  const renderHistory = () => {
    if (historyLoading) return <Spinner />;
    if (history.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
          <MessageSquare className="w-10 h-10 mb-3 opacity-40" />
          <p>No messages sent yet</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {history.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-4 rounded-lg border border-bastet-border/50 hover:bg-bastet-card/50 transition-colors"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                <Send className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{item.subject}</p>
                <p className="text-xs text-text-secondary">
                  {item.guest_name} &middot; {formatDate(item.timestamp)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge className={CHANNEL_COLORS[item.channel?.toLowerCase()] || ""}>
                {item.channel}
              </Badge>
              {item.status && <Badge status={item.status} variant="status" />}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── Main render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <MessageSquare className="w-7 h-7 text-cyan-400" />
          <h1 className="text-2xl font-bold text-text-primary">Guest Messaging</h1>
        </div>
        <p className="text-text-secondary text-sm ml-10">
          Pre-arrival, check-in, and post-stay communications
        </p>
      </div>

      {/* Overview Cards */}
      {renderOverviewCards()}

      {/* Tab System */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-1 flex-wrap">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  activeTab === tab.key
                    ? "bg-bastet-gold/10 text-bastet-gold"
                    : "text-text-secondary hover:text-text-primary hover:bg-bastet-card"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {activeTab === "arrivals" &&
            renderGuestTable(arrivals, arrivalsLoading, "No arrivals today", "Send Welcome", "check_in")}
          {activeTab === "departures" &&
            renderGuestTable(departures, departuresLoading, "No departures today", "Send Checkout", "check_out")}
          {activeTab === "compose" && renderCompose()}
          {activeTab === "history" && renderHistory()}
        </CardContent>
      </Card>
    </div>
  );
}
