"use client";

import { useEffect, useState, useCallback } from "react";
import { commissionPercent } from "@/lib/utils";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import type { ShowToast, ChannelRow } from "@/components/admin/config/types";

export function ChannelsTab({ showToast }: { showToast: ShowToast }) {
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [channelEdits, setChannelEdits] = useState<Partial<ChannelRow>>({});

  const fetchChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const res = await fetch(
        "/api/v1/admin/database?table=booking_channels&page=1"
      );
      const json = await res.json();
      setChannels(json.data || []);
    } catch {
      showToast("Failed to load channels", "error");
    } finally {
      setChannelsLoading(false);
    }
  }, [showToast]);

  const saveChannel = async (id: string) => {
    try {
      const res = await fetch("/api/v1/admin/database", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "booking_channels",
          id,
          updates: channelEdits,
        }),
      });
      const json = await res.json();
      if (json.error) {
        showToast(json.error, "error");
        return;
      }
      showToast("Channel updated");
      setEditingChannel(null);
      fetchChannels();
    } catch {
      showToast("Failed to save channel", "error");
    }
  };

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-display font-semibold text-text-primary">
          Booking Channel Commissions
        </h2>
      </CardHeader>
      <CardContent className="p-0">
        {channelsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border bg-brand-bg/50">
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                    Channel Name
                  </th>
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                    Code
                  </th>
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                    Commission Rate
                  </th>
                  <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                    Active
                  </th>
                  <th className="text-right text-xs font-medium text-text-muted px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch, idx) => (
                  <tr
                    key={ch.id}
                    className={`border-b border-brand-border last:border-0 hover:bg-brand-bg/50 transition-colors ${
                      idx % 2 === 1 ? "bg-brand-bg/20" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      {editingChannel === ch.id ? (
                        <input
                          type="text"
                          value={channelEdits.name ?? ch.name}
                          onChange={(e) =>
                            setChannelEdits((c) => ({
                              ...c,
                              name: e.target.value,
                            }))
                          }
                          className="bg-brand-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none"
                        />
                      ) : (
                        <span className="text-text-primary font-medium">
                          {ch.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-text-muted font-mono text-xs">
                        {ch.code}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {editingChannel === ch.id ? (
                        <input
                          type="number"
                          step="0.01"
                          value={
                            channelEdits.commission_rate ??
                            ch.commission_rate
                          }
                          onChange={(e) =>
                            setChannelEdits((c) => ({
                              ...c,
                              commission_rate: parseFloat(
                                e.target.value
                              ),
                            }))
                          }
                          className="bg-brand-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none w-20"
                        />
                      ) : (
                        <span className="text-text-primary font-mono">
                          {commissionPercent(ch.commission_rate).toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {editingChannel === ch.id ? (
                        <button
                          onClick={() =>
                            setChannelEdits((c) => ({
                              ...c,
                              is_active: !(
                                c.is_active ?? ch.is_active
                              ),
                            }))
                          }
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            (channelEdits.is_active ?? ch.is_active)
                              ? "bg-status-success/10 text-status-success"
                              : "bg-status-error/10 text-status-error"
                          }`}
                        >
                          {(channelEdits.is_active ?? ch.is_active)
                            ? "Active"
                            : "Inactive"}
                        </button>
                      ) : (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            ch.is_active
                              ? "bg-status-success/10 text-status-success"
                              : "bg-status-error/10 text-status-error"
                          }`}
                        >
                          {ch.is_active ? "Active" : "Inactive"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {editingChannel === ch.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => saveChannel(ch.id)}
                            className="px-2 py-1 bg-status-success/10 text-status-success text-xs rounded hover:bg-status-success/20 transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingChannel(null)}
                            className="px-2 py-1 text-text-muted text-xs hover:text-text-primary transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingChannel(ch.id);
                            setChannelEdits({});
                          }}
                          className="px-2 py-1 text-text-muted text-xs hover:text-cyan-400 transition-colors"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {channels.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="text-center py-12 text-text-muted text-sm"
                    >
                      No channels configured
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
