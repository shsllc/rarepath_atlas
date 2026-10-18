import type { Reviewer } from "./auth";

/** Organisation roles that may review. Members can read their organisation's work but not decide. */
export const REVIEW_ROLES = ["owner", "admin", "reviewer"] as const;

/**
 * Who may review, from an account: a platform curator, or anyone holding a reviewing role in an
 * organisation. Decisions are attributed to the reviewer and, when they act for one, their organisation.
 */
export function reviewerFromAccount(
  user: { sub: string; name: string; groups: string[] },
  me: { curator: boolean; orgs: { id: string; name: string; role: string }[] } | null,
  orgId?: string,
): Reviewer | null {
  const curator = user.groups.includes("curators") || !!me?.curator;
  const eligible = (me?.orgs ?? []).filter((o) => (REVIEW_ROLES as readonly string[]).includes(o.role));
  const org = orgId ? eligible.find((o) => o.id === orgId) : eligible[0];
  if (orgId && !org && !curator) return null;
  if (!curator && !org) return null;
  return { id: user.sub, name: user.name, curator, ...(org ? { org: { id: org.id, name: org.name } } : {}) };
}
