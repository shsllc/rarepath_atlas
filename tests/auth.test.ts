import { afterEach, describe, expect, it } from "vitest";
import { AuthError, refresh, setCognitoFetch, signIn, signUp, forgotPassword, type CognitoConfig } from "@/lib/auth/cognito";
import { needsRefresh, secondsLeft } from "@/lib/auth/tokens";
import { reviewerFromAccount } from "@/lib/review/roles";

const cfg: CognitoConfig = { region: "us-west-2", userPoolId: "us-west-2_TEST", clientId: "client123" };
const jwt = (exp: number) => `x.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.y`;

afterEach(() => setCognitoFetch(null));

function fake(respond: (target: string, body: Record<string, unknown>) => [number, unknown]) {
  const calls: { url: string; target: string; body: Record<string, unknown> }[] = [];
  setCognitoFetch(async (url, init) => {
    const target = String((init.headers as Record<string, string>)["X-Amz-Target"]).split(".")[1];
    const body = JSON.parse(String(init.body));
    calls.push({ url, target, body });
    const [status, json] = respond(target, body);
    return new Response(JSON.stringify(json), { status });
  });
  return calls;
}

describe("Cognito client", () => {
  it("signs in with the password flow against the pool's regional endpoint and returns tokens", async () => {
    const calls = fake(() => [200, { AuthenticationResult: { IdToken: "id", AccessToken: "acc", RefreshToken: "ref", ExpiresIn: 3600 } }]);
    const t = await signIn(cfg, "  Ada@Example.ORG ", "a long passphrase");
    expect(t).toEqual({ idToken: "id", accessToken: "acc", refreshToken: "ref", expiresIn: 3600 });
    expect(calls[0].url).toBe("https://cognito-idp.us-west-2.amazonaws.com/");
    expect(calls[0].target).toBe("InitiateAuth");
    expect(calls[0].body).toMatchObject({ ClientId: "client123", AuthFlow: "USER_PASSWORD_AUTH", AuthParameters: { USERNAME: "ada@example.org" } });
  });

  it("maps Cognito errors to plain messages without revealing whether an account exists", async () => {
    fake(() => [400, { __type: "UserNotFoundException", message: "User does not exist." }]);
    const a = await signIn(cfg, "x@y.org", "pw").catch((e) => e);
    fake(() => [400, { __type: "NotAuthorizedException", message: "Incorrect username or password." }]);
    const b = await signIn(cfg, "x@y.org", "pw").catch((e) => e);
    expect(a).toBeInstanceOf(AuthError);
    expect(a.message).toBe(b.message);
    expect(a.status).toBe(401);
    expect(a.message).not.toMatch(/exist/i);
  });

  it("sign-up sends the email as username and attribute, plus the name when given", async () => {
    const calls = fake(() => [200, { UserConfirmed: false }]);
    await signUp(cfg, "Bob@Example.org", "a long passphrase", "Bob");
    expect(calls[0].target).toBe("SignUp");
    expect(calls[0].body).toMatchObject({ Username: "bob@example.org", UserAttributes: [{ Name: "email", Value: "bob@example.org" }, { Name: "name", Value: "Bob" }] });
  });

  it("refresh uses the refresh-token flow; challenges are refused clearly", async () => {
    const calls = fake(() => [200, { AuthenticationResult: { IdToken: "id2", AccessToken: "acc2", ExpiresIn: 3600 } }]);
    expect((await refresh(cfg, "ref")).idToken).toBe("id2");
    expect(calls[0].body).toMatchObject({ AuthFlow: "REFRESH_TOKEN_AUTH", AuthParameters: { REFRESH_TOKEN: "ref" } });
    fake(() => [200, { ChallengeName: "NEW_PASSWORD_REQUIRED" }]);
    await expect(signIn(cfg, "a@b.org", "pw")).rejects.toThrow(/not supported/);
  });

  it("network failures become a calm 503", async () => {
    setCognitoFetch(async () => {
      throw new TypeError("fetch failed");
    });
    const e = await forgotPassword(cfg, "a@b.org").catch((x) => x);
    expect(e).toMatchObject({ status: 503, code: "network" });
  });
});

describe("session refresh timing", () => {
  const now = 1_800_000_000_000;
  it("reads expiry from the token payload", () => {
    expect(secondsLeft(jwt(now / 1000 + 600), now)).toBe(600);
    expect(secondsLeft("garbage", now)).toBe(-1);
    expect(secondsLeft(undefined, now)).toBe(-1);
  });
  it("refreshes only near expiry and only with a refresh token", () => {
    expect(needsRefresh(jwt(now / 1000 + 600), "rt", now)).toBe(false);
    expect(needsRefresh(jwt(now / 1000 + 60), "rt", now)).toBe(true);
    expect(needsRefresh(undefined, "rt", now)).toBe(true);
    expect(needsRefresh(undefined, undefined, now)).toBe(false);
  });
});

describe("who may review", () => {
  const user = { sub: "u1", name: "Ada", groups: [] as string[] };
  const org = (id: string, role: string) => ({ id, name: `Org ${id}`, role });
  it("curators may review without an organisation", () => {
    expect(reviewerFromAccount({ ...user, groups: ["curators"] }, { curator: false, orgs: [] })).toMatchObject({ id: "u1", curator: true });
  });
  it("organisation owners, admins and reviewers may review; members may not", () => {
    expect(reviewerFromAccount(user, { curator: false, orgs: [org("a", "member")] })).toBeNull();
    for (const role of ["owner", "admin", "reviewer"]) expect(reviewerFromAccount(user, { curator: false, orgs: [org("a", role)] })?.org).toEqual({ id: "a", name: "Org a" });
    expect(reviewerFromAccount(user, null)).toBeNull();
  });
  it("acting for a specific organisation requires a reviewing role there", () => {
    const me = { curator: false, orgs: [org("a", "reviewer"), org("b", "member")] };
    expect(reviewerFromAccount(user, me, "b")).toBeNull();
    expect(reviewerFromAccount(user, me, "a")?.org?.id).toBe("a");
  });
});
