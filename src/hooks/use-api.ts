"use client";

import { useCallback } from "react";
import { useProperty } from "@/providers/property-provider";

/**
 * Custom fetch hook that automatically appends property_id to all API calls.
 * Use this in dashboard components so every request is scoped to the active property.
 */
export function usePropertyApi() {
  const { activePropertyId } = useProperty();

  const apiFetch = useCallback(
    async (url: string, options?: RequestInit) => {
      const separator = url.includes("?") ? "&" : "?";
      const propertyUrl = activePropertyId
        ? `${url}${separator}property_id=${activePropertyId}`
        : url;
      const res = await fetch(propertyUrl, options);
      return res;
    },
    [activePropertyId]
  );

  return { apiFetch, propertyId: activePropertyId };
}
