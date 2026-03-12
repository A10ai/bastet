"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Eye, Filter } from "lucide-react";
import { APARTMENT_STATUSES } from "@/lib/constants";
import type { ApartmentStatus, ApartmentViewType } from "@/types";

// Mock data — will be replaced with API calls once Supabase is connected
const MOCK_APARTMENTS = [
  { id: "1", number: "A101", floor: 1, building: "Block A", type: "Studio", status: "available" as ApartmentStatus, view_type: "garden" as ApartmentViewType, bedrooms: 0, max_occ: 2 },
  { id: "2", number: "A102", floor: 1, building: "Block A", type: "1-Bed", status: "occupied" as ApartmentStatus, view_type: "pool" as ApartmentViewType, bedrooms: 1, max_occ: 3 },
  { id: "3", number: "A201", floor: 2, building: "Block A", type: "2-Bed", status: "available" as ApartmentStatus, view_type: "sea" as ApartmentViewType, bedrooms: 2, max_occ: 5 },
  { id: "4", number: "A202", floor: 2, building: "Block A", type: "Studio", status: "cleaning" as ApartmentStatus, view_type: "garden" as ApartmentViewType, bedrooms: 0, max_occ: 2 },
  { id: "5", number: "A301", floor: 3, building: "Block A", type: "1-Bed", status: "occupied" as ApartmentStatus, view_type: "partial_sea" as ApartmentViewType, bedrooms: 1, max_occ: 3 },
  { id: "6", number: "B101", floor: 1, building: "Block B", type: "Studio", status: "available" as ApartmentStatus, view_type: "pool" as ApartmentViewType, bedrooms: 0, max_occ: 2 },
  { id: "7", number: "B102", floor: 1, building: "Block B", type: "2-Bed", status: "maintenance" as ApartmentStatus, view_type: "city" as ApartmentViewType, bedrooms: 2, max_occ: 5 },
  { id: "8", number: "B201", floor: 2, building: "Block B", type: "1-Bed", status: "occupied" as ApartmentStatus, view_type: "sea" as ApartmentViewType, bedrooms: 1, max_occ: 3 },
  { id: "9", number: "B202", floor: 2, building: "Block B", type: "Penthouse", status: "available" as ApartmentStatus, view_type: "sea" as ApartmentViewType, bedrooms: 3, max_occ: 4 },
  { id: "10", number: "C101", floor: 1, building: "Block C", type: "Studio", status: "blocked" as ApartmentStatus, view_type: "garden" as ApartmentViewType, bedrooms: 0, max_occ: 2 },
  { id: "11", number: "C102", floor: 1, building: "Block C", type: "1-Bed", status: "occupied" as ApartmentStatus, view_type: "pool" as ApartmentViewType, bedrooms: 1, max_occ: 3 },
  { id: "12", number: "C201", floor: 2, building: "Block C", type: "2-Bed", status: "available" as ApartmentStatus, view_type: "sea" as ApartmentViewType, bedrooms: 2, max_occ: 5 },
];

export default function ApartmentsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered =
    statusFilter === "all"
      ? MOCK_APARTMENTS
      : MOCK_APARTMENTS.filter((a) => a.status === statusFilter);

  const statusCounts = APARTMENT_STATUSES.reduce(
    (acc, s) => {
      acc[s] = MOCK_APARTMENTS.filter((a) => a.status === s).length;
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
            {MOCK_APARTMENTS.length} apartments across 3 buildings
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
          All ({MOCK_APARTMENTS.length})
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
          <table className="w-full">
            <thead>
              <tr className="border-b border-bastet-border">
                <th className="text-left text-xs font-medium text-text-muted px-6 py-3">
                  Number
                </th>
                <th className="text-left text-xs font-medium text-text-muted px-6 py-3">
                  Building
                </th>
                <th className="text-left text-xs font-medium text-text-muted px-6 py-3">
                  Type
                </th>
                <th className="text-left text-xs font-medium text-text-muted px-6 py-3">
                  Floor
                </th>
                <th className="text-left text-xs font-medium text-text-muted px-6 py-3">
                  View
                </th>
                <th className="text-left text-xs font-medium text-text-muted px-6 py-3">
                  Bedrooms
                </th>
                <th className="text-left text-xs font-medium text-text-muted px-6 py-3">
                  Status
                </th>
                <th className="text-right text-xs font-medium text-text-muted px-6 py-3">
                  Actions
                </th>
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
                    {apt.building}
                  </td>
                  <td className="px-6 py-3 text-sm text-text-primary">
                    {apt.type}
                  </td>
                  <td className="px-6 py-3 text-sm font-mono text-text-secondary">
                    {apt.floor}
                  </td>
                  <td className="px-6 py-3 text-sm text-text-secondary capitalize">
                    {apt.view_type.replace("_", " ")}
                  </td>
                  <td className="px-6 py-3 text-sm font-mono text-text-secondary">
                    {apt.bedrooms}
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
          {filtered.length === 0 && (
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
