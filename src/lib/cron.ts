/**
 * The nightly job (AWS EventBridge → Lambda, see infra/) calls these endpoints with a shared secret.
 * Without CRON_SECRET configured, every cron endpoint refuses.
 */
import crypto from "node:crypto";
import { getStore } from "@/lib/store";
import type { GraphBundle } from "@/lib/schemas";

export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-secret") ?? "";
  if (secret.length < 32 || given.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

/** Well-known rare diseases refreshed every night, so their journeys and alerts stay current. */
export const SEED_DISEASES = [
  "Dravet syndrome", "Lennox-Gastaut syndrome", "Angelman syndrome", "Prader-Willi syndrome", "Rett syndrome", "FOXG1 syndrome",
  "MECP2 duplication syndrome", "SYNGAP1-related intellectual disability", "STXBP1 encephalopathy", "KCNQ2 encephalopathy", "SCN2A-related disorder",
  "PCDH19 clustering epilepsy", "tuberous sclerosis complex", "neurofibromatosis type 1", "Phelan-McDermid syndrome", "fragile X syndrome",
  "Duchenne muscular dystrophy", "spinal muscular atrophy", "Friedreich ataxia", "ataxia-telangiectasia", "amyotrophic lateral sclerosis",
  "Huntington disease", "CLN2 disease", "Niemann-Pick disease type C", "Gaucher disease", "Fabry disease", "Pompe disease", "phenylketonuria",
  "Krabbe disease", "metachromatic leukodystrophy", "X-linked adrenoleukodystrophy", "Alexander disease", "cystic fibrosis", "sickle cell disease",
  "hemophilia A", "Marfan syndrome", "Williams syndrome", "22q11.2 deletion syndrome", "Smith-Magenis syndrome", "Rubinstein-Taybi syndrome",
  "Kabuki syndrome", "CHARGE syndrome", "Wolfram syndrome", "Batten disease", "Sanfilippo syndrome",
];

/** Seed diseases, the bundle's other diseases, diseases already promoted, and everything anyone watches. */
export async function refreshTargets(bundle: GraphBundle, max = 150): Promise<string[]> {
  const st = getStore();
  const names = new Set<string>(SEED_DISEASES);
  for (const n of bundle.nodes) if (n.type === "Disease" && n.id !== bundle.focus_disease_id && n.verification === "verified") names.add(n.label);
  for (const k of await st.list("curated/disease/")) {
    const r = await st.get<{ disease_label?: string }>(k);
    if (r?.disease_label) names.add(r.disease_label);
  }
  for (const k of await st.list("watch/")) {
    const w = await st.get<{ query?: string }>(k);
    if (w?.query) names.add(w.query);
  }
  return [...names].slice(0, max);
}
