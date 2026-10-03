import OpenAI from "openai";

let client: OpenAI | null | undefined;

/** Server-only. Returns null when OPENAI_API_KEY is not set so the app still runs on fixtures. */
export function getOpenAI(): OpenAI | null {
  if (client !== undefined) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  client = apiKey ? new OpenAI({ apiKey }) : null;
  return client;
}

export const openAIModel = () => process.env.OPENAI_MODEL || "gpt-5-mini";

export class OpenAINotConfiguredError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not set. Add it to .env.local to enable runtime AI features.");
  }
}

/** Guardrails shared by every OpenAI role. */
export const SAFETY_RULES = `
You are part of RarePath Atlas, a research-navigation tool for rare-disease patient organizations.
Hard rules:
- Never diagnose, never recommend treatment, never state or imply clinical equivalence between diseases.
- Never claim a therapy transfers because of a shared pathway or shared symptoms.
- Only use information present in the provided input. If it is not there, say it is unknown.
- Keep hedges from the source ("may", "suggests"). Do not upgrade certainty.
`.trim();
