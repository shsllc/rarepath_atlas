/**
 * Credential presence + minimal connectivity checks. Prints presence and
 * pass/fail only, never values.
 *   npx tsx scripts/check-credentials.ts
 */
import "./load-env";
import { getOpenAI, openAIKeySource, openAIModel } from "../src/lib/services/openai/client";

const present = (k: string) => (process.env[k]?.trim() ? "present" : "MISSING");

async function main() {
  for (const k of ["OPENAI_API_KEY", "OPENAI_MODEL", "NCBI_API_KEY", "NCBI_EMAIL"]) console.log(`${k.padEnd(15)} ${present(k)}`);
  console.log(`OpenAI key source: ${openAIKeySource()}`);

  // 1. OpenAI minimal call
  try {
    const res = await getOpenAI()!.responses.create({ model: openAIModel(), input: "Reply with exactly: ok" });
    console.log(`OpenAI test:     ${res.output_text.trim() === "ok" ? "PASS" : "PASS (unexpected text)"} | requested model ${openAIModel()} | served model ${res.model}`);
  } catch (e: any) {
    console.log(`OpenAI test:     FAIL (${e?.status ?? ""} ${e?.code ?? e?.name ?? "error"})`);
  }

  // 2. NCBI minimal keyed call (URL contains the key, so it is never printed)
  try {
    const p = new URLSearchParams({ db: "pubmed", id: "32472944", retmode: "json", tool: "rarepath-atlas", email: process.env.NCBI_EMAIL ?? "", api_key: process.env.NCBI_API_KEY ?? "" });
    const res = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${p}`);
    const json: any = await res.json();
    const ok = res.ok && json?.result?.["32472944"]?.uid === "32472944";
    const limit = res.headers.get("x-ratelimit-limit");
    console.log(`NCBI test:       ${ok ? "PASS" : `FAIL (HTTP ${res.status}${json?.error ? `: ${json.error}` : ""})`} | rate limit header: ${limit ?? "absent"} req/s (${limit === "10" ? "keyed" : "unkeyed/unknown"})`);
  } catch (e: any) {
    console.log(`NCBI test:       FAIL (${e?.name ?? "error"})`);
  }
}

main();
