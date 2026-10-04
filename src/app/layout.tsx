import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import "./globals.css";

export const metadata: Metadata = {
  title: "RarePath Atlas",
  description: "Rare shouldn't mean researching alone.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-line bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <BrandMark size={26} />
              <span className="whitespace-nowrap font-semibold tracking-tight">
                RarePath <span className="text-brand">Atlas</span>
              </span>
              <span className="hidden text-xs text-muted sm:inline">Rare shouldn&apos;t mean researching alone.</span>
            </Link>
            <span className="max-w-[9rem] text-right text-[11px] leading-tight text-muted sm:max-w-none sm:text-xs">Research navigation, not medical advice</span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
