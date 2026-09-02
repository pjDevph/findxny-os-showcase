import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// POST /logout — signs the current user out and redirects to /login.
// Used by the admin sidebar sign-out button (<form action="/logout" method="post">).
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  // Use the request origin so the redirect host matches however the app was
  // reached (localhost, 0.0.0.0, LAN IP) rather than a hardcoded fallback.
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
