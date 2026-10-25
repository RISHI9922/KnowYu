"use client";

import { FormEvent, useEffect, useState } from "react";

import { createSupabaseBrowserClient } from "../../lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");

    if (error === "auth_failed") {
      setUrlError("Sign-in failed. Please try again.");
    } else if (error === "missing_code") {
      setUrlError("The magic link is invalid or expired. Request a new one.");
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    setMessage(error === null ? "Check your email for the sign-in link." : error.message);
    setPending(false);
  }

  return (
    <section className="auth-card" aria-labelledby="login-heading">
      <h2 id="login-heading">Sign in to KnowYu</h2>
      <p>Enter your email and we&apos;ll send you a secure magic link.</p>
      {urlError === null ? null : <p className="form-error" role="alert">{urlError}</p>}
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button className="button-primary" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send magic link"}
        </button>
      </form>
      {message === null ? null : <p role="status">{message}</p>}
    </section>
  );
}

