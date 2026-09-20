/** The shell the sign-in and sign-up forms share. They sit side by side in the
 *  same flow — a teacher who picks the wrong one follows a link to the other —
 *  so they have to look like two doors into one building, not two apps. */
export function AuthCard({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="grid flex-1 place-items-center px-6 py-15">
      <div className="border-edge bg-surface w-full max-w-[420px] rounded-[18px] border p-9">
        <span className="bg-accent text-ink font-display mb-6 grid size-[38px] place-items-center rounded-[10px] text-[19px] font-bold">
          L
        </span>
        <h1 className="font-display m-0 mb-2 text-2xl font-semibold tracking-[-0.02em]">
          {title}
        </h1>
        <p className="text-muted-3 m-0 mb-7 text-[14.5px] leading-[1.55]">
          {intro}
        </p>
        {children}
        <p className="text-muted-3 mt-5 mb-0 text-[12.5px] leading-[1.5]">
          {footer}
        </p>
      </div>
    </main>
  );
}

export const FIELD =
  "bg-field border-edge-strong text-fg w-full rounded-[10px] border px-3.5 py-3.5 text-[15px] outline-none focus:border-accent";

export const LABEL = "text-muted mb-2 block text-[13px]";

export const SUBMIT =
  "bg-accent text-ink w-full cursor-pointer rounded-[10px] py-3.5 text-[15px] font-semibold disabled:opacity-60";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="text-accent-3 mb-[18px] rounded-[10px] border border-accent-edge bg-accent-tint px-3.5 py-3 text-sm"
    >
      {message}
    </p>
  );
}
