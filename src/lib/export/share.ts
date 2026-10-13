/** Frozen, shareable snapshots of a Research Action Brief. The evidence may change; a snapshot does not. */
import crypto from "node:crypto";
import { getStore } from "@/lib/store";
import type { BriefDoc } from "./brief-doc";

export interface SharedBrief {
  id: string;
  created_at: string;
  query: string;
  brief: BriefDoc;
}

const key = (id: string) => `share/${id}`;
export const validShareId = (id: string) => /^[A-Za-z0-9_-]{16}$/.test(id);

export async function createShare(query: string, brief: BriefDoc, now = new Date()): Promise<SharedBrief> {
  const s: SharedBrief = { id: crypto.randomBytes(12).toString("base64url"), created_at: now.toISOString(), query, brief };
  await getStore().set(key(s.id), s);
  return s;
}

export async function getShare(id: string): Promise<SharedBrief | null> {
  return validShareId(id) ? getStore().get<SharedBrief>(key(id)) : null;
}
