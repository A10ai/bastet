"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvailabilityCalendar } from "@/components/bookings/availability-calendar";
import {
  CalendarDays,
  Plus,
  Eye,
  Search,
  Filter,
  Loader2,
} from "lucide-react";
import { BOOKING_STATUSES } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Booking } from "@/types";

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);

      const res = await fetch(`/api/v1/bookings?${params}`);
      const json = await res.json();
      setBookings(json.data || []);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchBookings();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const statusCounts = BOOKING_STATUSES.reduce(
    (acc, s) => {
      acc[s] = bookings.filter((b) => b.status === s).length;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">
            Bookings
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {bookings.length} bookings found
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setShowCalendar(!showCalendar)}
          >
            <CalendarDays className="w-4 h-4 mr-2" />
            {showCalendar ? "Hide Calendar" : "Calendar"}
          </Button>
          <Link href="/dashboard/bookings/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Booking
            </Button>
          </Link>
        </div>
      </div>

      {showCalendar && <AvailabilityCalendar />}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search reference, guest..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-bastet-bg border border-bastet-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
          />
        </div>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-40 text-sm"
        />
        <span className="text-text-muted text-sm">to</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-40 text-sm"
        />
      </div>

      {/* Status Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            statusFilter === "all"
              ? "bg-bastet-gold text-bastet-bg"
              : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
          }`}
        >
          All ({bookings.length})
        </button>
        {BOOKING_STATUSES.map((status) => (
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

      {/* Table */}
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
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Reference</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Guest</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Apartment</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Check-in</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Check-out</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Nights</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Total</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-text-muted px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr
                    key={booking.id}
                    className="border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50 transition-colors"
                  >
                    <td className="px-6 py-3">
                      <span className="text-sm font-mono font-semibold text-bastet-gold">
                        {booking.reference}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-text-primary">
                      {booking.guest
                        ? `${booking.guest.first_name} ${booking.guest.last_name}`
                        : "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-text-secondary font-mono">
                      {booking.apartment?.number || "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-text-secondary">
                      {formatDate(booking.check_in)}
                    </td>
                    <td className="px-6 py-3 text-sm text-text-secondary">
                      {formatDate(booking.check_out)}
                    </td>
                    <td className="px-6 py-3 text-sm font-mono text-text-secondary">
                      {booking.nights}
                    </td>
                    <td className="px-6 py-3 text-sm font-mono text-text-primary">
                      {formatCurrency(booking.total_amount_gbp)}
                    </td>
                    <td className="px-6 py-3">
                      <Badge status={booking.status} variant="status" />
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        href={`/dashboard/bookings/${booking.id}`}
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
          {!loading && bookings.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <Filter className="w-8 h-8 text-text-muted mb-2" />
              <p className="text-sm text-text-secondary">
                No bookings match the current filters
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
