"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookingStatusActions } from "@/components/bookings/booking-status-actions";
import { BookingFinancialSummary } from "@/components/bookings/booking-financial-summary";
import {
  ArrowLeft,
  CalendarDays,
  User,
  Moon,
  Loader2,
  MessageSquare,
  Clock,
} from "lucide-react";
import { formatDate, timeAgo } from "@/lib/utils";
import type { Booking } from "@/types";

export default function BookingDetailPage() {
  const params = useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBooking = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/bookings/${params.id}`);
      const json = await res.json();
      setBooking(json.data);
    } catch {
      setBooking(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooking();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-bastet-gold" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="text-center py-24">
        <p className="text-text-secondary">Booking not found</p>
        <Link
          href="/dashboard/bookings"
          className="text-bastet-gold hover:underline text-sm mt-2 inline-block"
        >
          Back to bookings
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/bookings"
          className="p-2 rounded-lg hover:bg-bastet-card transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold text-text-primary font-mono">
              {booking.reference}
            </h1>
            <Badge status={booking.status} variant="status" />
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Created {timeAgo(booking.created_at)}
          </p>
        </div>
        <BookingStatusActions
          bookingId={booking.id}
          status={booking.status}
          onActionComplete={fetchBooking}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="flex items-center gap-3 py-3">
                <CalendarDays className="w-5 h-5 text-bastet-gold" />
                <div>
                  <p className="text-xs text-text-muted">Check-in</p>
                  <p className="text-sm font-semibold text-text-primary">
                    {formatDate(booking.check_in)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-3">
                <CalendarDays className="w-5 h-5 text-bastet-gold" />
                <div>
                  <p className="text-xs text-text-muted">Check-out</p>
                  <p className="text-sm font-semibold text-text-primary">
                    {formatDate(booking.check_out)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-3">
                <Moon className="w-5 h-5 text-bastet-gold" />
                <div>
                  <p className="text-xs text-text-muted">Nights</p>
                  <p className="text-lg font-mono font-bold text-text-primary">
                    {booking.nights}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-3">
                <User className="w-5 h-5 text-bastet-gold" />
                <div>
                  <p className="text-xs text-text-muted">Guests</p>
                  <p className="text-sm font-semibold text-text-primary">
                    {booking.adults}A {booking.children > 0 ? `${booking.children}C ` : ""}
                    {booking.infants > 0 ? `${booking.infants}I` : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Guest Info */}
          {booking.guest && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Guest</h3>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-text-muted">Name</p>
                    <Link
                      href={`/dashboard/guests/${booking.guest.id}`}
                      className="text-sm text-bastet-gold hover:underline mt-0.5 inline-block"
                    >
                      {booking.guest.first_name} {booking.guest.last_name}
                    </Link>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Email</p>
                    <p className="text-sm text-text-primary mt-0.5">
                      {booking.guest.email || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Loyalty Tier</p>
                    <p className="text-sm text-text-primary mt-0.5 capitalize">
                      {booking.guest.loyalty_tier}
                      {booking.guest.vip_status && (
                        <span className="ml-1 text-bastet-gold text-xs">VIP</span>
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Apartment Info */}
          {booking.apartment && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Apartment</h3>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-text-muted">Number</p>
                    <Link
                      href={`/dashboard/apartments/${booking.apartment.id}`}
                      className="text-sm font-mono text-bastet-gold hover:underline mt-0.5 inline-block"
                    >
                      {booking.apartment.number}
                    </Link>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Building</p>
                    <p className="text-sm text-text-primary mt-0.5">
                      {booking.apartment.building?.name || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Type</p>
                    <p className="text-sm text-text-primary mt-0.5">
                      {booking.apartment.apartment_type?.name || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Floor</p>
                    <p className="text-sm font-mono text-text-primary mt-0.5">
                      {booking.apartment.floor}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">View</p>
                    <p className="text-sm text-text-primary mt-0.5 capitalize">
                      {booking.apartment.view_type?.replace("_", " ")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Special Requests / Notes */}
          {(booking.special_requests || booking.internal_notes) && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Notes</h3>
              </CardHeader>
              <CardContent className="space-y-4">
                {booking.special_requests && (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="w-3.5 h-3.5 text-text-muted" />
                      <p className="text-xs text-text-muted">Special Requests</p>
                    </div>
                    <p className="text-sm text-text-secondary">
                      {booking.special_requests}
                    </p>
                  </div>
                )}
                {booking.internal_notes && (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-3.5 h-3.5 text-text-muted" />
                      <p className="text-xs text-text-muted">Internal Notes</p>
                    </div>
                    <p className="text-sm text-text-secondary">
                      {booking.internal_notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Timeline</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <TimelineItem
                  label="Created"
                  date={booking.created_at}
                />
                {booking.status !== "pending" && booking.status !== "cancelled" && (
                  <TimelineItem
                    label="Confirmed"
                    date={booking.updated_at}
                  />
                )}
                {booking.checked_in_at && (
                  <TimelineItem
                    label="Checked In"
                    date={booking.checked_in_at}
                  />
                )}
                {booking.checked_out_at && (
                  <TimelineItem
                    label="Checked Out"
                    date={booking.checked_out_at}
                  />
                )}
                {booking.cancelled_at && (
                  <TimelineItem
                    label="Cancelled"
                    date={booking.cancelled_at}
                    detail={booking.cancellation_reason || undefined}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <BookingFinancialSummary
            ratePerNight={booking.rate_per_night_gbp}
            nights={booking.nights}
            discountPercentage={booking.discount_percentage}
            totalAmountGbp={booking.total_amount_gbp}
            totalAmountGuestCurrency={booking.total_amount_guest_currency}
            guestCurrency={booking.guest_currency}
            channelName={booking.channel?.name}
            channelCommission={booking.channel?.commission_rate}
          />

          {/* Channel */}
          {booking.channel && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Channel</h3>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Source</span>
                  <span className="text-text-primary">{booking.channel.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Code</span>
                  <span className="font-mono text-text-primary">{booking.channel.code}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineItem({
  label,
  date,
  detail,
}: {
  label: string;
  date: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-2 h-2 rounded-full bg-bastet-gold mt-1.5 shrink-0" />
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{label}</span>
          <span className="text-xs text-text-muted">{formatDate(date, "dd MMM yyyy HH:mm")}</span>
        </div>
        {detail && <p className="text-xs text-text-secondary mt-0.5">{detail}</p>}
      </div>
    </div>
  );
}
