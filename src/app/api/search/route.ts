import { NextResponse } from "next/server";
import { getServices } from "@/lib/services/registry";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ error: "Missing ?q=" }, { status: 400 });
  return NextResponse.json(await getServices().search.search(q));
}
