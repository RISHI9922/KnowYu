import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { AppError } from "./errors";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (items: Array<{
          name: string;
          value: string;
          options: CookieOptions;
        }>) => {
          try {
            items.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot write cookies. Middleware refreshes them.
          }
        },
      },
    },
  );
}

export async function getSessionUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function requireSessionUser() {
  const user = await getSessionUser();

  if (user === null) {
    throw new AppError("UNAUTHORIZED", { message: "Sign in required." });
  }

  return user;
}

