import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // 1. Verify the email belongs to an active staff member (quick check,
    //    before attempting auth — avoids unnecessary auth calls for unknown emails)
    const adminSupabase = createAdminClient();
    const { data: staffMember, error: staffError } = await adminSupabase
      .from("staff")
      .select("id, first_name, last_name, role, property_id, is_active")
      .eq("email", email)
      .eq("is_active", true)
      .single();

    if (staffError || !staffMember) {
      return NextResponse.json(
        { error: "Invalid credentials or inactive account" },
        { status: 401 }
      );
    }

    // 2. Verify the password via Supabase Auth
    //    Build an SSR client that can set cookies on the response
    const response = NextResponse.next();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            response.cookies.set(name, value, options);
          },
          remove(name: string, options: CookieOptions) {
            response.cookies.set(name, "", { ...options, maxAge: 0 });
          },
        },
      }
    );

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.session) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // 3. Return staff data + set session cookies on the response
    // Copy cookies set by the SSR client onto our response
    const authResponse = NextResponse.json({
      data: {
        staff: {
          id: staffMember.id,
          first_name: staffMember.first_name,
          last_name: staffMember.last_name,
          role: staffMember.role,
          property_id: staffMember.property_id,
        },
      },
    });

    // Transfer all Set-Cookie headers from the intermediate response
    const setCookies = response.cookies.getAll();
    for (const cookie of setCookies) {
      authResponse.cookies.set(cookie.name, cookie.value, {
        ...cookie,
      });
    }

    return authResponse;
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}