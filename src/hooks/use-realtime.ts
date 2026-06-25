"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Subscribe to Supabase Realtime changes on one or more tables.
 * When any INSERT/UPDATE/DELETE happens, calls `onUpdate` callback.
 */
export function useRealtimeSubscription(
  tables: string[],
  onUpdate: () => void,
  debounceMs: number = 2000
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const debouncedUpdate = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLastUpdate(new Date());
      onUpdate();
    }, debounceMs);
  }, [onUpdate, debounceMs]);

  const stableTables = useMemo(() => tables, [tables.join(",")]);

  useEffect(() => {
    const supabase = createClient();

    let channel = supabase.channel("dashboard-realtime");

    for (const table of stableTables) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          debouncedUpdate();
        }
      );
    }

    channel.subscribe((status) => {
      setConnected(status === "SUBSCRIBED");
    });

    channelRef.current = channel;

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [stableTables, debouncedUpdate]);

  return { connected, lastUpdate };
}
