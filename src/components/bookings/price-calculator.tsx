"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { formatCurrency, getLengthOfStayDiscount } from "@/lib/utils";
import { differenceInDays } from "date-fns";
import { Loader2 } from "lucide-react";

function calculateNights(checkIn: string, checkOut: string): number {
  return differenceInDays(new Date(checkOut), new Date(checkIn));
}

function calculateBookingTotal(ratePerNight: number, nights: number) {
  const subtotal = ratePerNight * nights;
  const discountPct = getLengthOfStayDiscount(nights);
  const discount = subtotal * discountPct;
  const total = subtotal - discount;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    total: Math.round(total * 100) / 100,
    discount_percentage: discountPct * 100,
  };
}

interface PriceCalculatorProps {
  apartmentId: string;
  checkIn: string;
  checkOut: string;
  guestCurrency?: string;
}

export function PriceCalculator({
  apartmentId,
  checkIn,
  checkOut,
}: PriceCalculatorProps) {
  const [loading, setLoading] = useState(false);
  const [ratePerNight, setRatePerNight] = useState<number | null>(null);
  const [seasonName, setSeasonName] = useState("");
  const [error, setError] = useState("");

  const nights = checkIn && checkOut ? calculateNights(checkIn, checkOut) : 0;

  useEffect(() => {
    if (!apartmentId || !checkIn || !checkOut || nights <= 0) {
      setRatePerNight(null);
      return;
    }

    const fetchRate = async () => {
      setLoading(true);
      setError("");
      try {
        // Get apartment type
        const aptRes = await fetch(`/api/v1/apartments/${apartmentId}`);
        if (!aptRes.ok) throw new Error("Apartment not found");
        const { data: apt } = await aptRes.json();

        // Get rate
        const rateRes = await fetch(
          `/api/v1/rates?apartment_type_id=${apt.apartment_type_id}&date=${checkIn}`
        );
        const { data: rates } = await rateRes.json();

        if (rates && rates.length > 0) {
          const rate = rates[0];
          setRatePerNight(rate.nightly_rate_gbp ?? rate.weekly_rate_gbp / 7);
          setSeasonName(rate.season_name);
        } else {
          // Fallback to base rate
          const nightly = apt.apartment_type?.base_weekly_rate_gbp
            ? apt.apartment_type.base_weekly_rate_gbp / 7
            : 0;
          setRatePerNight(nightly);
          setSeasonName("Standard");
        }
      } catch {
        setError("Could not fetch rate");
      } finally {
        setLoading(false);
      }
    };

    fetchRate();
  }, [apartmentId, checkIn, checkOut, nights]);

  if (!apartmentId || !checkIn || !checkOut || nights <= 0) {
    return (
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-text-primary">Price Preview</h3>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-muted">
            Select dates and apartment to see pricing
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-text-primary">Price Preview</h3>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-bastet-gold" />
        </CardContent>
      </Card>
    );
  }

  if (error || ratePerNight === null) {
    return (
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-text-primary">Price Preview</h3>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-status-error">{error || "No rate available"}</p>
        </CardContent>
      </Card>
    );
  }

  const pricing = calculateBookingTotal(ratePerNight, nights);
  const discount = getLengthOfStayDiscount(nights);

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold text-text-primary">Price Preview</h3>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Season</span>
          <span className="text-text-primary">{seasonName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Nightly Rate</span>
          <span className="font-mono text-text-primary">
            {formatCurrency(ratePerNight)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Nights</span>
          <span className="font-mono text-text-primary">{nights}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Subtotal</span>
          <span className="font-mono text-text-primary">
            {formatCurrency(pricing.subtotal)}
          </span>
        </div>

        {discount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-status-success">
              LOS Discount ({pricing.discount_percentage}%)
            </span>
            <span className="font-mono text-status-success">
              -{formatCurrency(pricing.discount)}
            </span>
          </div>
        )}

        <div className="border-t border-bastet-border pt-3 flex justify-between">
          <span className="text-sm font-semibold text-text-primary">Total</span>
          <span className="font-mono font-bold text-bastet-gold text-lg">
            {formatCurrency(pricing.total)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
