"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Bed,
  Bath,
  Maximize,
  Users,
  Thermometer,
  Lock,
  Wifi,
  Loader2,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Apartment, Booking } from "@/types";

export default function ApartmentDetailPage() {
  const params = useParams();
  const [apartment, setApartment] = useState<Apartment | null>(null);
  const [currentBooking, setCurrentBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch apartment
        const aptRes = await fetch(`/api/v1/apartments/${params.id}`);
        const aptJson = await aptRes.json();
        setApartment(aptJson.data);

        // Fetch current booking if apartment is occupied
        if (aptJson.data?.status === "occupied") {
          const bookRes = await fetch(
            `/api/v1/bookings?apartment_id=${params.id}&status=checked_in`
          );
          const bookJson = await bookRes.json();
          if (bookJson.data && bookJson.data.length > 0) {
            setCurrentBooking(bookJson.data[0]);
          }
        }
      } catch {
        setApartment(null);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-bastet-gold" />
      </div>
    );
  }

  if (!apartment) {
    return (
      <div className="text-center py-24">
        <p className="text-text-secondary">Apartment not found</p>
        <Link href="/dashboard/apartments" className="text-bastet-gold hover:underline text-sm mt-2 inline-block">
          Back to apartments
        </Link>
      </div>
    );
  }

  const aptType = apartment.apartment_type;
  const weeklyRate = aptType?.base_weekly_rate_gbp || 0;
  const nightlyRate = Math.round(weeklyRate / 7);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/apartments"
          className="p-2 rounded-lg hover:bg-bastet-card transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold text-text-primary">
              Apartment {apartment.number}
            </h1>
            <Badge status={apartment.status} variant="status" />
          </div>
          <p className="text-sm text-text-secondary mt-1">
            {apartment.building?.name || "—"} — Floor {apartment.floor} —{" "}
            {aptType?.name || "—"}
          </p>
        </div>
        <Button variant="secondary">Edit Apartment</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="flex items-center gap-3 py-3">
                <Bed className="w-5 h-5 text-bastet-gold" />
                <div>
                  <p className="text-lg font-mono font-bold text-text-primary">
                    {aptType?.bedrooms ?? "—"}
                  </p>
                  <p className="text-xs text-text-muted">Bedrooms</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-3">
                <Bath className="w-5 h-5 text-bastet-gold" />
                <div>
                  <p className="text-lg font-mono font-bold text-text-primary">
                    {aptType?.bathrooms ?? "—"}
                  </p>
                  <p className="text-xs text-text-muted">Bathrooms</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-3">
                <Maximize className="w-5 h-5 text-bastet-gold" />
                <div>
                  <p className="text-lg font-mono font-bold text-text-primary">
                    {aptType?.size_sqm ? `${aptType.size_sqm}m²` : "—"}
                  </p>
                  <p className="text-xs text-text-muted">Size</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-3">
                <Users className="w-5 h-5 text-bastet-gold" />
                <div>
                  <p className="text-lg font-mono font-bold text-text-primary">
                    {aptType?.max_occupancy ?? "—"}
                  </p>
                  <p className="text-xs text-text-muted">Max Guests</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Amenities */}
          {aptType?.amenities && aptType.amenities.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">
                  Amenities
                </h3>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {aptType.amenities.map((amenity) => (
                    <span
                      key={amenity}
                      className="px-3 py-1.5 bg-bastet-bg border border-bastet-border rounded-full text-xs text-text-secondary"
                    >
                      {amenity}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Current Booking */}
          {currentBooking && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">
                  Current Booking
                </h3>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-text-muted">Reference</p>
                    <Link
                      href={`/dashboard/bookings/${currentBooking.id}`}
                      className="text-sm font-mono text-bastet-gold hover:underline mt-0.5 inline-block"
                    >
                      {currentBooking.reference}
                    </Link>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Guest</p>
                    <p className="text-sm text-text-primary mt-0.5">
                      {currentBooking.guest
                        ? `${currentBooking.guest.first_name} ${currentBooking.guest.last_name}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Check-in</p>
                    <p className="text-sm text-text-primary mt-0.5">
                      {formatDate(currentBooking.check_in)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Check-out</p>
                    <p className="text-sm text-text-primary mt-0.5">
                      {formatDate(currentBooking.check_out)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Nights</p>
                    <p className="text-sm font-mono text-text-primary mt-0.5">
                      {currentBooking.nights}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Status</p>
                    <Badge
                      status={currentBooking.status}
                      variant="status"
                      className="mt-0.5"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {apartment.notes && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">
                  Notes
                </h3>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-text-secondary">
                  {apartment.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          {/* Pricing */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">
                Pricing
              </h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-text-secondary">Weekly Rate</span>
                <span className="text-sm font-mono font-bold text-text-primary">
                  {formatCurrency(weeklyRate)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-text-secondary">Nightly Rate</span>
                <span className="text-sm font-mono text-text-secondary">
                  {formatCurrency(nightlyRate)}
                </span>
              </div>
              <div className="border-t border-bastet-border pt-3">
                <p className="text-xs text-text-muted">Length-of-stay discounts</p>
                <div className="mt-2 space-y-1 text-xs text-text-secondary">
                  <div className="flex justify-between">
                    <span>7+ nights</span>
                    <span className="text-bastet-gold">5% off</span>
                  </div>
                  <div className="flex justify-between">
                    <span>14+ nights</span>
                    <span className="text-bastet-gold">10% off</span>
                  </div>
                  <div className="flex justify-between">
                    <span>21+ nights</span>
                    <span className="text-bastet-gold">15% off</span>
                  </div>
                  <div className="flex justify-between">
                    <span>28+ nights</span>
                    <span className="text-bastet-gold">20% off</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* IoT / Smart Devices */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">
                Smart Devices
              </h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Lock className="w-4 h-4 text-text-muted" />
                <div>
                  <p className="text-xs text-text-muted">Smart Lock</p>
                  <p className="text-sm font-mono text-text-primary">
                    {apartment.smart_lock_id || "Not assigned"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Thermometer className="w-4 h-4 text-text-muted" />
                <div>
                  <p className="text-xs text-text-muted">AC Unit</p>
                  <p className="text-sm font-mono text-text-primary">
                    {apartment.ac_unit_id || "Not assigned"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Wifi className="w-4 h-4 text-text-muted" />
                <div>
                  <p className="text-xs text-text-muted">View</p>
                  <p className="text-sm text-text-primary capitalize">
                    {apartment.view_type.replace("_", " ")} view
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
