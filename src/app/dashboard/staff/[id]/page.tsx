"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Edit,
  Loader2,
  Mail,
  Phone,
  Calendar,
  Clock,
  Plus,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { SHIFT_TYPES } from "@/lib/constants";
import type { Staff, StaffSchedule } from "@/types";

type TabId = "profile" | "schedule";

const TABS: { id: TabId; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "schedule", label: "Schedule" },
];

export default function StaffDetailPage() {
  const params = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [schedules, setSchedules] = useState<StaffSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  // Schedule form
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [shiftStart, setShiftStart] = useState("08:00");
  const [shiftEnd, setShiftEnd] = useState("16:00");
  const [shiftType, setShiftType] = useState("regular");
  const [scheduleNotes, setScheduleNotes] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/staff/${params.id}`);
      const json = await res.json();
      setStaff(json.data);
    } catch {
      setStaff(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchSchedules = async () => {
    try {
      const res = await fetch(`/api/v1/staff/${params.id}/schedule`);
      const json = await res.json();
      setSchedules(json.data || []);
    } catch {
      setSchedules([]);
    }
  };

  useEffect(() => {
    fetchStaff();
    fetchSchedules();
  }, [params.id]);

  const handleToggleActive = async () => {
    if (!staff) return;
    const res = await fetch(`/api/v1/staff/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !staff.is_active }),
    });
    if (res.ok) fetchStaff();
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSchedule(true);
    try {
      const res = await fetch(`/api/v1/staff/${params.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: scheduleDate,
          shift_start: shiftStart,
          shift_end: shiftEnd,
          shift_type: shiftType,
          notes: scheduleNotes || null,
        }),
      });
      if (res.ok) {
        setShowScheduleForm(false);
        setScheduleDate("");
        setScheduleNotes("");
        fetchSchedules();
      }
    } finally {
      setSavingSchedule(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-bastet-gold" />
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="text-center py-24">
        <p className="text-text-secondary">Staff member not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/staff" className="p-2 rounded-lg hover:bg-bastet-card transition-colors">
            <ArrowLeft className="w-5 h-5 text-text-secondary" />
          </Link>
          <div>
            <h1 className="text-2xl font-display font-bold text-text-primary">
              {staff.first_name} {staff.last_name}
            </h1>
            <p className="text-sm text-text-secondary mt-1 capitalize">{staff.role}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleToggleActive}>
            {staff.is_active ? "Deactivate" : "Activate"}
          </Button>
          <Link href={`/dashboard/staff/${staff.id}/edit`}>
            <Button>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-bastet-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-bastet-gold text-bastet-gold"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "profile" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Contact Information</h3>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-text-muted" />
                    <span className="text-sm text-text-primary">{staff.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-text-muted" />
                    <span className="text-sm text-text-primary">{staff.phone || "—"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Details</h3>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-y-4">
                  <div>
                    <p className="text-xs text-text-muted">Role</p>
                    <Badge status={staff.role} variant="status">{staff.role}</Badge>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Department</p>
                    <p className="text-sm text-text-primary capitalize">{staff.department || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Language</p>
                    <p className="text-sm text-text-primary uppercase">{staff.language}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Hire Date</p>
                    <p className="text-sm text-text-primary">
                      {staff.hire_date ? formatDate(staff.hire_date) : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <CardContent className="py-6">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-bastet-gold/10 flex items-center justify-center mx-auto mb-3">
                    <span className="text-xl font-bold text-bastet-gold">
                      {staff.first_name[0]}{staff.last_name[0]}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-text-primary">
                    {staff.first_name} {staff.last_name}
                  </p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-2 ${
                    staff.is_active
                      ? "bg-status-success/10 text-status-success"
                      : "bg-status-error/10 text-status-error"
                  }`}>
                    {staff.is_active ? "Active" : "Inactive"}
                  </span>
                  <p className="text-xs text-text-muted mt-3">
                    Member since {formatDate(staff.created_at)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "schedule" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-text-primary">Shift Schedule</h3>
            <Button size="sm" onClick={() => setShowScheduleForm(!showScheduleForm)}>
              <Plus className="w-4 h-4 mr-1" />
              Add Shift
            </Button>
          </div>

          {showScheduleForm && (
            <Card>
              <CardContent className="py-4">
                <form onSubmit={handleAddSchedule} className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                  <Input label="Date" type="date" id="schedDate" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} required />
                  <Input label="Start" type="time" id="shiftStart" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} required />
                  <Input label="End" type="time" id="shiftEnd" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} required />
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Type</label>
                    <select
                      value={shiftType}
                      onChange={(e) => setShiftType(e.target.value)}
                      className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                    >
                      {SHIFT_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit" disabled={savingSchedule} size="sm">
                    {savingSchedule ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              {schedules.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <Calendar className="w-8 h-8 text-text-muted mb-2" />
                  <p className="text-sm text-text-secondary">No shifts scheduled</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-bastet-border">
                      <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Date</th>
                      <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Time</th>
                      <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Type</th>
                      <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Status</th>
                      <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((sched) => (
                      <tr key={sched.id} className="border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50">
                        <td className="px-6 py-3 text-sm text-text-primary">{formatDate(sched.date)}</td>
                        <td className="px-6 py-3 text-sm font-mono text-text-secondary">
                          <Clock className="w-3.5 h-3.5 inline mr-1" />
                          {sched.shift_start} — {sched.shift_end}
                        </td>
                        <td className="px-6 py-3">
                          <Badge status={sched.shift_type} variant="status">{sched.shift_type}</Badge>
                        </td>
                        <td className="px-6 py-3">
                          <Badge status={sched.status} variant="status" />
                        </td>
                        <td className="px-6 py-3 text-sm text-text-secondary">{sched.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
