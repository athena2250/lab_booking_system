"use client";

import Link from "next/link";
import { useState } from "react";
import {
  EMAIL_RULE,
  PASSWORD_MIN_LENGTH,
  SCHOOL_EMAIL_DOMAIN,
  normaliseEmail,
  normaliseName,
  passwordProblem,
} from "@/lib/account-rules";
import {
  AuthCard,
  FIELD,
  FormError,
  LABEL,
  SUBMIT,
} from "@/app/components/auth-card";

/**
 * Teacher self-registration.
 *
 * The checks here are for the typist's benefit only — they catch a mismatched
 * confirmation before a round trip. `/api/signup` re-runs every one of them
 * against the same `lib/account-rules` module, because this form is not the
 * only way to POST to it.
 */
export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function localProblem(): string | null {
    if (!normaliseName(name)) return "Enter your full name as it should appear on bookings.";
    if (!normaliseEmail(email)) return EMAIL_RULE;
    const problem = passwordProblem(password, email);
    if (problem) return problem;
    if (password !== confirmPassword) return "The two passwords don't match.";
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const problem = localProblem();
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });

      if (res.ok) {
        // The route signs the new teacher in, so this is a full navigation for
        // the same reason the login form's is: the fresh cookie has to be on
        // the request for the next page.
        window.location.replace("/my");
        return;
      }

      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Could not create your account. Try again.");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Create your account"
      intro={
        <>
          For teaching staff with an @{SCHOOL_EMAIL_DOMAIN} address. Choose your
          own password — nobody hands you one, and nobody can read it back.
        </>
      }
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-accent-2 no-underline">
            Sign in
          </Link>
          .
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <label htmlFor="name" className={LABEL}>
          Full name
        </label>
        <input
          id="name"
          type="text"
          name="name"
          autoComplete="name"
          placeholder="Asha Rao"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${FIELD} mb-1.5`}
        />
        <p className="text-muted-3 mb-[18px] text-[12px]">
          This is the name your bookings are made under.
        </p>

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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`${FIELD} mb-1.5`}
        />
        <p className="text-muted-3 mb-[18px] text-[12px]">
          Must end in @{SCHOOL_EMAIL_DOMAIN}. It is how you sign in.
        </p>

        <label htmlFor="password" className={LABEL}>
          Password
        </label>
        <input
          id="password"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`${FIELD} mb-1.5`}
        />
        <p className="text-muted-3 mb-[18px] text-[12px]">
          At least {PASSWORD_MIN_LENGTH} characters. A short phrase you will
          remember beats a clever one you write down.
        </p>

        <label htmlFor="confirmPassword" className={LABEL}>
          Confirm password
        </label>
        <input
          id="confirmPassword"
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={`${FIELD} mb-[18px]`}
        />

        <FormError message={error} />

        <button type="submit" disabled={submitting} className={SUBMIT}>
          {submitting ? "Creating your account…" : "Create account"}
        </button>
      </form>
    </AuthCard>
  );
}
