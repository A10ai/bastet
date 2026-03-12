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
  Loader2,
  UserPlus,
  Play,
  CheckCircle,
  PauseCircle,
} from "lucide-react";
import { formatCurrency, timeAgo } from "@/lib/utils";
import type { MaintenanceRequest, Staff } from "@/types";

export default function MaintenanceDetailPage() {
  const params = useParams();
  const [req, setReq] = useState<MaintenanceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Assign form
  const [showAssign, setShowAssign] = useState(false);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaff, setSelectedStaff] = useState("");

  // Resolve form
  const [showResolve, setShowResolve] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [actualCost, setActualCost] = useState("");

  const fetchRequest = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/maintenance/${params.id}`);
      const json = await res.json();
      setReq(json.data);
    } catch {
      setReq(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequest();
  }, [params.id]);

  const fetchStaff = async () => {
    const res = await fetch("/api/v1/staff?is_active=true");
    const json = await res.json();
    setStaffList(
      (json.data || []).filter(
        (s: Staff) => s.role === "maintenance" || s.role === "manager"
      )
    );
  };

  const handleAssign = async () => {
    if (!selectedStaff) return;
    setActionLoading(true);
    try {
      await fetch(`/api/v1/maintenance/${params.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: selectedStaff }),
      });
      setShowAssign(false);
      fetchRequest();
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setActionLoading(true);
    try {
      await fetch(`/api/v1/maintenance/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchRequest();
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async () => {
    setActionLoading(true);
    try {
      await fetch(`/api/v1/maintenance/${params.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution_notes: resolutionNotes || null,
          actual_cost_gbp: actualCost ? parseFloat(actualCost) : null,
        }),
      });
      setShowResolve(false);
      fetchRequest();
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

  if (!req) {
    return (
      <div className="text-center py-24">
        <p className="text-text-secondary">Request not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/maintenance" className="p-2 rounded-lg hover:bg-bastet-card transition-colors">
            <ArrowLeft className="w-5 h-5 text-text-secondary" />
          </Link>
          <div>
            <h1 className="text-2xl font-display font-bold text-text-primary">{req.title}</h1>
            <p className="text-sm text-text-secondary mt-1 capitalize">{req.category} — Created {timeAgo(req.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="status" status={req.priority}>{req.priority}</Badge>
          <Badge variant="status" status={req.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Action Buttons */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-wrap gap-2">
                {["open", "assigned", "on_hold"].includes(req.status) && (
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
                    {req.assigned_to ? "Reassign" : "Assign"}
                  </Button>
                )}
                {req.status === "assigned" && (
                  <Button size="sm" onClick={() => handleStatusChange("in_progress")} disabled={actionLoading}>
                    <Play className="w-4 h-4 mr-1" />
                    Start
                  </Button>
                )}
                {["assigned", "in_progress"].includes(req.status) && (
                  <Button size="sm" variant="secondary" onClick={() => handleStatusChange("on_hold")} disabled={actionLoading}>
                    <PauseCircle className="w-4 h-4 mr-1" />
                    On Hold
                  </Button>
                )}
                {["assigned", "in_progress", "on_hold"].includes(req.status) && (
                  <Button size="sm" onClick={() => setShowResolve(true)} disabled={actionLoading}>
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Resolve
                  </Button>
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
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Assign to Staff</label>
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

          {/* Resolve Form */}
          {showResolve && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Resolve Request</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Resolution Notes</label>
                    <textarea
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                      placeholder="Describe what was done..."
                    />
                  </div>
                  <Input
                    label="Actual Cost (GBP)"
                    type="number"
                    id="actualCost"
                    value={actualCost}
                    onChange={(e) => setActualCost(e.target.value)}
                    min={0}
                    step="0.01"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleResolve} disabled={actionLoading}>
                      Resolve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setShowResolve(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Description */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Description</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{req.description}</p>
              {req.resolution_notes && (
                <div className="mt-4 pt-4 border-t border-bastet-border">
                  <p className="text-xs text-text-muted mb-1">Resolution Notes</p>
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{req.resolution_notes}</p>
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
                  <span className="text-text-secondary">Reported {timeAgo(req.created_at)}</span>
                </div>
                {req.started_at && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-bastet-gold" />
                    <span className="text-text-secondary">Started {timeAgo(req.started_at)}</span>
                  </div>
                )}
                {req.completed_at && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-status-success" />
                    <span className="text-text-secondary">Resolved {timeAgo(req.completed_at)}</span>
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
              {req.apartment ? (
                <div className="space-y-2">
                  <p className="text-sm font-mono font-semibold text-bastet-gold">{req.apartment.number}</p>
                  <p className="text-sm text-text-secondary">Floor {req.apartment.floor}</p>
                  {req.apartment.building && (
                    <p className="text-sm text-text-secondary">{req.apartment.building.name}</p>
                  )}
                  <Link
                    href={`/dashboard/apartments/${req.apartment_id}`}
                    className="text-xs text-bastet-gold hover:underline"
                  >
                    View apartment
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-text-secondary">No apartment linked</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Assigned Staff</h3>
            </CardHeader>
            <CardContent>
              {req.assigned_staff ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-text-primary">
                    {req.assigned_staff.first_name} {req.assigned_staff.last_name}
                  </p>
                  <Badge variant="status" status={req.assigned_staff.role}>
                    {req.assigned_staff.role}
                  </Badge>
                </div>
              ) : (
                <p className="text-sm text-text-secondary">Unassigned</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Cost</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-text-muted">Estimated</p>
                  <p className="text-sm text-text-primary">
                    {req.estimated_cost_gbp != null ? formatCurrency(req.estimated_cost_gbp) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Actual</p>
                  <p className="text-sm text-text-primary">
                    {req.actual_cost_gbp != null ? formatCurrency(req.actual_cost_gbp) : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
