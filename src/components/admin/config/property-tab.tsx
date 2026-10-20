"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import type { ShowToast, PropertyData } from "@/components/admin/config/types";

export function PropertyTab({ showToast, inputClass }: { showToast: ShowToast; inputClass: string }) {
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [propertyLoading, setPropertyLoading] = useState(true);
  const [propertySaving, setPropertySaving] = useState(false);

  const fetchProperty = useCallback(async () => {
    setPropertyLoading(true);
    try {
      const res = await fetch("/api/v1/admin/database?table=properties&page=1");
      const json = await res.json();
      if (json.data && json.data.length > 0) {
        setProperty(json.data[0]);
      }
    } catch {
      showToast("Failed to load property", "error");
    } finally {
      setPropertyLoading(false);
    }
  }, [showToast]);

  const saveProperty = async () => {
    if (!property) return;
    setPropertySaving(true);
    try {
      const res = await fetch("/api/v1/admin/database", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "properties",
          id: property.id,
          updates: {
            name: property.name,
            address: property.address,
            city: property.city,
            country: property.country,
            timezone: property.timezone,
            default_currency: property.default_currency,
            reporting_currency: property.reporting_currency,
            phone: property.phone,
            email: property.email,
            website: property.website,
          },
        }),
      });
      const json = await res.json();
      if (json.error) {
        showToast(json.error, "error");
        return;
      }
      showToast("Property settings saved");
    } catch {
      showToast("Failed to save", "error");
    } finally {
      setPropertySaving(false);
    }
  };

  useEffect(() => {
    fetchProperty();
  }, [fetchProperty]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-semibold text-text-primary">
            Property Settings
          </h2>
          <Button
            size="sm"
            onClick={saveProperty}
            disabled={propertySaving || !property}
          >
            {propertySaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {propertyLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
        ) : property ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                Property Name
              </label>
              <input
                type="text"
                value={property.name}
                onChange={(e) =>
                  setProperty((p) =>
                    p ? { ...p, name: e.target.value } : p
                  )
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={property.email}
                onChange={(e) =>
                  setProperty((p) =>
                    p ? { ...p, email: e.target.value } : p
                  )
                }
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                Address
              </label>
              <input
                type="text"
                value={property.address}
                onChange={(e) =>
                  setProperty((p) =>
                    p ? { ...p, address: e.target.value } : p
                  )
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                City
              </label>
              <input
                type="text"
                value={property.city}
                onChange={(e) =>
                  setProperty((p) =>
                    p ? { ...p, city: e.target.value } : p
                  )
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                Country
              </label>
              <input
                type="text"
                value={property.country}
                onChange={(e) =>
                  setProperty((p) =>
                    p ? { ...p, country: e.target.value } : p
                  )
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                Phone
              </label>
              <input
                type="tel"
                value={property.phone || ""}
                onChange={(e) =>
                  setProperty((p) =>
                    p ? { ...p, phone: e.target.value || null } : p
                  )
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                Website
              </label>
              <input
                type="url"
                value={property.website || ""}
                onChange={(e) =>
                  setProperty((p) =>
                    p ? { ...p, website: e.target.value || null } : p
                  )
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                Timezone
              </label>
              <input
                type="text"
                value={property.timezone}
                onChange={(e) =>
                  setProperty((p) =>
                    p ? { ...p, timezone: e.target.value } : p
                  )
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                Default Currency
              </label>
              <input
                type="text"
                value={property.default_currency}
                onChange={(e) =>
                  setProperty((p) =>
                    p
                      ? { ...p, default_currency: e.target.value }
                      : p
                  )
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                Reporting Currency
              </label>
              <input
                type="text"
                value={property.reporting_currency}
                onChange={(e) =>
                  setProperty((p) =>
                    p
                      ? { ...p, reporting_currency: e.target.value }
                      : p
                  )
                }
                className={inputClass}
              />
            </div>
          </div>
        ) : (
          <p className="text-text-muted text-sm py-8 text-center">
            No property found
          </p>
        )}
      </CardContent>
    </Card>
  );
}
