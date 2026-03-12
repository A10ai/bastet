"use client";

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
} from "lucide-react";

// Mock data for apartment detail
const MOCK_APARTMENT = {
  id: "1",
  number: "A301",
  floor: 3,
  building: { name: "Block A", code: "A" },
  apartment_type: {
    name: "1-Bed Apartment",
    bedrooms: 1,
    bathrooms: 1,
    max_occupancy: 3,
    size_sqm: 55,
    base_weekly_rate_gbp: 450,
    amenities: ["WiFi", "AC", "Kitchen", "Washing Machine", "Smart TV", "Balcony"],
  },
  view_type: "sea",
  status: "occupied",
  is_accessible: false,
  smart_lock_id: "SL-A301",
  ac_unit_id: "AC-A301",
  notes: "Corner unit with extra-large balcony. Sea view from living room and bedroom.",
};

const CURRENT_BOOKING = {
  reference: "BAS-HRG-260001",
  guest: "James Wilson",
  check_in: "2026-03-01",
  check_out: "2026-03-15",
  nights: 14,
  status: "checked_in",
};

export default function ApartmentDetailPage() {
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
              Apartment {MOCK_APARTMENT.number}
            </h1>
            <Badge status={MOCK_APARTMENT.status} variant="status" />
          </div>
          <p className="text-sm text-text-secondary mt-1">
            {MOCK_APARTMENT.building.name} — Floor {MOCK_APARTMENT.floor} —{" "}
            {MOCK_APARTMENT.apartment_type.name}
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
                    {MOCK_APARTMENT.apartment_type.bedrooms}
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
                    {MOCK_APARTMENT.apartment_type.bathrooms}
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
                    {MOCK_APARTMENT.apartment_type.size_sqm}m²
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
                    {MOCK_APARTMENT.apartment_type.max_occupancy}
                  </p>
                  <p className="text-xs text-text-muted">Max Guests</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Amenities */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">
                Amenities
              </h3>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {MOCK_APARTMENT.apartment_type.amenities.map((amenity) => (
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

          {/* Current Booking */}
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
                  <p className="text-sm font-mono text-bastet-gold mt-0.5">
                    {CURRENT_BOOKING.reference}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Guest</p>
                  <p className="text-sm text-text-primary mt-0.5">
                    {CURRENT_BOOKING.guest}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Check-in</p>
                  <p className="text-sm text-text-primary mt-0.5">
                    {CURRENT_BOOKING.check_in}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Check-out</p>
                  <p className="text-sm text-text-primary mt-0.5">
                    {CURRENT_BOOKING.check_out}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Nights</p>
                  <p className="text-sm font-mono text-text-primary mt-0.5">
                    {CURRENT_BOOKING.nights}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Status</p>
                  <Badge
                    status={CURRENT_BOOKING.status}
                    variant="status"
                    className="mt-0.5"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {MOCK_APARTMENT.notes && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">
                  Notes
                </h3>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-text-secondary">
                  {MOCK_APARTMENT.notes}
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
                  £{MOCK_APARTMENT.apartment_type.base_weekly_rate_gbp}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-text-secondary">Nightly Rate</span>
                <span className="text-sm font-mono text-text-secondary">
                  £{Math.round(MOCK_APARTMENT.apartment_type.base_weekly_rate_gbp / 7)}
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
                    {MOCK_APARTMENT.smart_lock_id || "Not assigned"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Thermometer className="w-4 h-4 text-text-muted" />
                <div>
                  <p className="text-xs text-text-muted">AC Unit</p>
                  <p className="text-sm font-mono text-text-primary">
                    {MOCK_APARTMENT.ac_unit_id || "Not assigned"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Wifi className="w-4 h-4 text-text-muted" />
                <div>
                  <p className="text-xs text-text-muted">View</p>
                  <p className="text-sm text-text-primary capitalize">
                    {MOCK_APARTMENT.view_type} view
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
