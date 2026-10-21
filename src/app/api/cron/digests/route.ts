import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { getServices } from "@/lib/services/registry";
import { prepareDigests } from "@/lib/watch/digest";

export const maxDuration = 30;

/** Nightly job: prepare the weekly digests that are due. The job sends them through SES and confirms. */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const origin = process.env.PUBLIC_SITE_URL || new URL(req.url).origin;
  const search = getServices().search;
  const emails = await prepareDigests((q) => search.search(q), origin);
  return NextResponse.json({ emails });
}
