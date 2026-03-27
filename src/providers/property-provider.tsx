"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/providers/auth-provider";

interface Property {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  country: string;
  total_apartments: number;
  status: string;
}

interface PropertyContextValue {
  properties: Property[];
  activeProperty: Property | null;
  activePropertyId: string | null;
  loading: boolean;
  switchProperty: (propertyId: string) => void;
}

const STORAGE_KEY = "hospitai-active-property";

const PropertyContext = createContext<PropertyContextValue>({
  properties: [],
  activeProperty: null,
  activePropertyId: null,
  loading: true,
  switchProperty: () => {},
});

export function PropertyProvider({ children }: { children: ReactNode }) {
  const { staff, loading: authLoading } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch properties once auth is ready
  useEffect(() => {
    if (authLoading) return;

    async function fetchProperties() {
      try {
        const res = await fetch("/api/v1/properties");
        if (!res.ok) throw new Error("Failed to fetch properties");
        const json = await res.json();
        const list: Property[] = json.data || [];
        setProperties(list);

        // Determine active property
        const stored = localStorage.getItem(STORAGE_KEY);
        const storedExists = stored && list.some((p) => p.id === stored);

        if (storedExists) {
          setActivePropertyId(stored);
        } else if (staff?.property_id) {
          // Fall back to staff's default property
          setActivePropertyId(staff.property_id);
          localStorage.setItem(STORAGE_KEY, staff.property_id);
        } else if (list.length > 0) {
          // Fall back to first property
          setActivePropertyId(list[0].id);
          localStorage.setItem(STORAGE_KEY, list[0].id);
        }
      } catch {
        // Properties fetch failed — leave empty
      } finally {
        setLoading(false);
      }
    }

    fetchProperties();
  }, [authLoading, staff]);

  const switchProperty = useCallback(
    (propertyId: string) => {
      const exists = properties.some((p) => p.id === propertyId);
      if (!exists) return;
      setActivePropertyId(propertyId);
      localStorage.setItem(STORAGE_KEY, propertyId);
    },
    [properties]
  );

  const activeProperty =
    properties.find((p) => p.id === activePropertyId) || null;

  return (
    <PropertyContext.Provider
      value={{
        properties,
        activeProperty,
        activePropertyId,
        loading,
        switchProperty,
      }}
    >
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperty() {
  const context = useContext(PropertyContext);
  if (!context) {
    throw new Error("useProperty must be used within a PropertyProvider");
  }
  return context;
}
