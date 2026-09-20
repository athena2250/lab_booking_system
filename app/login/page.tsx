"use client";

import { useState } from "react";

const FIELD =
  "bg-field border-edge-strong text-fg w-full rounded-[10px] border px-3.5 py-3.5 text-[15px] outline-none focus:border-accent";

export default function LoginPage() {
  const [username, setUsername] = useState("");
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
        body: JSON.stringify({ username, password }),
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
    <main className="grid flex-1 place-items-center px-6 py-15">
      <div className="border-edge bg-surface w-full max-w-[420px] rounded-[18px] border p-9">
        <span className="bg-accent text-ink font-display mb-6 grid size-[38px] place-items-center rounded-[10px] text-[19px] font-bold">
          L
        </span>
        <h1 className="font-display m-0 mb-2 text-2xl font-semibold tracking-[-0.02em]">
          Teacher sign in
        </h1>
        <p className="text-muted-3 m-0 mb-7 text-[14.5px] leading-[1.55]">
          Sign in as yourself — bookings are made in your name, and your own
          upcoming and past periods are listed for you. The session lasts twelve
          hours, one school day.
        </p>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="username"
            className="text-muted mb-2 block text-[13px]"
          >
            Username
          </label>
          <input
            id="username"
            type="text"
            name="username"
            autoComplete="username"
            required
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={`${FIELD} mb-[18px]`}
          />

          <label
            htmlFor="password"
            className="text-muted mb-2 block text-[13px]"
          >
            Passcode
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

          {error && (
            <p
              role="alert"
              className="text-accent-3 mb-[18px] rounded-[10px] border border-[rgba(255,90,54,0.35)] bg-[rgba(255,90,54,0.08)] px-3.5 py-3 text-sm"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="bg-accent text-ink w-full cursor-pointer rounded-[10px] py-3.5 text-[15px] font-semibold disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-muted-3 mt-5 mb-0 text-[12.5px] leading-[1.5]">
          Your own username and passcode. Ask the lab in-charge if you
          don&rsquo;t have one yet, or to have yours reset.
        </p>
      </div>
    </main>
  );
}
