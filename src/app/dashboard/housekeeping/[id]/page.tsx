"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  Play,
  CheckCircle,
  ShieldCheck,
  ShieldX,
  UserPlus,
} from "lucide-react";
import { formatDate, timeAgo } from "@/lib/utils";
import type { HousekeepingTask, Staff } from "@/types";

export default function HousekeepingDetailPage() {
  const params = useParams();
  const [task, setTask] = useState<HousekeepingTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Assign form
  const [showAssign, setShowAssign] = useState(false);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaff, setSelectedStaff] = useState("");

  const fetchTask = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/housekeeping/${params.id}`);
      const json = await res.json();
      setTask(json.data);
    } catch {
      setTask(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTask();
  }, [params.id]);

  const fetchStaff = async () => {
    const res = await fetch("/api/v1/staff?is_active=true");
    const json = await res.json();
    setStaffList(
      (json.data || []).filter(
        (s: Staff) => s.role === "housekeeping" || s.role === "manager"
      )
    );
  };

  const handleAssign = async () => {
    if (!selectedStaff) return;
    setActionLoading(true);
    try {
      await fetch(`/api/v1/housekeeping/${params.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: selectedStaff }),
      });
      setShowAssign(false);
      fetchTask();
    } finally {
      setActionLoading(false);
    }
  };

  const handleAction = async (action: string, body?: object) => {
    setActionLoading(true);
    try {
      await fetch(`/api/v1/housekeeping/${params.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      fetchTask();
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-bastet-gold" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-24">
        <p className="text-text-secondary">Task not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/housekeeping" className="p-2 rounded-lg hover:bg-bastet-card transition-colors">
            <ArrowLeft className="w-5 h-5 text-text-secondary" />
          </Link>
          <div>
            <h1 className="text-2xl font-display font-bold text-text-primary">
              Housekeeping Task
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              {task.apartment?.number ? `Apt ${task.apartment.number}` : ""} — {task.type.replace("_", " ")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="status" status={task.priority}>{task.priority}</Badge>
          <Badge variant="status" status={task.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Action Buttons */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-wrap gap-2">
                {(task.status === "pending" || task.status === "assigned") && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setShowAssign(true);
                      fetchStaff();
                    }}
                    disabled={actionLoading}
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    {task.status === "assigned" ? "Reassign" : "Assign"}
                  </Button>
                )}
                {task.status === "assigned" && (
                  <Button size="sm" onClick={() => handleAction("start")} disabled={actionLoading}>
                    <Play className="w-4 h-4 mr-1" />
                    Start
                  </Button>
                )}
                {task.status === "in_progress" && (
                  <Button size="sm" onClick={() => handleAction("complete")} disabled={actionLoading}>
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Complete
                  </Button>
                )}
                {task.status === "completed" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => handleAction("verify", { passed: true })}
                      disabled={actionLoading}
                    >
                      <ShieldCheck className="w-4 h-4 mr-1" />
                      Verify (Pass)
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleAction("verify", { passed: false, notes: "Issue found during inspection" })}
                      disabled={actionLoading}
                    >
                      <ShieldX className="w-4 h-4 mr-1" />
                      Verify (Fail)
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Assign Form */}
          {showAssign && (
            <Card>
              <CardContent className="py-4">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">
                      Assign to Staff
                    </label>
                    <select
                      value={selectedStaff}
                      onChange={(e) => setSelectedStaff(e.target.value)}
                      className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                    >
                      <option value="">Select staff member...</option>
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.first_name} {s.last_name} ({s.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button size="sm" onClick={handleAssign} disabled={!selectedStaff || actionLoading}>
                    Assign
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setShowAssign(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Details */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Details</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-y-4">
                <div>
                  <p className="text-xs text-text-muted">Type</p>
                  <p className="text-sm text-text-primary capitalize">{task.type.replace("_", " ")}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Priority</p>
                  <Badge variant="status" status={task.priority} />
                </div>
                <div>
                  <p className="text-xs text-text-muted">Scheduled Date</p>
                  <p className="text-sm text-text-primary">{formatDate(task.scheduled_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Status</p>
                  <Badge variant="status" status={task.status} />
                </div>
              </div>
              {task.notes && (
                <div className="mt-4 pt-4 border-t border-bastet-border">
                  <p className="text-xs text-text-muted mb-1">Notes</p>
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{task.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Timeline</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-text-muted" />
                  <span className="text-text-secondary">Created {timeAgo(task.created_at)}</span>
                </div>
                {task.started_at && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-bastet-gold" />
                    <span className="text-text-secondary">Started {timeAgo(task.started_at)}</span>
                  </div>
                )}
                {task.completed_at && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-status-success" />
                    <span className="text-text-secondary">Completed {timeAgo(task.completed_at)}</span>
                  </div>
                )}
                {task.verified_at && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className={`w-2 h-2 rounded-full ${task.status === "verified" ? "bg-status-success" : "bg-status-error"}`} />
                    <span className="text-text-secondary">
                      {task.status === "verified" ? "Verified" : "Issue found"} {timeAgo(task.verified_at)}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Apartment</h3>
            </CardHeader>
            <CardContent>
              {task.apartment ? (
                <div className="space-y-2">
                  <p className="text-sm font-mono font-semibold text-bastet-gold">{task.apartment.number}</p>
                  <p className="text-sm text-text-secondary">Floor {task.apartment.floor}</p>
                  {task.apartment.building && (
                    <p className="text-sm text-text-secondary">{task.apartment.building.name}</p>
                  )}
                  <Link
                    href={`/dashboard/apartments/${task.apartment_id}`}
                    className="text-xs text-bastet-gold hover:underline"
                  >
                    View apartment
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-text-secondary">—</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Assigned Staff</h3>
            </CardHeader>
            <CardContent>
              {task.assigned_staff ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-text-primary">
                    {task.assigned_staff.first_name} {task.assigned_staff.last_name}
                  </p>
                  <Badge variant="status" status={task.assigned_staff.role}>
                    {task.assigned_staff.role}
                  </Badge>
                  <Link
                    href={`/dashboard/staff/${task.assigned_to}`}
                    className="block text-xs text-bastet-gold hover:underline"
                  >
                    View profile
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-text-secondary">Unassigned</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
