"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Users, Loader2 } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { GROUP_STATUS_LABEL, type BookingGroup } from "@/lib/groups";
import { GroupForm } from "@/components/bookings/group-form";

type GroupRow = BookingGroup & { rooms_blocked: number; contract_total_gbp: number };

const STATUS_CLASS: Record<BookingGroup["status"], string> = {
  tentative: "bg-amber-500/15 text-amber-400",
  confirmed: "bg-status-success/15 text-status-success",
  cancelled: "bg-status-error/15 text-status-error",
  completed: "bg-brand-border text-text-secondary",
};

/** Group bookings: tour operator allotments, weddings and corporate blocks. */
export default function GroupsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const query = statusFilter === "all" ? "" : `?status=${statusFilter}`;
  const { data: rows, isLoading, mutate } = useApi<GroupRow[]>(`/api/v1/groups${query}`, undefined, ["booking_groups", "bookings"]);
  const groups = useMemo(() => rows ?? [], [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-text-muted mb-1">
            <Link href="/dashboard/bookings" className="hover:text-brand-accent">Bookings</Link>
            <span>/</span>
            <span className="text-text-secondary">Groups</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-text-primary">Group bookings</h1>
          <p className="text-sm text-text-secondary mt-1">{groups.length} group{groups.length === 1 ? "" : "s"}</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} data-testid="group-new">
          <Plus className="w-4 h-4 mr-2" /> New group
        </Button>
      </div>

      {showForm && (
        <GroupForm onCreated={(newId) => { setShowForm(false); mutate(); router.push(`/dashboard/bookings/groups/${newId}`); }} onCancel={() => setShowForm(false)} />
      )}

      <div className="flex gap-2 flex-wrap">
        {["all", "tentative", "confirmed", "completed", "cancelled"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${statusFilter === s ? "bg-brand-accent text-brand-bg border-brand-accent" : "border-brand-border text-text-secondary hover:text-text-primary"}`}>
            {s === "all" ? "All" : GROUP_STATUS_LABEL[s as BookingGroup["status"]]}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && groups.length === 0 ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-accent" /></div>
          ) : groups.length === 0 ? (
            <div className="py-16 text-center text-text-muted" data-testid="empty-state">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No group bookings yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="groups-table">
                <thead>
                  <tr className="border-b border-brand-border text-left text-xs uppercase tracking-wider text-text-muted">
                    <th className="py-3 px-4">Reference</th><th className="py-3 px-4">Group</th><th className="py-3 px-4">Dates</th><th className="py-3 px-4 text-right">Rooms</th><th className="py-3 px-4 text-right">Contract</th><th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.id} className="border-b border-brand-border/50 hover:bg-brand-bg/40">
                      <td className="py-3 px-4 font-mono"><Link href={`/dashboard/bookings/groups/${g.id}`} className="text-brand-accent hover:underline">{g.reference}</Link></td>
                      <td className="py-3 px-4 text-text-primary">{g.name}{g.organiser_name ? <span className="block text-xs text-text-muted">{g.organiser_name}{g.company ? ` · ${g.company}` : ""}</span> : null}</td>
                      <td className="py-3 px-4 text-text-secondary">{formatDate(g.check_in)} – {formatDate(g.check_out)}</td>
                      <td className="py-3 px-4 text-right text-text-primary">{g.rooms_blocked}<span className="text-text-muted"> / {g.rooms_requested || g.rooms_blocked}</span></td>
                      <td className="py-3 px-4 text-right font-mono text-text-primary">{formatCurrency(g.contract_total_gbp)}</td>
                      <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[g.status]}`}>{GROUP_STATUS_LABEL[g.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
