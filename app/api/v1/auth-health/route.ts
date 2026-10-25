import "server-only";

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../../lib/auth";
import type { ApiResponse } from "../../../../lib/types";

interface AuthHealthData {
  authReachable: boolean;
  supabaseUrl: string | undefined;
  hasSession: boolean;
  userEmail: string | null;
}

export async function GET(): Promise<NextResponse<ApiResponse<AuthHealthData>>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const requestId = `req_${crypto.randomUUID().replaceAll("-", "")}`;

  return NextResponse.json({
    data: {
      authReachable: true,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSession: user !== null,
      userEmail: user?.email ?? null,
    },
    error: null,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  }, {
    headers: { "X-Request-ID": requestId },
  });
}
