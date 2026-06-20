import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth, requireRole } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { handleDbError } from "@/lib/api-error";

/**
 * GDPR Data Management API
 *
 * GET  /api/v1/gdpr/export?guest_id=...  — Export all data for a guest (right to portability)
 * POST /api/v1/gdpr/erasure              — Request erasure of a guest's data (right to erasure)
 * GET  /api/v1/gdpr/consent?guest_id=... — Get consent status for a guest
 * POST /api/v1/gdpr/consent              — Update consent for a guest
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "export";
    const guestId = searchParams.get("guest_id");

    if (!guestId) {
      return NextResponse.json(
        { error: "Missing guest_id parameter" },
        { status: 400 }
      );
    }

    if (action === "export") {
      return await exportGuestData(guestId);
    } else if (action === "consent") {
      return await getGuestConsent(guestId);
    } else if (action === "requests") {
      return await getGdprRequests(guestId);
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    console.error("[GDPR API] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;

    const body = await request.json();
    const { action } = body;

    if (action === "erasure") {
      // Only admin/owner can request erasure
      const roleCheck = await requireRole(request, ["owner", "admin"]);
      if (!roleCheck.authenticated) return roleCheck.error!;

      return await requestErasure(body.guest_id, body.reason);
    } else if (action === "consent") {
      return await updateConsent(body);
    } else if (action === "complete_erasure") {
      const roleCheck = await requireRole(request, ["owner", "admin"]);
      if (!roleCheck.authenticated) return roleCheck.error!;

      return await executeErasure(body.request_id);
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    console.error("[GDPR API] POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Export all data associated with a guest (GDPR right to data portability).
 * Collects data from all tables that reference the guest.
 */
async function exportGuestData(guestId: string) {
  const supabase = createServerSupabaseClient();

  const exportData: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    guest_id: guestId,
  };

  // Guest core record
  const { data: guest } = await supabase
    .from("guests")
    .select("*")
    .eq("id", guestId)
    .single();
  exportData.guest = guest;

  // Guest preferences
  const { data: preferences } = await supabase
    .from("guest_preferences")
    .select("*")
    .eq("guest_id", guestId);
  exportData.preferences = preferences || [];

  // Guest communications
  const { data: communications } = await supabase
    .from("guest_communications")
    .select("*")
    .eq("guest_id", guestId);
  exportData.communications = communications || [];

  // Guest activity log
  const { data: activity } = await supabase
    .from("guest_activity_log")
    .select("*")
    .eq("guest_id", guestId);
  exportData.activity_log = activity || [];

  // Bookings
  const { data: bookings } = await supabase
    .from("bookings")
    .select("*")
    .eq("guest_id", guestId);
  exportData.bookings = bookings || [];

  // Reviews
  const { data: reviews } = await supabase
    .from("reviews")
    .select("*")
    .eq("guest_id", guestId);
  exportData.reviews = reviews || [];

  // Loyalty programme
  const { data: loyalty } = await supabase
    .from("loyalty_programme")
    .select("*")
    .eq("guest_id", guestId);
  exportData.loyalty = loyalty || [];

  // Invoices (via bookings)
  const bookingIds = (bookings || []).map((b: { id: string }) => b.id);
  if (bookingIds.length > 0) {
    const { data: invoices } = await supabase
      .from("invoices")
      .select("*")
      .in("booking_id", bookingIds);
    exportData.invoices = invoices || [];
  }

  // Consent records
  const { data: consent } = await supabase
    .from("guest_consent")
    .select("*")
    .eq("guest_id", guestId);
  exportData.consent = consent || [];

  // Log the export
  await logAudit(supabase, {
    action: "gdpr_data_export",
    category: "system",
    resource_type: "guest",
    resource_id: guestId,
    description: `GDPR data export for guest ${guestId}`,
    new_data: { tables_exported: Object.keys(exportData).length },
  });

  // Create GDPR request record
  await supabase.from("gdpr_requests").insert({
    guest_id: guestId,
    request_type: "export",
    status: "completed",
    completed_at: new Date().toISOString(),
  });

  return NextResponse.json({
    data: exportData,
    meta: {
      tables_included: Object.keys(exportData).length,
      generated_at: exportData.exported_at,
    },
  });
}

/**
 * Request erasure of a guest's data (GDPR right to erasure).
 * Creates a pending request — actual deletion happens after approval.
 */
async function requestErasure(guestId: string, reason?: string) {
  const supabase = createServerSupabaseClient();

  // Verify guest exists
  const { data: guest } = await supabase
    .from("guests")
    .select("id, first_name, last_name")
    .eq("id", guestId)
    .single();

  if (!guest) {
    return NextResponse.json(
      { error: "Guest not found" },
      { status: 404 }
    );
  }

  // Create erasure request (30 days to complete per GDPR)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const { data: request, error } = await supabase
    .from("gdpr_requests")
    .insert({
      guest_id: guestId,
      request_type: "erasure",
      status: "pending",
      expires_at: expiresAt.toISOString(),
      notes: reason || "GDPR right to erasure request",
    })
    .select("*")
    .single();

  if (error) return handleDbError(error);

  await logAudit(supabase, {
    action: "gdpr_erasure_requested",
    category: "system",
    resource_type: "guest",
    resource_id: guestId,
    description: `GDPR erasure requested for ${guest.first_name} ${guest.last_name}. Reason: ${reason || "Not specified"}`,
    new_data: { request_id: request?.id, expires_at: expiresAt.toISOString() },
  });

  return NextResponse.json({
    data: {
      request_id: request?.id,
      guest_id: guestId,
      status: "pending",
      expires_at: expiresAt.toISOString(),
      message: "Erasure request created. Must be completed within 30 days per GDPR Article 17.",
    },
  });
}

/**
 * Execute the actual erasure of a guest's data.
 * Anonymizes PII while keeping operational records (financial, audit) as required by law.
 */
async function executeErasure(requestId: string) {
  const supabase = createServerSupabaseClient();

  // Get the request
  const { data: gdprRequest } = await supabase
    .from("gdpr_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (!gdprRequest) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const guestId = gdprRequest.guest_id;

  // Anonymize guest record (keep the row for financial/audit trail, but strip PII)
  await supabase
    .from("guests")
    .update({
      first_name: "[REDACTED]",
      last_name: "[REDACTED]",
      email: `redacted_${guestId.substring(0, 8)}@erasure.hospitai.uk`,
      phone: null,
      passport_number: null,
      nationality: null,
      address: null,
      city: null,
      postal_code: null,
      notes: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", guestId);

  // Delete guest preferences
  await supabase.from("guest_preferences").delete().eq("guest_id", guestId);

  // Delete guest communications
  await supabase.from("guest_communications").delete().eq("guest_id", guestId);

  // Delete guest activity log
  await supabase.from("guest_activity_log").delete().eq("guest_id", guestId);

  // Delete reviews (personal opinions — erasable)
  await supabase.from("reviews").delete().eq("guest_id", guestId);

  // Delete consent records
  await supabase.from("guest_consent").delete().eq("guest_id", guestId);

  // NOTE: Bookings, invoices, and payments are NOT deleted — required by law for financial records.
  // The guest_id references remain but the guest record is anonymized.

  // Mark request as completed
  await supabase
    .from("gdpr_requests")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  await logAudit(supabase, {
    action: "gdpr_erasure_completed",
    category: "system",
    resource_type: "guest",
    resource_id: guestId,
    description: `GDPR erasure executed for guest ${guestId}. PII anonymized, personal data deleted, financial records retained per law.`,
  });

  return NextResponse.json({
    data: {
      request_id: requestId,
      guest_id: guestId,
      status: "completed",
      message: "Erasure completed. Guest PII anonymized. Financial records retained per legal requirements.",
    },
  });
}

/**
 * Get consent status for a guest.
 */
async function getGuestConsent(guestId: string) {
  const supabase = createServerSupabaseClient();

  const { data: consent, error } = await supabase
    .from("guest_consent")
    .select("*")
    .eq("guest_id", guestId);

  if (error) return handleDbError(error);

  return NextResponse.json({ data: consent || [] });
}

/**
 * Update consent for a guest.
 */
async function updateConsent(body: {
  guest_id: string;
  consent_type: string;
  granted: boolean;
  method?: string;
  notes?: string;
}) {
  const supabase = createServerSupabaseClient();

  if (!body.guest_id || !body.consent_type || typeof body.granted !== "boolean") {
    return NextResponse.json(
      { error: "Missing required fields: guest_id, consent_type, granted" },
      { status: 400 }
    );
  }

  const validTypes = ["marketing", "analytics", "profiling", "third_party_sharing"];
  if (!validTypes.includes(body.consent_type)) {
    return NextResponse.json(
      { error: `Invalid consent type. Must be one of: ${validTypes.join(", ")}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("guest_consent")
    .upsert({
      guest_id: body.guest_id,
      consent_type: body.consent_type,
      granted: body.granted,
      granted_at: body.granted ? new Date().toISOString() : null,
      withdrawn_at: !body.granted ? new Date().toISOString() : null,
      method: body.method || "explicit",
      notes: body.notes,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "guest_id,consent_type",
    })
    .select("*")
    .single();

  if (error) return handleDbError(error);

  await logAudit(supabase, {
    action: `consent_${body.granted ? "granted" : "withdrawn"}`,
    category: "system",
    resource_type: "guest",
    resource_id: body.guest_id,
    description: `Consent ${body.granted ? "granted" : "withdrawn"} for ${body.consent_type}`,
    new_data: { consent_type: body.consent_type, granted: body.granted },
  });

  return NextResponse.json({ data });
}

/**
 * Get GDPR requests for a guest.
 */
async function getGdprRequests(guestId: string) {
  const supabase = createServerSupabaseClient();

  const { data: requests, error } = await supabase
    .from("gdpr_requests")
    .select("*")
    .eq("guest_id", guestId)
    .order("requested_at", { ascending: false });

  if (error) return handleDbError(error);

  return NextResponse.json({ data: requests || [] });
}