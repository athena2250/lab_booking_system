"use client";

import { useActionState } from "react";
import { changePassword, updateName } from "@/app/profile/actions";
import {
  IDLE_PROFILE_RESULT,
  type ProfileResult,
} from "@/app/profile/action-result";
import { PASSWORD_MIN_LENGTH } from "@/lib/account-rules";

const FIELD =
  "border-edge bg-field text-fg h-[42px] w-full rounded-[10px] border px-3 text-sm outline-none focus:border-accent";

const SUBMIT =
  "bg-accent text-ink h-[42px] cursor-pointer rounded-[10px] px-5 text-sm font-semibold disabled:opacity-60";

export function NameForm({ name }: { name: string }) {
  const [result, action, pending] = useActionState(
    updateName,
    IDLE_PROFILE_RESULT,
  );

  return (
    <Card
      title="Your name"
      note="Bookings you make from now on are attributed to this. Ones already made keep the name they were made under."
    >
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field
          name="name"
          label="Full name"
          defaultValue={name}
          autoComplete="name"
        />
        <button type="submit" disabled={pending} className={`${SUBMIT} self-end`}>
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
      <Result result={result} />
    </Card>
  );
}

export function PasswordForm() {
  const [result, action, pending] = useActionState(
    changePassword,
    IDLE_PROFILE_RESULT,
  );

  return (
    <Card
      title="Change your password"
      note={`At least ${PASSWORD_MIN_LENGTH} characters. Your current password is required — the session alone isn't enough to hand your account over.`}
    >
      {/* Keyed on the result so a successful change empties the three boxes.
          Leaving a password sitting in a field on a shared staff-room laptop is
          exactly the thing this form exists to prevent. */}
      <form
        key={result.ok && result.message ? result.message : "idle"}
        action={action}
        className="grid gap-3 sm:grid-cols-3"
      >
        <Field
          name="currentPassword"
          label="Current password"
          type="password"
          autoComplete="current-password"
        />
        <Field
          name="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
        />
        <Field
          name="confirmPassword"
          label="Confirm new"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
        />
        <button
          type="submit"
          disabled={pending}
          className={`${SUBMIT} sm:col-start-3 sm:justify-self-end`}
        >
          {pending ? "Changing…" : "Change password"}
        </button>
      </form>
      <Result result={result} />
    </Card>
  );
}

function Card({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-edge bg-surface rounded-2xl border p-5">
      <h2 className="font-display m-0 mb-1.5 text-[17px] font-semibold tracking-[-0.015em]">
        {title}
      </h2>
      <p className="text-muted-3 m-0 mb-4 text-[13px] leading-[1.5]">{note}</p>
      {children}
    </section>
  );
}

function Result({ result }: { result: ProfileResult }) {
  if (!result.ok) {
    return (
      <p className="border-accent-edge bg-accent-tint text-accent-3 mt-4 mb-0 rounded-[10px] border px-4 py-3 text-[13.5px]">
        {result.error}
      </p>
    );
  }
  if (!result.message) return null;
  return (
    <p className="border-edge bg-ink-2 text-ok mt-4 mb-0 rounded-[10px] border px-4 py-3 text-[13.5px]">
      {result.message}
    </p>
  );
}

function Field({
  name,
  label,
  ...input
}: { name: string; label: string } & React.ComponentProps<"input">) {
  return (
    <label className="block">
      <span className="text-muted-2 mb-1.5 block text-[11px] tracking-[0.1em] uppercase">
        {label}
      </span>
      <input {...input} name={name} required className={FIELD} />
    </label>
  );
}
