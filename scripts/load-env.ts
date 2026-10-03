/**
 * Import first in every script: loads .env.local with precedence over
 * machine-level environment variables (matching src/lib/services/openai/client.ts).
 * Never logs values.
 */
import path from "node:path";
import { config } from "dotenv";

config({ path: path.join(process.cwd(), ".env.local"), override: true, quiet: true });
