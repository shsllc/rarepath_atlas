import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "RarePath Atlas",
  description: "Rare shouldn't mean researching alone.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-semibold tracking-tight">RarePath Atlas</span>
              <span className="hidden text-xs text-muted sm:inline">Rare shouldn&apos;t mean researching alone.</span>
            </Link>
            <span className="text-xs text-muted">Research navigation, not medical advice</span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
