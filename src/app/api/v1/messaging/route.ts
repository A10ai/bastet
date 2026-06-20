import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { getActivePropertyId } from "@/lib/api-property";

// ---------------------------------------------------------------------------
// Templates — use {property_name} placeholder, resolved at request time
// Wi-Fi credentials from env var (never hardcode secrets in source)
// ---------------------------------------------------------------------------

const WIFI_SSID = process.env.WIFI_SSID || "GuestWiFi";
const WIFI_PASSWORD = process.env.WIFI_PASSWORD || "ContactReception";

function getMessageTemplates(propertyName: string) {
  return [
    {
      id: "pre_arrival",
      name: "Pre-Arrival Welcome",
      subject: `Your Stay at ${propertyName}`,
      body: `Dear {guest_name},\n\nWe're looking forward to welcoming you tomorrow! Your apartment {apartment_number} on Floor {floor} is being prepared.\n\nCheck-in time: 2:00 PM\nWi-Fi: ${WIFI_SSID} / ${WIFI_PASSWORD}\n\nNeed airport transfer? Reply to this message.\n\nWarm regards,\n${propertyName}`,
    },
    {
      id: "check_in",
      name: "Check-In Confirmation",
      subject: `Welcome to ${propertyName}!`,
      body: `Dear {guest_name},\n\nWelcome! You're checked into apartment {apartment_number}.\n\n🔑 Your digital key is active\n📶 Wi-Fi: ${WIFI_SSID} / ${WIFI_PASSWORD}\n🏊 Pool hours: 7AM - 10PM\n🍽️ Breakfast: 7AM - 10:30AM\n\nNeed anything? Just reply here.\n\nEnjoy your stay!\n${propertyName} Team`,
    },
    {
      id: "mid_stay",
      name: "Mid-Stay Check",
      subject: "How's your stay?",
      body: `Dear {guest_name},\n\nHope you're enjoying ${propertyName}! Just checking in.\n\nWould you like:\n- Room cleaning today?\n- Restaurant recommendations?\n- Excursion bookings?\n\nWe're here to help.\n\n${propertyName} Team`,
    },
    {
      id: "check_out",
      name: "Checkout Reminder",
      subject: "Checkout Tomorrow",
      body: `Dear {guest_name},\n\nJust a reminder that checkout is tomorrow by 11:00 AM.\n\nWould you like:\n- Late checkout? (Subject to availability)\n- Airport transfer?\n- To extend your stay?\n\nYour invoice will be ready at reception.\n\nThank you for staying with us!\n${propertyName}`,
    },
    {
      id: "post_stay",
      name: "Post-Stay Thank You",
      subject: "Thank you for staying with us!",
      body: `Dear {guest_name},\n\nThank you for choosing ${propertyName}!\n\nWe'd love your feedback — it takes just 2 minutes:\n{review_link}\n\nBook direct for 10% off your next stay: hospitai.uk\n\nWe hope to see you again!\n${propertyName} Team`,
    },
    {
      id: "special_offer",
      name: "Special Offer",
      subject: `Exclusive Offer from ${propertyName}`,
      body: `Dear {guest_name},\n\nAs a valued guest, we'd like to offer you an exclusive rate for your next visit.\n\n{offer_details}\n\nBook direct at hospitai.uk or reply to this message.\n\n${propertyName} Team`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function sevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type");

    // Resolve active property name for templates
    const propertyId = await getActivePropertyId(request);
    let propertyName = "Property";
    if (propertyId) {
      const { data: propData } = await supabase
        .from("properties")
        .select("name")
        .eq("id", propertyId)
        .single();
      if (propData?.name) propertyName = propData.name;
    }

    // ----- overview -----
    if (type === "overview") {
      const todayStr = today();
      const tomorrowStr = tomorrow();
      const sevenDaysAgoStr = sevenDaysAgo();

      const [arrivals, departures, arrivalsTomorrow, messagesSent] =
        await Promise.all([
          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("check_in", todayStr)
            .in("status", ["confirmed", "checked_in"]),
          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("check_out", todayStr)
            .in("status", ["confirmed", "checked_in"]),
          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("check_in", tomorrowStr)
            .in("status", ["confirmed", "checked_in"]),
          supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("category", "guest_message")
            .gte("created_at", sevenDaysAgoStr),
        ]);

      return NextResponse.json({
        data: {
          arrivals_today: arrivals.count ?? 0,
          departures_today: departures.count ?? 0,
          arrivals_tomorrow: arrivalsTomorrow.count ?? 0,
          messages_sent_7d: messagesSent.count ?? 0,
        },
      });
    }

    // ----- arrivals -----
    if (type === "arrivals") {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          `
          *,
          guest:guests(id, first_name, last_name, email, phone),
          apartment:apartments(id, number, floor, apartment_type:apartment_types(id, name))
        `
        )
        .eq("check_in", today())
        .in("status", ["confirmed", "checked_in"])
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ data });
    }

    // ----- departures -----
    if (type === "departures") {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          `
          *,
          guest:guests(id, first_name, last_name, email, phone),
          apartment:apartments(id, number, floor, apartment_type:apartment_types(id, name))
        `
        )
        .eq("check_out", today())
        .in("status", ["confirmed", "checked_in"])
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ data });
    }

    // ----- templates -----
    if (type === "templates") {
      return NextResponse.json({ data: getMessageTemplates(propertyName) });
    }

    // ----- history -----
    if (type === "history") {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("category", "guest_message")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ data });
    }

    return NextResponse.json(
      { error: "Missing or invalid type parameter. Use: overview, arrivals, departures, templates, history" },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST — Send a guest message
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const { guest_id, subject, body: messageBody } = body;

    if (!subject || !messageBody) {
      return NextResponse.json(
        { error: "Missing required fields: subject, body" },
        { status: 400 }
      );
    }

    // Get first staff member as sender
    const { data: staff } = await supabase
      .from("staff")
      .select("id")
      .limit(1)
      .single();

    if (!staff) {
      return NextResponse.json(
        { error: "No staff found to attribute message" },
        { status: 500 }
      );
    }

    const { data, error } = await supabase
      .from("notifications")
      .insert({
        staff_id: staff.id,
        title: subject,
        message: messageBody,
        type: "guest_message",
        category: "guest_message",
        link: guest_id ? `/dashboard/guests/${guest_id}` : null,
        read: false,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { data: { success: true, id: data.id } },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
