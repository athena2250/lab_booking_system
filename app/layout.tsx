import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DM_Sans, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { LAB_NAME, SCHOOL_NAME } from "@/lib/branding";
import { SiteHeader } from "@/app/components/site-header";
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
  // Drives only which links the header offers. `proxy.ts` is what actually
  // guards the routes, so a stale or forged cookie here costs nothing.
  const session = (await cookies()).get(COOKIE_NAME)?.value;
  const signedIn = await verifySessionToken(session);

  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${spaceGrotesk.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="bg-ink text-fg flex min-h-full flex-col font-sans">
        <SiteHeader signedIn={signedIn} />
        <div className="flex flex-1 flex-col">{children}</div>
        <footer className="border-line text-muted-3 border-t px-6 py-7 text-center text-[13px]">
          {LAB_NAME} · {SCHOOL_NAME}
        </footer>
      </body>
    </html>
  );
}
