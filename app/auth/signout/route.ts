import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../lib/auth";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}

