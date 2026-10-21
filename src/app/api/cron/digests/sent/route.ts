import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { confirmSent } from "@/lib/watch/digest";

/** Nightly job: confirm which digests SES accepted, so only those advance. */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let ids: string[] = [];
  try {
    const b = (await req.json()) as { ids?: unknown };
    ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  return NextResponse.json({ confirmed: await confirmSent(ids) });
}
