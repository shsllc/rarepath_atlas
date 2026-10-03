import fs from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import OpenAI from "openai";

let client: OpenAI | null | undefined;
let keySource: KeySource = "none";

export type KeySource = ".env.local" | "process.env" | "none";

/**
 * Resolve OpenAI settings with .env.local taking precedence over machine-level
 * environment variables. (Next.js normally lets an existing process env var win.)
 * Server-only: never import this from a client component.
 */
function readLocalEnv(): Record<string, string> {
  try {
    return parse(fs.readFileSync(path.join(process.cwd(), ".env.local")));
  } catch {
    return {};
  }
}

export function resolveOpenAIConfig(): { apiKey: string | null; model: string; keySource: KeySource } {
  const local = readLocalEnv();
  const localKey = local.OPENAI_API_KEY?.trim();
  const envKey = process.env.OPENAI_API_KEY?.trim();
  const apiKey = localKey || envKey || null;
  const source: KeySource = localKey ? ".env.local" : envKey ? "process.env" : "none";
  const model = local.OPENAI_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
  return { apiKey, model, keySource: source };
}

/** Returns null when no key is configured so the app still runs without AI. */
export function getOpenAI(): OpenAI | null {
  if (client !== undefined) return client;
  const { apiKey, keySource: src } = resolveOpenAIConfig();
  keySource = src;
  // Server-side timeout so a slow provider never hangs a request. Ingestion scripts raise it via OPENAI_TIMEOUT_MS.
  const timeout = Number(process.env.OPENAI_TIMEOUT_MS) || 25_000;
  client = apiKey ? new OpenAI({ apiKey, timeout, maxRetries: 1 }) : null;
  return client;
}

export const openAIModel = () => resolveOpenAIConfig().model;
export const openAIKeySource = (): KeySource => (getOpenAI(), keySource);

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
