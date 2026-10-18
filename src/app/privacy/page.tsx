import Link from "next/link";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  const h2 = "font-display text-xl font-bold";
  return (
    <article className="mx-auto max-w-2xl space-y-6 leading-relaxed">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Privacy notice · updated 18 October 2026</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">What {BRAND.name} keeps, and what it never does</h1>
        <p className="mt-2 text-muted">
          What someone searches for can reveal a family&apos;s diagnosis. {BRAND.name} is built to need as little about you as possible. It is run by {BRAND.company}.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className={h2}>Never</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>No advertising, ad networks or tracking pixels.</li>
          <li>Searches, watchlists and account data are never sold, rented or shared with data brokers.</li>
          <li>No one can pay to change a ranking or a brief.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className={h2}>Without an account</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Searches are processed to build your results and briefly cached (up to an hour) so repeat searches are fast. They are not tied to you.</li>
          <li>A watchlist uses a random key stored in a cookie in your browser. Only a scrambled form of that key is stored with the list, alongside the searches you chose to watch.</li>
          <li>Our host (Netlify) keeps standard server logs, including IP addresses, for security and reliability.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className={h2}>With an account</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your email, optional name and password are handled by Amazon Cognito (AWS, United States, Oregon region). We never see or store your password.</li>
          <li>Your profile, organisation memberships and invitations are stored in our database on AWS.</li>
          <li>We count live discovery searches and AI explanations per day so limits can be set fairly. Counts are deleted after 40 days.</li>
          <li>Your watchlist is linked to your account so it works on every device.</li>
          <li>If you review evidence, your name and organisation appear on the decisions you make and in the public audit log. They stay there after you delete your account, because other people rely on that record.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className={h2}>Services that process data for us</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Netlify: website hosting and storage for watchlists, review records and shared briefs.</li>
          <li>Amazon Web Services: sign-in (Cognito) and account data.</li>
          <li>OpenAI: writes plain-language explanations when you ask for one. Only the evidence records being explained are sent, never your account details.</li>
          <li>Public research sources (PubMed, ClinicalTrials.gov and others listed on the sources page) receive the disease name you search, not who you are.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className={h2}>Your choices</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Delete a browser watchlist from the watchlist page.</li>
          <li>
            Delete your account from{" "}
            <Link href="/account" className="text-brand underline">
              your account page
            </Link>
            . This removes your sign-in, profile, memberships and usage history.
          </li>
          <li>Questions or requests: {BRAND.contact || `contact ${BRAND.company} through quirkworksllc.com`}.</li>
        </ul>
      </section>

      <p className="text-sm text-muted">{BRAND.name} is research navigation, not medical advice, and is not for diagnosis or treatment decisions.</p>
    </article>
  );
}
