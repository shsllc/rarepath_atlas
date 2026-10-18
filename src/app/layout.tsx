import type { Metadata } from "next";
import Link from "next/link";
import { Atkinson_Hyperlegible, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { BrandMark } from "@/components/BrandMark";
import { BRAND } from "@/lib/brand";
import { accountsEnabled, currentUser } from "@/lib/auth/session";
import "./globals.css";

const body = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-body", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-display-face", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-mono-face", display: "swap" });

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: `${BRAND.tagline} Find the research, studies and communities already connected to a rare disease, with the evidence behind every link.`,
};

const NAV = [
  { href: "/#families", label: "For families" },
  { href: "/research", label: "For research teams" },
  { href: "/sources", label: "Sources" },
  { href: "/watch", label: "Watchlist" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = accountsEnabled() ? await currentUser() : null;
  return (
    <html lang="en" className={`${body.variable} ${display.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              <BrandMark size={30} />
              <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap">{BRAND.name}</span>
            </Link>
            <nav aria-label="Main" className="order-3 flex w-full gap-1 overflow-x-auto text-sm sm:order-none sm:w-auto">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-full px-3 py-1.5 whitespace-nowrap text-ink/80 hover:bg-canvas hover:text-ink">
                  {n.label}
                </Link>
              ))}
            </nav>
            {accountsEnabled() && (
              <Link
                href={user ? "/account" : "/account/sign-in"}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap ${user ? "bg-brand-wash text-brand hover:bg-brand/15" : "border border-ink/15 hover:border-brand hover:text-brand"}`}
              >
                {user ? user.name.split(" ")[0] : "Sign in"}
              </Link>
            )}
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="mt-12 border-t border-line bg-white">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm sm:grid-cols-[1.4fr_1fr_1fr]">
            <div className="space-y-2">
              <p className="flex items-center gap-2 font-display font-bold">
                <BrandMark size={22} /> {BRAND.name}
              </p>
              <p className="max-w-sm text-muted">{BRAND.tagline} Research navigation, not medical advice, and not for diagnosis or treatment decisions.</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-bold tracking-[0.12em] text-muted uppercase">Explore</p>
              <Link href="/#families" className="block hover:text-brand">For families</Link>
              <Link href="/research" className="block hover:text-brand">For research teams</Link>
              <Link href="/atlas" className="block hover:text-brand">Coverage atlas</Link>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-bold tracking-[0.12em] text-muted uppercase">Trust</p>
              <Link href="/sources" className="block hover:text-brand">Sources and methods</Link>
              <Link href="/privacy" className="block hover:text-brand">Privacy</Link>
              <p className="text-muted">© {new Date().getFullYear()} {BRAND.company}</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
