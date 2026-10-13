import { NextResponse } from "next/server";
import { fail, guard, readJson } from "@/lib/review/http";
import { revoke } from "@/lib/review/queue";

export async function POST(req: Request) {
  try {
    const reviewer = await guard(req);
    const b = await readJson(req);
    const item = await revoke(String(b.id ?? ""), reviewer, String(b.note ?? ""));
    return NextResponse.json({ ok: true, status: item.status });
  } catch (e) {
    return fail(e);
  }
}
