"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function NewGuestPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [nationality, setNationality] = useState("");
  const [language, setLanguage] = useState("en");
  const [currency, setCurrency] = useState("GBP");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [passport, setPassport] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [postcode, setPostcode] = useState("");
  const [vip, setVip] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await fetch("/api/v1/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email: email || null,
          phone: phone || null,
          nationality: nationality || null,
          language,
          preferred_currency: currency,
          date_of_birth: dateOfBirth || null,
          passport_number: passport || null,
          address_line1: address || null,
          city: city || null,
          country: country || null,
          postcode: postcode || null,
          vip_status: vip,
          marketing_consent: marketing,
          notes: notes || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to create guest");
        return;
      }

      const { data } = await res.json();
      router.push(`/dashboard/guests/${data.id}`);
    } catch {
      setError("Failed to create guest");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/guests"
          className="p-2 rounded-lg hover:bg-bastet-card transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">
            New Guest
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Create a new guest profile
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">Personal Information</h3>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="First Name *"
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
              <Input
                label="Last Name *"
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
              <Input
                label="Email"
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                label="Phone"
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Input
                label="Nationality"
                id="nationality"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                placeholder="e.g. British, Egyptian"
              />
              <Input
                label="Date of Birth"
                id="dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
              <Input
                label="Passport Number"
                id="passport"
                value={passport}
                onChange={(e) => setPassport(e.target.value)}
              />
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Preferred Language
                </label>
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
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Preferred Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                >
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="EGP">EGP</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">Address</h3>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Input
                  label="Address"
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
              <Input
                label="City"
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
              <Input
                label="Country"
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
              <Input
                label="Postcode"
                id="postcode"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">Settings</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={vip}
                  onChange={(e) => setVip(e.target.checked)}
                  className="w-4 h-4 rounded border-bastet-border text-bastet-gold focus:ring-bastet-gold/50"
                />
                <span className="text-sm text-text-primary">VIP Status</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                  className="w-4 h-4 rounded border-bastet-border text-bastet-gold focus:ring-bastet-gold/50"
                />
                <span className="text-sm text-text-primary">Marketing Consent</span>
              </label>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                  placeholder="Internal notes about this guest..."
                />
              </div>
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
            Create Guest
          </Button>
          <Link href="/dashboard/guests">
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
