"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribe to Supabase Realtime changes on one or more tables.
 * When any INSERT/UPDATE/DELETE happens, calls `onUpdate` (debounced).
 *
 * The channel topic is unique per subscription: the browser client is a
 * singleton, so reusing a fixed topic returned the already-subscribed
 * channel on re-render and `.on()` then threw "cannot add postgres_changes
 * callbacks after subscribe()". `onUpdate` is read through a ref so a new
 * inline callback on each render does not resubscribe.
 */
export function useRealtimeSubscription(
  tables: string[],
  onUpdate: () => void,
  debounceMs: number = 2000
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const tablesKey = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const topic = `realtime-${tablesKey.replace(/[^a-z0-9_,-]/gi, "")}-${Math.random().toString(36).slice(2, 10)}`;
    let channel = supabase.channel(topic);

    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setLastUpdate(new Date());
        onUpdateRef.current();
      }, debounceMs);
    };

    for (const table of tablesKey.split(",").filter(Boolean)) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, fire);
    }

    channel.subscribe((status) => {
      setConnected(status === "SUBSCRIBED");
    });

    return () => {
      if (timer) clearTimeout(timer);
      setConnected(false);
      supabase.removeChannel(channel);
    };
  }, [tablesKey, debounceMs]);

  return { connected, lastUpdate };
}
