"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import type { ShowToast, CurrencyRow } from "@/components/admin/config/types";

export function CurrencyTab({ showToast }: { showToast: ShowToast }) {
  const [currencyRates, setCurrencyRates] = useState<CurrencyRow[]>([]);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<string | null>(null);
  const [currencyEdits, setCurrencyEdits] = useState<Partial<CurrencyRow>>({});

  const fetchCurrencyRates = useCallback(async () => {
    setCurrencyLoading(true);
    try {
      const res = await fetch(
        "/api/v1/admin/database?table=currency_rates&page=1"
      );
      const json = await res.json();
      setCurrencyRates(json.data || []);
    } catch {
      showToast("Failed to load currency rates", "error");
    } finally {
      setCurrencyLoading(false);
    }
  }, [showToast]);

  const saveCurrency = async (id: string) => {
    try {
      const res = await fetch("/api/v1/admin/database", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "currency_rates",
          id,
          updates: currencyEdits,
        }),
      });
      const json = await res.json();
      if (json.error) {
        showToast(json.error, "error");
        return;
      }
      showToast("Currency rate updated");
      setEditingCurrency(null);
      fetchCurrencyRates();
    } catch {
      showToast("Failed to save currency rate", "error");
    }
  };

  useEffect(() => {
    fetchCurrencyRates();
  }, [fetchCurrencyRates]);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-display font-semibold text-text-primary">
          Currency Exchange Rates
        </h2>
      </CardHeader>
      <CardContent className="p-0">
        {currencyLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border bg-brand-bg/50">
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                    Base Currency
                  </th>
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                    Target Currency
                  </th>
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                    Rate
                  </th>
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                    Source
                  </th>
                  <th className="text-right text-xs font-medium text-text-muted px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {currencyRates.map((cr, idx) => (
                  <tr
                    key={cr.id}
                    className={`border-b border-brand-border last:border-0 hover:bg-brand-bg/50 transition-colors ${
                      idx % 2 === 1 ? "bg-brand-bg/20" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="text-text-primary font-mono">
                        {cr.base_currency}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-text-primary font-mono">
                        {cr.target_currency}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {editingCurrency === cr.id ? (
                        <input
                          type="number"
                          step="0.0001"
                          value={
                            currencyEdits.rate ?? cr.rate
                          }
                          onChange={(e) =>
                            setCurrencyEdits((c) => ({
                              ...c,
                              rate: parseFloat(e.target.value),
                            }))
                          }
                          className="bg-brand-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none w-28"
                        />
                      ) : (
                        <span className="text-text-primary font-mono">
                          {Number(cr.rate).toFixed(4)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-text-muted text-xs">
                        {cr.source}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {editingCurrency === cr.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => saveCurrency(cr.id)}
                            className="px-2 py-1 bg-status-success/10 text-status-success text-xs rounded hover:bg-status-success/20 transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingCurrency(null)}
                            className="px-2 py-1 text-text-muted text-xs hover:text-text-primary transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingCurrency(cr.id);
                            setCurrencyEdits({});
                          }}
                          className="px-2 py-1 text-text-muted text-xs hover:text-cyan-400 transition-colors"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {currencyRates.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="text-center py-12 text-text-muted text-sm"
                    >
                      No currency rates configured
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
