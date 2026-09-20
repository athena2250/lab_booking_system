"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createTeacher,
  resetPasscode,
  setActive,
  setRole,
} from "@/app/admin/actions";
import {
  IDLE_RESULT,
  type ActionResult,
  type Credentials,
} from "@/app/admin/action-result";
import type { Role } from "@/lib/auth";

export type TeacherRow = {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  bookings: number;
};

const COLUMNS = "grid grid-cols-[1.2fr_1fr_0.7fr_1.5fr] items-center gap-4 px-5";

export function TeacherAdmin({
  teachers,
  currentAdminId,
}: {
  teachers: TeacherRow[];
  currentAdminId: string;
}) {
  const [created, createAction, creating] = useActionState(
    createTeacher,
    IDLE_RESULT,
  );
  // The row actions aren't forms, so their outcome is held here rather than in
  // `useActionState`. Whichever happened last is the one worth showing.
  const [rowResult, setRowResult] = useState<ActionResult | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const latest = rowResult ?? created;

  function run(id: string, action: () => Promise<ActionResult>) {
    setPendingId(id);
    startTransition(async () => {
      const result = await action();
      setRowResult(result);
      setPendingId(null);
    });
  }

  return (
    <>
      <form
        action={createAction}
        onSubmit={() => setRowResult(null)}
        className="border-edge bg-surface mb-6 rounded-2xl border p-5"
      >
        <h2 className="font-display m-0 mb-4 text-[17px] font-semibold tracking-[-0.015em]">
          Add a teacher
        </h2>
        <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_auto_auto]">
          <Field name="name" label="Full name" placeholder="Asha Rao" />
          <Field
            name="username"
            label="Username"
            placeholder="asha"
            autoComplete="off"
            spellCheck={false}
          />
          <label className="block">
            <span className="text-muted-2 mb-1.5 block text-[11px] tracking-[0.1em] uppercase">
              Role
            </span>
            <select
              name="role"
              defaultValue="TEACHER"
              className="border-edge bg-field text-fg h-[42px] rounded-[10px] border px-3 text-sm"
            >
              <option value="TEACHER">Teacher</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={creating}
            className="bg-accent text-ink h-[42px] cursor-pointer self-end rounded-[10px] px-5 text-sm font-semibold disabled:opacity-60"
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </form>

      {latest && <Result result={latest} />}

      <div className="border-edge bg-surface overflow-x-auto rounded-2xl border">
        <div className="min-w-[720px]">
          <div
            className={`${COLUMNS} border-line bg-ink-2 text-muted-2 border-b py-3.5 text-xs tracking-[0.1em] uppercase`}
          >
            <span>Name</span>
            <span>Username</span>
            <span>Bookings</span>
            <span className="text-right">Actions</span>
          </div>

          {teachers.map((t) => {
            const isSelf = t.id === currentAdminId;
            const busy = pendingId === t.id;
            return (
              <div
                key={t.id}
                className={`${COLUMNS} border-line border-b py-3.5 text-[14px] last:border-b-0 ${
                  t.active ? "" : "opacity-55"
                }`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-fg-2">{t.name}</span>
                  {t.role === "ADMIN" && <Tag>Admin</Tag>}
                  {!t.active && <Tag>Retired</Tag>}
                  {isSelf && <Tag>You</Tag>}
                </span>
                <span className="text-muted font-mono text-[13px]">
                  {t.username}
                </span>
                <span className="text-muted-3">{t.bookings}</span>
                <span className="flex flex-wrap justify-end gap-1.5">
                  <RowButton
                    disabled={busy}
                    onClick={() => run(t.id, () => resetPasscode(t.id))}
                  >
                    Reset passcode
                  </RowButton>
                  {/* An admin can't change their own role or retire themselves —
                      the server refuses it too, this just doesn't offer it. */}
                  {!isSelf && (
                    <>
                      <RowButton
                        disabled={busy}
                        onClick={() =>
                          run(t.id, () =>
                            setRole(
                              t.id,
                              t.role === "ADMIN" ? "TEACHER" : "ADMIN",
                            ),
                          )
                        }
                      >
                        {t.role === "ADMIN" ? "Make teacher" : "Make admin"}
                      </RowButton>
                      <RowButton
                        disabled={busy}
                        onClick={() => run(t.id, () => setActive(t.id, !t.active))}
                      >
                        {t.active ? "Retire" : "Restore"}
                      </RowButton>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Result({ result }: { result: ActionResult }) {
  if (!result.ok) {
    return (
      <p className="border-accent/40 bg-accent/10 text-accent-3 mb-6 rounded-[10px] border px-4 py-3 text-[13.5px]">
        {result.error}
      </p>
    );
  }
  if (!result.message) return null;
  return (
    <div className="border-edge bg-ink-2 mb-6 rounded-[10px] border px-4 py-3">
      <p className="text-ok m-0 text-[13.5px]">{result.message}</p>
      {result.credentials && <Handover credentials={result.credentials} />}
    </div>
  );
}

/** The one and only time the passcode exists in readable form. */
function Handover({ credentials }: { credentials: Credentials }) {
  return (
    <div className="border-line mt-3 border-t pt-3">
      <p className="text-muted-2 m-0 mb-2 text-[12.5px]">
        Write this down and hand it over in person. It is not stored and cannot
        be shown again — a lost passcode is reset, never looked up.
      </p>
      <p className="font-mono m-0 text-[14px]">
        <span className="text-muted-3">username </span>
        <span className="text-fg">{credentials.username}</span>
        <span className="text-muted-3"> · passcode </span>
        <span className="text-accent-2">{credentials.passcode}</span>
      </p>
    </div>
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
      <input
        {...input}
        name={name}
        required
        className="border-edge bg-field text-fg h-[42px] w-full rounded-[10px] border px-3 text-sm"
      />
    </label>
  );
}

function RowButton({
  children,
  ...button
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...button}
      className="border-edge text-muted-2 hover:text-fg hover:border-edge-strong cursor-pointer rounded-[8px] border px-2.5 py-1.5 text-[12.5px] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-edge text-muted-2 rounded-[5px] border px-1.5 py-0.5 text-[10.5px] tracking-[0.06em] uppercase">
      {children}
    </span>
  );
}
