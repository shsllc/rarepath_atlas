/**
 * Creates a reviewer access key and the REVIEWERS entry for it.
 *
 *   npx tsx scripts/reviewer-key.ts "Display Name" [id]
 *
 * Prints the access key ONCE (give it to the reviewer) and the line to append to REVIEWERS.
 * Only the SHA-256 hash goes into configuration; the key itself is never stored.
 */
import crypto from "node:crypto";

const name = process.argv[2];
if (!name) {
  console.error('Usage: npx tsx scripts/reviewer-key.ts "Display Name" [id]');
  process.exit(1);
}
const id = (process.argv[3] ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(/^-|-$/g, "");
const key = crypto.randomBytes(24).toString("base64url");
const hash = crypto.createHash("sha256").update(key).digest("hex");
console.log(`Reviewer id:  ${id}`);
console.log(`Access key:   ${key}   (give this to the reviewer; it is not stored anywhere)`);
console.log(`REVIEWERS entry (append with ';'):  ${id}:${name.replace(/[:;]/g, " ")}:${hash}`);
console.log(`SESSION_SECRET suggestion (if not set yet): ${crypto.randomBytes(32).toString("base64url")}`);
