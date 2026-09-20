"use client";

import Link from "next/link";
import { useState } from "react";
import { SCHOOL_EMAIL_DOMAIN } from "@/lib/account-rules";
import {
  AuthCard,
  FIELD,
  FormError,
  LABEL,
  SUBMIT,
} from "@/app/components/auth-card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        // Full navigation so the new cookie is sent with the request for the
        // next page, and so the header re-renders as signed in. Everyone lands
        // on their own bookings — that is the question a teacher opens this to
        // answer, and an admin can move on from there.
        window.location.replace("/my");
        return;
      }

      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Could not sign in. Try again.");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Teacher sign in"
      intro={
        <>
          Sign in with your school email and the password you chose. Bookings
          are made in your name, and your own upcoming and past periods are
          listed for you. The session lasts twelve hours, one school day.
        </>
      }
      footer={
        <>
          No account yet?{" "}
          <Link href="/signup" className="text-accent-2 no-underline">
            Sign up with your school email
          </Link>
          . Forgotten your password? Ask the lab in-charge to reset it — it is
          stored hashed and can&rsquo;t be looked up.
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <label htmlFor="email" className={LABEL}>
          School email
        </label>
        <input
          id="email"
          type="email"
          name="email"
          autoComplete="username"
          placeholder={`you@${SCHOOL_EMAIL_DOMAIN}`}
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`${FIELD} mb-[18px]`}
        />

        <label htmlFor="password" className={LABEL}>
          Password
        </label>
        <input
          id="password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`${FIELD} mb-[18px]`}
        />

        <FormError message={error} />

        <button type="submit" disabled={submitting} className={SUBMIT}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthCard>
  );
}
