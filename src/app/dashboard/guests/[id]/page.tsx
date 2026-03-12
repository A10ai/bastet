"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PreferenceDnaViewer } from "@/components/guests/preference-dna-viewer";
import { GuestActivityTimeline } from "@/components/guests/guest-activity-timeline";
import { GuestCommunicationList } from "@/components/guests/guest-communication-list";
import {
  ArrowLeft,
  Mail,
  Phone,
  Globe,
  MapPin,
  Star,
  Edit,
  Save,
  X,
  Loader2,
  CalendarDays,
  Moon,
  Wallet,
  Trophy,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Guest, GuestPreferences, Booking } from "@/types";

type TabId = "profile" | "preferences" | "bookings" | "communications" | "activity";

const TABS: { id: TabId; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "preferences", label: "Preferences" },
  { id: "bookings", label: "Bookings" },
  { id: "communications", label: "Communications" },
  { id: "activity", label: "Activity" },
];

export default function GuestDetailPage() {
  const params = useParams();
  const [guest, setGuest] = useState<Guest & { preferences?: GuestPreferences | null; bookings?: Booking[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Guest>>({});
  const [saving, setSaving] = useState(false);

  const fetchGuest = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/guests/${params.id}`);
      const json = await res.json();
      setGuest(json.data);
    } catch {
      setGuest(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGuest();
  }, [params.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/guests/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      if (res.ok) {
        setEditing(false);
        fetchGuest();
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-bastet-gold" />
      </div>
    );
  }

  if (!guest) {
    return (
      <div className="text-center py-24">
        <p className="text-text-secondary">Guest not found</p>
        <Link href="/dashboard/guests" className="text-bastet-gold hover:underline text-sm mt-2 inline-block">
          Back to guests
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/guests" className="p-2 rounded-lg hover:bg-bastet-card transition-colors">
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold text-text-primary">
              {guest.first_name} {guest.last_name}
            </h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
              guest.loyalty_tier === "platinum" ? "bg-purple-400/20 text-purple-300" :
              guest.loyalty_tier === "gold" ? "bg-bastet-gold-muted text-bastet-gold" :
              guest.loyalty_tier === "silver" ? "bg-gray-400/20 text-gray-300" :
              "bg-orange-900/20 text-orange-400"
            }`}>
              {guest.loyalty_tier}
            </span>
            {guest.vip_status && (
              <Star className="w-4 h-4 text-bastet-gold fill-bastet-gold" />
            )}
          </div>
          <p className="text-sm text-text-secondary mt-1">
            {guest.email || "No email"} {guest.nationality ? `— ${guest.nationality}` : ""}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <CalendarDays className="w-5 h-5 text-bastet-gold" />
            <div>
              <p className="text-lg font-mono font-bold text-text-primary">{guest.total_stays}</p>
              <p className="text-xs text-text-muted">Total Stays</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <Moon className="w-5 h-5 text-bastet-gold" />
            <div>
              <p className="text-lg font-mono font-bold text-text-primary">{guest.total_nights}</p>
              <p className="text-xs text-text-muted">Total Nights</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <Wallet className="w-5 h-5 text-bastet-gold" />
            <div>
              <p className="text-lg font-mono font-bold text-text-primary">
                {formatCurrency(guest.total_spend_gbp)}
              </p>
              <p className="text-xs text-text-muted">Total Spend</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <Trophy className="w-5 h-5 text-bastet-gold" />
            <div>
              <p className="text-lg font-mono font-bold text-text-primary">
                {guest.loyalty_points.toLocaleString()}
              </p>
              <p className="text-xs text-text-muted">Loyalty Points</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-bastet-border">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? "text-bastet-gold"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-bastet-gold" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "profile" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="text-lg font-semibold text-text-primary">Profile Details</h3>
              {!editing ? (
                <Button size="sm" variant="secondary" onClick={() => {
                  setEditData({
                    first_name: guest.first_name,
                    last_name: guest.last_name,
                    email: guest.email,
                    phone: guest.phone,
                    nationality: guest.nationality,
                    language: guest.language,
                    preferred_currency: guest.preferred_currency,
                    date_of_birth: guest.date_of_birth,
                    passport_number: guest.passport_number,
                    address_line1: guest.address_line1,
                    address_line2: guest.address_line2,
                    city: guest.city,
                    country: guest.country,
                    postcode: guest.postcode,
                    vip_status: guest.vip_status,
                    marketing_consent: guest.marketing_consent,
                    notes: guest.notes,
                  });
                  setEditing(true);
                }}>
                  <Edit className="w-3.5 h-3.5 mr-1" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span className="ml-1">Save</span>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {renderField("First Name", "first_name", guest, editing, editData, setEditData)}
                {renderField("Last Name", "last_name", guest, editing, editData, setEditData)}
                {renderField("Email", "email", guest, editing, editData, setEditData, Mail)}
                {renderField("Phone", "phone", guest, editing, editData, setEditData, Phone)}
                {renderField("Nationality", "nationality", guest, editing, editData, setEditData, Globe)}
                {renderField("Language", "language", guest, editing, editData, setEditData)}
                {renderField("Currency", "preferred_currency", guest, editing, editData, setEditData)}
                {renderField("Date of Birth", "date_of_birth", guest, editing, editData, setEditData)}
                {renderField("Passport", "passport_number", guest, editing, editData, setEditData)}
                {renderField("Address", "address_line1", guest, editing, editData, setEditData, MapPin)}
                {renderField("City", "city", guest, editing, editData, setEditData)}
                {renderField("Country", "country", guest, editing, editData, setEditData)}
                {renderField("Postcode", "postcode", guest, editing, editData, setEditData)}
              </div>
              {(guest.notes || editing) && (
                <div className="mt-4">
                  <p className="text-xs text-text-muted mb-1">Notes</p>
                  {editing ? (
                    <textarea
                      value={String(editData.notes || "")}
                      onChange={(e) => setEditData({ ...editData, notes: e.target.value || null })}
                      rows={3}
                      className="w-full px-3 py-2 bg-bastet-bg border border-bastet-border rounded-lg text-sm text-text-primary"
                    />
                  ) : (
                    <p className="text-sm text-text-secondary">{guest.notes || "—"}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "preferences" && (
        <PreferenceDnaViewer
          preferences={guest.preferences || null}
          guestId={guest.id}
          editable
        />
      )}

      {activeTab === "bookings" && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">Booking History</h3>
          </CardHeader>
          <CardContent className="p-0">
            {!guest.bookings || guest.bookings.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center px-6">
                <CalendarDays className="w-8 h-8 text-text-muted mb-2" />
                <p className="text-sm text-text-secondary">No bookings found</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-bastet-border">
                    <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Reference</th>
                    <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Apartment</th>
                    <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Check-in</th>
                    <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Nights</th>
                    <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Total</th>
                    <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {guest.bookings.map((booking: Booking) => (
                    <tr key={booking.id} className="border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50">
                      <td className="px-6 py-3">
                        <Link
                          href={`/dashboard/bookings/${booking.id}`}
                          className="text-sm font-mono text-bastet-gold hover:underline"
                        >
                          {booking.reference}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-sm font-mono text-text-secondary">
                        {booking.apartment?.number || "—"}
                      </td>
                      <td className="px-6 py-3 text-sm text-text-secondary">
                        {formatDate(booking.check_in)}
                      </td>
                      <td className="px-6 py-3 text-sm font-mono text-text-secondary">
                        {booking.nights}
                      </td>
                      <td className="px-6 py-3 text-sm font-mono text-text-primary">
                        {formatCurrency(booking.total_amount_gbp)}
                      </td>
                      <td className="px-6 py-3">
                        <Badge status={booking.status} variant="status" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "communications" && (
        <GuestCommunicationList guestId={guest.id} />
      )}

      {activeTab === "activity" && (
        <GuestActivityTimeline guestId={guest.id} />
      )}
    </div>
  );
}

function renderField(
  label: string,
  key: string,
  guest: Guest,
  editing: boolean,
  editData: Partial<Guest>,
  setEditData: (data: Partial<Guest>) => void,
  Icon?: React.ElementType
) {
  const value = (guest as unknown as Record<string, unknown>)[key];

  return (
    <div>
      <p className="text-xs text-text-muted mb-0.5 flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </p>
      {editing ? (
        <input
          type="text"
          value={String((editData as Record<string, unknown>)[key] || "")}
          onChange={(e) => setEditData({ ...editData, [key]: e.target.value || null })}
          className="w-full px-2 py-1 bg-bastet-bg border border-bastet-border rounded text-sm text-text-primary"
        />
      ) : (
        <p className="text-sm text-text-primary">{String(value || "—")}</p>
      )}
    </div>
  );
}
