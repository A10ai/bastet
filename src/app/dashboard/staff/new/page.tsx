"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2 } from "lucide-react";
import { STAFF_ROLES } from "@/lib/constants";

export default function NewStaffPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [language, setLanguage] = useState("en");
  const [hireDate, setHireDate] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await fetch("/api/v1/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          phone: phone || null,
          role,
          department: department || null,
          language,
          hire_date: hireDate || null,
        }),
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
        <Link href="/dashboard/staff" className="p-2 rounded-lg hover:bg-bastet-card transition-colors">
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">New Staff Member</h1>
          <p className="text-sm text-text-secondary mt-1">Add a new team member</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Personal Information</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <Input label="First Name" id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                <Input label="Last Name" id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                <Input label="Email" type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Input label="Phone" type="tel" id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Role & Department</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                  >
                    <option value="">Select role...</option>
                    {STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <Input label="Department" id="department" value={department} onChange={(e) => setDepartment(e.target.value)} />
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                  >
                    <option value="en">English</option>
                    <option value="ar">Arabic</option>
                    <option value="ru">Russian</option>
                    <option value="de">German</option>
                  </select>
                </div>
                <Input label="Hire Date" type="date" id="hireDate" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
              </div>
            </CardContent>
          </Card>

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
