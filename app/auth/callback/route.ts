import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../lib/auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");

  if (code === null) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", request.url),
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error !== null) {
    return NextResponse.redirect(
      new URL("/login?error=auth_failed", request.url),
    );
  }

  return NextResponse.redirect(new URL("/", request.url));
}

