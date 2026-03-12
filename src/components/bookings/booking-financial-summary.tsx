"use client";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface BookingFinancialSummaryProps {
  ratePerNight: number;
  nights: number;
  discountPercentage: number;
  totalAmountGbp: number;
  totalAmountGuestCurrency?: number | null;
  guestCurrency?: string;
  channelName?: string;
  channelCommission?: number;
}

export function BookingFinancialSummary({
  ratePerNight,
  nights,
  discountPercentage,
  totalAmountGbp,
  totalAmountGuestCurrency,
  guestCurrency,
  channelName,
  channelCommission,
}: BookingFinancialSummaryProps) {
  const subtotal = ratePerNight * nights;
  const discountAmount = subtotal * (discountPercentage / 100);
  const commission = channelCommission ? totalAmountGbp * channelCommission : 0;
  const netRevenue = totalAmountGbp - commission;

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold text-text-primary">
          Financial Summary
        </h3>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">
            {formatCurrency(ratePerNight)} × {nights} nights
          </span>
          <span className="font-mono text-text-primary">
            {formatCurrency(subtotal)}
          </span>
        </div>

        {discountPercentage > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-status-success">
              LOS Discount ({discountPercentage}%)
            </span>
            <span className="font-mono text-status-success">
              -{formatCurrency(discountAmount)}
            </span>
          </div>
        )}

        <div className="border-t border-bastet-border pt-3 flex justify-between">
          <span className="text-sm font-semibold text-text-primary">Total (GBP)</span>
          <span className="font-mono font-bold text-text-primary text-lg">
            {formatCurrency(totalAmountGbp)}
          </span>
        </div>

        {totalAmountGuestCurrency && guestCurrency && guestCurrency !== "GBP" && (
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">
              Total ({guestCurrency})
            </span>
            <span className="font-mono text-text-secondary">
              {formatCurrency(totalAmountGuestCurrency, guestCurrency)}
            </span>
          </div>
        )}

        {channelName && (
          <>
            <div className="border-t border-bastet-border pt-3 flex justify-between text-sm">
              <span className="text-text-secondary">Channel</span>
              <span className="text-text-primary">{channelName}</span>
            </div>
            {channelCommission !== undefined && channelCommission > 0 && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">
                    Commission ({(channelCommission * 100).toFixed(0)}%)
                  </span>
                  <span className="font-mono text-status-error">
                    -{formatCurrency(commission)}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-text-primary">Net Revenue</span>
                  <span className="font-mono text-bastet-gold">
                    {formatCurrency(netRevenue)}
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
