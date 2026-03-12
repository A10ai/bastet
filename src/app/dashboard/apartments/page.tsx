"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Eye, Filter, Loader2 } from "lucide-react";
import { APARTMENT_STATUSES } from "@/lib/constants";
import type { Apartment } from "@/types";

export default function ApartmentsPage() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    const fetchApartments = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/apartments");
        const json = await res.json();
        setApartments(json.data || []);
      } catch {
        setApartments([]);
      } finally {
        setLoading(false);
      }
    };
    fetchApartments();
  }, []);

  const filtered =
    statusFilter === "all"
      ? apartments
      : apartments.filter((a) => a.status === statusFilter);

  const statusCounts = APARTMENT_STATUSES.reduce(
    (acc, s) => {
      acc[s] = apartments.filter((a) => a.status === s).length;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">
            Apartments
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {apartments.length} apartments
          </p>
        </div>
        <Button>
          <Building2 className="w-4 h-4 mr-2" />
          Add Apartment
        </Button>
      </div>

      {/* Status Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            statusFilter === "all"
              ? "bg-bastet-gold text-bastet-bg"
              : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
          }`}
        >
          All ({apartments.length})
        </button>
        {APARTMENT_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              statusFilter === status
                ? "bg-bastet-gold text-bastet-bg"
                : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
            }`}
          >
            {status.replace("_", " ")} ({statusCounts[status] || 0})
          </button>
        ))}
      </div>

      {/* Apartments Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-bastet-gold" />
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-bastet-border">
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Number</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Building</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Type</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Floor</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">View</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Bedrooms</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-text-muted px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((apt) => (
                  <tr
                    key={apt.id}
                    className="border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50 transition-colors"
                  >
                    <td className="px-6 py-3">
                      <span className="text-sm font-mono font-semibold text-bastet-gold">
                        {apt.number}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-text-primary">
                      {apt.building?.name || "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-text-primary">
                      {apt.apartment_type?.name || "—"}
                    </td>
                    <td className="px-6 py-3 text-sm font-mono text-text-secondary">
                      {apt.floor}
                    </td>
                    <td className="px-6 py-3 text-sm text-text-secondary capitalize">
                      {apt.view_type.replace("_", " ")}
                    </td>
                    <td className="px-6 py-3 text-sm font-mono text-text-secondary">
                      {apt.apartment_type?.bedrooms ?? "—"}
                    </td>
                    <td className="px-6 py-3">
                      <Badge status={apt.status} variant="status" />
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        href={`/dashboard/apartments/${apt.id}`}
                        className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-bastet-gold transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <Filter className="w-8 h-8 text-text-muted mb-2" />
              <p className="text-sm text-text-secondary">
                No apartments match the current filter
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
