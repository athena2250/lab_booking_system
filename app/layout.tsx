import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { LAB_NAME, SCHOOL_NAME } from "@/lib/branding";
import { SiteHeader } from "@/app/components/site-header";
import { THEME_COOKIE, parseTheme, themeAttribute } from "@/lib/theme";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // What a teacher sees in the browser tab and in a bookmark on their phone
  // home screen — the scaffold's default read as a stray developer page.
  title: LAB_NAME,
  description: "Book a school lab period.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Drives only which links the header offers and whose name it shows.
  // `proxy.ts` is what actually guards the routes, so a stale cookie here costs
  // nothing — and a forged one cannot get past the signature check.
  const session = await getSession();

  // Read here rather than in the toggle so the palette is already pinned in the
  // first byte of HTML. The usual alternative — a blocking inline script that
  // reads localStorage before paint — buys nothing once a cookie is in play,
  // and this layout is request-scoped anyway for the session above.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      // Absent when the teacher has expressed no preference, which is what lets
      // `color-scheme: light dark` fall through to the device.
      data-theme={themeAttribute(theme)}
      className={`${dmSans.variable} ${spaceGrotesk.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="bg-ink text-fg flex min-h-full flex-col font-sans">
        <SiteHeader session={session} theme={theme} />
        <div className="flex flex-1 flex-col">{children}</div>
        <footer className="border-line text-muted-3 border-t px-6 py-7 text-center text-[13px]">
          {LAB_NAME} · {SCHOOL_NAME}
        </footer>
      </body>
    </html>
  );
}
