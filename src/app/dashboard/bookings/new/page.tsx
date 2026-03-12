"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PriceCalculator } from "@/components/bookings/price-calculator";
import { ArrowLeft, Loader2 } from "lucide-react";

interface ApartmentOption {
  id: string;
  number: string;
  apartment_type?: { id: string; name: string } | null;
  building?: { name: string } | null;
  status: string;
}

interface GuestOption {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
}

interface ChannelOption {
  id: string;
  name: string;
  code: string;
}

export default function NewBookingPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Options
  const [apartments, setApartments] = useState<ApartmentOption[]>([]);
  const [guests, setGuests] = useState<GuestOption[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);

  // Form state
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [apartmentId, setApartmentId] = useState("");
  const [guestId, setGuestId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [guestCurrency, setGuestCurrency] = useState("GBP");
  const [specialRequests, setSpecialRequests] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  useEffect(() => {
    // Fetch options in parallel
    Promise.all([
      fetch("/api/v1/apartments").then((r) => r.json()),
      fetch("/api/v1/guests").then((r) => r.json()),
      fetch("/api/v1/booking-channels").then((r) => r.json()),
    ]).then(([aptRes, guestRes, channelRes]) => {
      setApartments(aptRes.data || []);
      setGuests(guestRes.data || []);
      setChannels(channelRes.data || []);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      // Get property_id from the selected apartment
      // Get property_id from selected apartment
      const selectedApt = apartments.find((a) => a.id === apartmentId) as Record<string, unknown> | undefined;

      const res = await fetch("/api/v1/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: selectedApt?.property_id || null,
          apartment_id: apartmentId,
          guest_id: guestId || null,
          channel_id: channelId || null,
          check_in: checkIn,
          check_out: checkOut,
          adults,
          children,
          infants,
          guest_currency: guestCurrency,
          special_requests: specialRequests || null,
          internal_notes: internalNotes || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to create booking");
        return;
      }

      const { data } = await res.json();
      router.push(`/dashboard/bookings/${data.id}`);
    } catch {
      setError("Failed to create booking");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/bookings"
          className="p-2 rounded-lg hover:bg-bastet-card transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">
            New Booking
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Create a new reservation
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Dates */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Dates</h3>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Check-in"
                    type="date"
                    id="checkIn"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    required
                  />
                  <Input
                    label="Check-out"
                    type="date"
                    id="checkOut"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    required
                  />
                </div>
              </CardContent>
            </Card>

            {/* Apartment */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Apartment</h3>
              </CardHeader>
              <CardContent>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Select Apartment
                </label>
                <select
                  value={apartmentId}
                  onChange={(e) => setApartmentId(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                >
                  <option value="">Choose an apartment...</option>
                  {apartments
                    .filter((a) => a.status === "available")
                    .map((apt) => (
                      <option key={apt.id} value={apt.id}>
                        {apt.number} — {apt.apartment_type?.name || "Unknown"}{" "}
                        ({apt.building?.name || ""})
                      </option>
                    ))}
                </select>
              </CardContent>
            </Card>

            {/* Guest */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Guest</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">
                      Select Guest
                    </label>
                    <select
                      value={guestId}
                      onChange={(e) => setGuestId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                    >
                      <option value="">No guest (walk-in)</option>
                      {guests.map((guest) => (
                        <option key={guest.id} value={guest.id}>
                          {guest.first_name} {guest.last_name}
                          {guest.email ? ` (${guest.email})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Link
                    href="/dashboard/guests/new"
                    className="text-xs text-bastet-gold hover:underline"
                  >
                    + Create new guest
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Channel & Guests Count */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Details</h3>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">
                      Booking Channel
                    </label>
                    <select
                      value={channelId}
                      onChange={(e) => setChannelId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                    >
                      <option value="">Select channel...</option>
                      {channels.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Adults"
                    type="number"
                    id="adults"
                    min={1}
                    value={adults}
                    onChange={(e) => setAdults(parseInt(e.target.value) || 1)}
                  />
                  <Input
                    label="Children"
                    type="number"
                    id="children"
                    min={0}
                    value={children}
                    onChange={(e) => setChildren(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                  <Input
                    label="Infants"
                    type="number"
                    id="infants"
                    min={0}
                    value={infants}
                    onChange={(e) => setInfants(parseInt(e.target.value) || 0)}
                  />
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">
                      Guest Currency
                    </label>
                    <select
                      value={guestCurrency}
                      onChange={(e) => setGuestCurrency(e.target.value)}
                      className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                    >
                      <option value="GBP">GBP</option>
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                      <option value="EGP">EGP</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Notes</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">
                      Special Requests
                    </label>
                    <textarea
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                      placeholder="Guest special requests..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">
                      Internal Notes
                    </label>
                    <textarea
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                      placeholder="Internal staff notes..."
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {error && (
              <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-lg text-sm text-status-error">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Create Booking
              </Button>
              <Link href="/dashboard/bookings">
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Link>
            </div>
          </div>

          {/* Sidebar - Price Preview */}
          <div>
            <PriceCalculator
              apartmentId={apartmentId}
              checkIn={checkIn}
              checkOut={checkOut}
              guestCurrency={guestCurrency}
            />
          </div>
        </div>
      </form>
    </div>
  );
}
