/**
 * Nightly job (EventBridge schedule → this Lambda):
 *   1. ask the site which diseases to refresh, refresh each one (discovery + source-curation rules),
 *   2. ask the site for the weekly digests that are due, send them through Amazon SES, confirm.
 * The site endpoints check a shared secret (Secrets Manager here, CRON_SECRET on the site).
 */
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

const SITE = (process.env.SITE_URL ?? "").replace(/\/$/, "");
const FROM = process.env.FROM_ADDRESS ?? "";
const sm = new SecretsManagerClient({});
const ses = new SESv2Client({});

interface Email {
  id: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  unsubscribe_url: string;
}

async function call<T>(secret: string, path: string, body: unknown, timeoutMs = 29_000): Promise<T> {
  const res = await fetch(`${SITE}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-cron-secret": secret }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export async function handler(event: { skipRefresh?: boolean; skipDigests?: boolean; only?: string[] } = {}) {
  const secret = (await sm.send(new GetSecretValueCommand({ SecretId: process.env.SECRET_ARN }))).SecretString ?? "";
  const summary = { refreshed: 0, changed: 0, failed: [] as string[], digests_prepared: 0, digests_sent: 0, digest_failures: 0 };

  if (!event.skipRefresh) {
    const { diseases } = event.only ? { diseases: event.only } : await call<{ diseases: string[] }>(secret, "/api/cron/targets", {});
    for (const d of diseases) {
      try {
        const r = await call<{ status: string; changed?: boolean }>(secret, "/api/cron/refresh", { disease: d });
        summary.refreshed++;
        if (r.changed) summary.changed++;
      } catch (e) {
        summary.failed.push(`${d}: ${(e as Error).message}`);
      }
      // Stay polite to the public research APIs behind each refresh (NIH RePORTER asks for 1 request/second).
      await new Promise((r) => setTimeout(r, 1_500));
    }
  }

  if (!event.skipDigests && FROM) {
    const { emails } = await call<{ emails: Email[] }>(secret, "/api/cron/digests", {});
    summary.digests_prepared = emails.length;
    const sent: string[] = [];
    for (const m of emails) {
      try {
        await ses.send(
          new SendEmailCommand({
            FromEmailAddress: FROM,
            Destination: { ToAddresses: [m.to] },
            Content: {
              Simple: {
                Subject: { Data: m.subject, Charset: "UTF-8" },
                Body: { Text: { Data: m.text, Charset: "UTF-8" }, Html: { Data: m.html, Charset: "UTF-8" } },
                Headers: [
                  { Name: "List-Unsubscribe", Value: `<${m.unsubscribe_url}>` },
                  { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
                ],
              },
            },
          }),
        );
        sent.push(m.id);
      } catch (e) {
        summary.digest_failures++;
        console.error(`[nightly] digest send failed: ${(e as Error).name}`);
      }
    }
    if (sent.length) summary.digests_sent = (await call<{ confirmed: number }>(secret, "/api/cron/digests/sent", { ids: sent })).confirmed;
  }

  console.log(`[nightly] ${JSON.stringify({ ...summary, failed: summary.failed.length })}`);
  if (summary.failed.length) console.log(`[nightly] failures: ${summary.failed.slice(0, 20).join(" | ")}`);
  return summary;
}
