"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import type { ShowToast, RateRow } from "@/components/admin/config/types";

export function RatesTab({ showToast }: { showToast: ShowToast }) {
  const [rates, setRates] = useState<RateRow[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [rateEdits, setRateEdits] = useState<Partial<RateRow>>({});

  const fetchRates = useCallback(async () => {
    setRatesLoading(true);
    try {
      const res = await fetch(
        "/api/v1/admin/database?table=rates&page=1&sort=start_date&dir=asc"
      );
      const json = await res.json();
      setRates(json.data || []);
    } catch {
      showToast("Failed to load rates", "error");
    } finally {
      setRatesLoading(false);
    }
  }, [showToast]);

  const saveRate = async (id: string) => {
    try {
      const res = await fetch("/api/v1/admin/database", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "rates",
          id,
          updates: rateEdits,
        }),
      });
      const json = await res.json();
      if (json.error) {
        showToast(json.error, "error");
        return;
      }
      showToast("Rate updated");
      setEditingRate(null);
      fetchRates();
    } catch {
      showToast("Failed to save rate", "error");
    }
  };

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-display font-semibold text-text-primary">
          Seasonal Rates
        </h2>
      </CardHeader>
      <CardContent className="p-0">
        {ratesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border bg-brand-bg/50">
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                    Season
                  </th>
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                    Start Date
                  </th>
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                    End Date
                  </th>
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                    Weekly Rate (GBP)
                  </th>
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                    Min Nights
                  </th>
                  <th className="text-right text-xs font-medium text-text-muted px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate, idx) => (
                  <tr
                    key={rate.id}
                    className={`border-b border-brand-border last:border-0 hover:bg-brand-bg/50 transition-colors ${
                      idx % 2 === 1 ? "bg-brand-bg/20" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      {editingRate === rate.id ? (
                        <input
                          type="text"
                          value={
                            rateEdits.season ?? rate.season
                          }
                          onChange={(e) =>
                            setRateEdits((r) => ({
                              ...r,
                              season: e.target.value,
                            }))
                          }
                          className="bg-brand-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none w-28"
                        />
                      ) : (
                        <span className="text-text-primary capitalize">
                          {rate.season}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {editingRate === rate.id ? (
                        <input
                          type="date"
                          value={
                            rateEdits.start_date ?? rate.start_date
                          }
                          onChange={(e) =>
                            setRateEdits((r) => ({
                              ...r,
                              start_date: e.target.value,
                            }))
                          }
                          className="bg-brand-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none"
                        />
                      ) : (
                        <span className="text-text-secondary text-xs">
                          {rate.start_date}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {editingRate === rate.id ? (
                        <input
                          type="date"
                          value={
                            rateEdits.end_date ?? rate.end_date
                          }
                          onChange={(e) =>
                            setRateEdits((r) => ({
                              ...r,
                              end_date: e.target.value,
                            }))
                          }
                          className="bg-brand-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none"
                        />
                      ) : (
                        <span className="text-text-secondary text-xs">
                          {rate.end_date}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {editingRate === rate.id ? (
                        <input
                          type="number"
                          value={
                            rateEdits.weekly_rate_gbp ??
                            rate.weekly_rate_gbp
                          }
                          onChange={(e) =>
                            setRateEdits((r) => ({
                              ...r,
                              weekly_rate_gbp: parseFloat(
                                e.target.value
                              ),
                            }))
                          }
                          className="bg-brand-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none w-24"
                        />
                      ) : (
                        <span className="text-text-primary font-mono">
                          {Number(rate.weekly_rate_gbp).toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {editingRate === rate.id ? (
                        <input
                          type="number"
                          value={
                            rateEdits.min_nights ?? rate.min_nights
                          }
                          onChange={(e) =>
                            setRateEdits((r) => ({
                              ...r,
                              min_nights: parseInt(e.target.value),
                            }))
                          }
                          className="bg-brand-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none w-16"
                        />
                      ) : (
                        <span className="text-text-secondary">
                          {rate.min_nights}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {editingRate === rate.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => saveRate(rate.id)}
                            className="px-2 py-1 bg-status-success/10 text-status-success text-xs rounded hover:bg-status-success/20 transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingRate(null)}
                            className="px-2 py-1 text-text-muted text-xs hover:text-text-primary transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingRate(rate.id);
                            setRateEdits({});
                          }}
                          className="px-2 py-1 text-text-muted text-xs hover:text-cyan-400 transition-colors"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {rates.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-center py-12 text-text-muted text-sm"
                    >
                      No rates configured
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
