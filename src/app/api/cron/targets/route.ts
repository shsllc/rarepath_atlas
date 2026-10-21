import { NextResponse } from "next/server";
import { cronAuthorized, refreshTargets } from "@/lib/cron";
import { getServices } from "@/lib/services/registry";

/** Nightly job: which diseases to refresh. */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ diseases: await refreshTargets(getServices().graph.bundle()) });
}
