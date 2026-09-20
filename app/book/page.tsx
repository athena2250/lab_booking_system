import { requireSession } from "@/lib/session";
import { BookForm } from "@/app/book/book-form";

// The form needs to know who is booking, and that comes from the session cookie
// rather than a text field — so the route is a server component that reads the
// session and hands the name to the client form.
export const dynamic = "force-dynamic";

export default async function BookPage() {
  const session = await requireSession();
  return <BookForm teacherName={session.name} />;
}
