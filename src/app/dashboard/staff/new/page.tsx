"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  StaffFormFields,
  emptyStaffForm,
  staffFormToPayload,
  type StaffFormValues,
} from "@/components/staff/staff-form";

export default function NewStaffPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState<StaffFormValues>(emptyStaffForm);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await fetch("/api/v1/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(staffFormToPayload(values)),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to create staff member");
        return;
      }

      const { data } = await res.json();
      router.push(`/dashboard/staff/${data.id}`);
    } catch {
      setError("Failed to create staff member");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/staff" className="p-2 rounded-lg hover:bg-brand-card transition-colors">
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">New Staff Member</h1>
          <p className="text-sm text-text-secondary mt-1">Add a new team member</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="max-w-2xl space-y-6">
          <StaffFormFields
            values={values}
            onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
            allowEmptyRole
          />

          {error && (
            <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-lg text-sm text-status-error">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Create Staff Member
            </Button>
            <Link href="/dashboard/staff">
              <Button type="button" variant="secondary">Cancel</Button>
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
