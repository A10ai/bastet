"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { Staff } from "@/types";
import {
  StaffFormFields,
  emptyStaffForm,
  staffFormToPayload,
  staffToForm,
  type StaffFormValues,
} from "@/components/staff/staff-form";

export default function EditStaffPage() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState<StaffFormValues>(emptyStaffForm);

  useEffect(() => {
    const fetchStaff = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/staff/${params.id}`);
        const json = await res.json();
        const s: Staff = json.data;
        if (s) setValues(staffToForm(s));
      } finally {
        setLoading(false);
      }
    };
    fetchStaff();
  }, [params.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await fetch(`/api/v1/staff/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(staffFormToPayload(values)),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to update");
        return;
      }

      router.push(`/dashboard/staff/${params.id}`);
    } catch {
      setError("Failed to update");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-bastet-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/staff/${params.id}`} className="p-2 rounded-lg hover:bg-bastet-card transition-colors">
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">Edit Staff Member</h1>
          <p className="text-sm text-text-secondary mt-1">Update staff information</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="max-w-2xl space-y-6">
          <StaffFormFields
            values={values}
            onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
          />

          {error && (
            <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-lg text-sm text-status-error">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save Changes
            </Button>
            <Link href={`/dashboard/staff/${params.id}`}>
              <Button type="button" variant="secondary">Cancel</Button>
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
