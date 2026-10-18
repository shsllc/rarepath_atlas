import { NextResponse } from "next/server";
import { accountsApi, ApiCallError } from "@/lib/auth/api";
import { sameOrigin } from "@/lib/review/http";

const id = (v: unknown, re: RegExp) => {
  const s = String(v ?? "");
  if (!re.test(s)) throw new ApiCallError("Invalid request.", 400);
  return s;
};
const ORG = /^[a-f0-9]{16}$/;
const SUB = /^[A-Za-z0-9-]{1,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{32}$/;

/** POST { action, ... }: organisation and membership actions, forwarded to the AWS accounts API as the signed-in user. */
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) throw new ApiCallError("Cross-site request refused.", 403);
    const text = await req.text();
    if (text.length > 2_048) throw new ApiCallError("Request too large.", 413);
    let b: Record<string, unknown>;
    try {
      b = JSON.parse(text);
    } catch {
      throw new ApiCallError("Invalid request.", 400);
    }
    let out: unknown;
    switch (b.action) {
      case "create-org":
        out = await accountsApi("POST", "/orgs", { name: String(b.name ?? "").slice(0, 80) });
        break;
      case "invite":
        out = await accountsApi("POST", `/orgs/${id(b.org, ORG)}/invites`, { email: String(b.email ?? "").slice(0, 254), role: String(b.role ?? "member") });
        break;
      case "set-role":
        out = await accountsApi("PATCH", `/orgs/${id(b.org, ORG)}/members/${id(b.sub, SUB)}`, { role: String(b.role ?? "") });
        break;
      case "remove":
        out = await accountsApi("DELETE", `/orgs/${id(b.org, ORG)}/members/${id(b.sub, SUB)}`);
        break;
      case "accept":
        out = await accountsApi("POST", `/invites/${id(b.token, TOKEN)}/accept`);
        break;
      default:
        throw new ApiCallError("Unknown action.", 400);
    }
    return NextResponse.json({ ok: true, ...(out as object) });
  } catch (e) {
    if (e instanceof ApiCallError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Something went wrong. Nothing was changed." }, { status: 500 });
  }
}
