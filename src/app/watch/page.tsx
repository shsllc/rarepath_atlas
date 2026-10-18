import Link from "next/link";
import { headers } from "next/headers";
import { watchKey } from "@/lib/watch/key";
import { feedToken, listWatches, MAX_WATCHES } from "@/lib/watch";
import { CopyField, ForgetButton, WatchRow } from "@/components/watch/WatchControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Watchlist · RarePath Atlas", robots: { index: false } };

export default async function WatchPage() {
  const { key, account } = await watchKey();
  const watches = key ? await listWatches(key) : [];
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Your watchlist</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Watch up to {MAX_WATCHES} searches and see what has appeared since you last looked: reviewed relationships, papers, preprints, clinical studies and NIH-funded projects. {account
            ? "Signed in: this list follows your account on every device."
            : "No account is needed. The list is tied to this browser by a private cookie, and nothing that identifies you is stored with it. Sign in to keep it on every device."}
        </p>
      </div>
      {watches.length === 0 ? (
        <p className="rounded-xl border border-dotted border-line bg-white p-6 text-muted">
          Nothing watched yet. Search for a disease and choose &ldquo;Watch for new research&rdquo;.{" "}
          <Link href="/" className="text-brand underline">
            Search
          </Link>
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
            {watches.map((w) => (
              <WatchRow key={w.id} query={w.query} label={w.label} lastSeen={w.last_seen_at} />
            ))}
          </ul>
          <section className="rounded-2xl border border-line bg-white p-5 text-sm">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Get alerts in a feed reader</h2>
            <p className="mt-1 text-muted">
              Add this private Atom feed to any feed reader to be told when something new appears. It is read-only and checked at most every 15 minutes. Anyone with the link can see which searches you watch, so keep it private.
            </p>
            <div className="mt-2">
              <CopyField value={`${origin}/api/watch/feed?k=${feedToken(key!)}`} />
            </div>
          </section>
          <ForgetButton />
        </>
      )}
      <p className="text-xs text-muted">Discovery items are machine-assembled from public research sources and are not reviewed. New items are research leads, not medical advice.</p>
    </div>
  );
}
