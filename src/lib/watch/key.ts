import "server-only";
import { cookies } from "next/headers";
import { accountsEnabled, currentUser } from "@/lib/auth/session";
import { getMe } from "@/lib/auth/api";
import { validKey, WATCH_COOKIE } from "./index";

/**
 * Which watchlist this request uses: a signed-in account's own random key (synced across devices),
 * otherwise this browser's cookie key. `account` tells callers not to set a browser cookie.
 */
export async function watchKey(): Promise<{ key?: string; account: boolean }> {
  if (accountsEnabled() && (await currentUser())) {
    const k = (await getMe())?.watch_key;
    if (validKey(k)) return { key: k, account: true };
  }
  const c = (await cookies()).get(WATCH_COOKIE)?.value;
  return { key: validKey(c) ? c : undefined, account: false };
}
