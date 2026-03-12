"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Loader2, RefreshCw } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import type { CurrencyRate } from "@/types";

export function CurrencyRatesCard() {
  const [rates, setRates] = useState<CurrencyRate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRates = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/currency-rates");
      const json = await res.json();
      setRates(json.data || []);
    } catch {
      setRates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary">Currency Rates</h3>
          <button
            onClick={fetchRates}
            className="p-1.5 rounded-lg hover:bg-bastet-card text-text-muted hover:text-text-primary transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-bastet-gold" />
          </div>
        ) : rates.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-4">No rates available</p>
        ) : (
          <div className="space-y-3">
            {rates.map((rate) => (
              <div
                key={rate.id}
                className="flex items-center justify-between py-2 border-b border-bastet-border last:border-0"
              >
                <div>
                  <span className="text-sm font-medium text-text-primary">
                    {rate.base_currency} → {rate.target_currency}
                  </span>
                  <p className="text-xs text-text-muted">
                    {rate.source} — {timeAgo(rate.fetched_at)}
                  </p>
                </div>
                <span className="text-sm font-mono font-semibold text-bastet-gold">
                  {rate.rate.toFixed(4)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
