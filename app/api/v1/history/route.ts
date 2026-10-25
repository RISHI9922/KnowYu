import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient, requireSessionUser } from "../../../../lib/auth";
import { toHttpStatus, toPublicError } from "../../../../lib/errors";
import { getRequestId } from "../../../../lib/request";
import type { ApiFailure, ApiResponse, Citation } from "../../../../lib/types";

interface HistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: ReadonlyArray<Citation>;
  createdAt: string;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<{ messages: ReadonlyArray<HistoryMessage> }>>> {
  const requestId = getRequestId(request);
  const meta = { requestId, timestamp: new Date().toISOString() };

  try {
    const user = await requireSessionUser();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id,role,content,citations,created_at")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error !== null) {
      throw error;
    }

    const messages = (data ?? []).map((message) => ({
      id: message.id,
      role: message.role as "user" | "assistant",
      content: message.content,
      citations: Array.isArray(message.citations)
        ? message.citations as unknown as ReadonlyArray<Citation>
        : [],
      createdAt: message.created_at,
    }));

    return NextResponse.json({ data: { messages }, error: null, meta }, {
      headers: { "X-Request-ID": requestId },
    });
  } catch (cause) {
    const body: ApiFailure = {
      data: null,
      error: toPublicError(cause),
      meta,
    };

    return NextResponse.json(body, {
      status: toHttpStatus(cause),
      headers: { "X-Request-ID": requestId },
    });
  }
}

