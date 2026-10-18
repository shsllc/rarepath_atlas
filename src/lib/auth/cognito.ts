/**
 * Amazon Cognito user-pool calls for a public app client (no client secret), made with plain fetch
 * against the documented JSON API, so the same code runs in route handlers and in middleware.
 *
 * Passwords pass from the browser to our server to Cognito over TLS and are never stored or logged.
 */
export interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
}

export function cognitoConfig(): CognitoConfig | null {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;
  if (!userPoolId || !clientId) return null;
  return { region: process.env.COGNITO_REGION || userPoolId.split("_")[0] || "us-west-2", userPoolId, clientId };
}

export interface Tokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
let fetchImpl: Fetch = (u, i) => fetch(u, i);
/** Test seam. */
export function setCognitoFetch(f: Fetch | null) {
  fetchImpl = f ?? ((u, i) => fetch(u, i));
}

/** Cognito error types → messages a person can act on. Never reveals whether an account exists on sign-in. */
const MESSAGES: Record<string, [string, number]> = {
  NotAuthorizedException: ["That email and password do not match. Check them, or reset your password.", 401],
  UserNotFoundException: ["That email and password do not match. Check them, or reset your password.", 401],
  UserNotConfirmedException: ["Confirm your email first. We can send a new code.", 403],
  UsernameExistsException: ["An account with this email may already exist. Try signing in or resetting your password.", 409],
  InvalidPasswordException: ["Choose a password of at least 12 characters.", 400],
  CodeMismatchException: ["That code is not right. Check the latest email and try again.", 400],
  ExpiredCodeException: ["That code has expired. Ask for a new one.", 400],
  LimitExceededException: ["Too many attempts. Wait a few minutes and try again.", 429],
  TooManyRequestsException: ["Too many attempts. Wait a few minutes and try again.", 429],
  TooManyFailedAttemptsException: ["Too many attempts. Wait a few minutes and try again.", 429],
  InvalidParameterException: ["Check the details and try again.", 400],
  CodeDeliveryFailureException: ["We could not send the email. Try again shortly.", 502],
};

async function call<T>(cfg: CognitoConfig, op: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(`https://cognito-idp.${cfg.region}.amazonaws.com/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": `AWSCognitoIdentityProviderService.${op}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new AuthError("Sign-in is unavailable right now. Try again shortly.", "network", 503);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const type = String(json.__type ?? "").split("#").pop() ?? "";
    const [message, status] = MESSAGES[type] ?? ["Something went wrong. Try again shortly.", 502];
    throw new AuthError(message, type || "unknown", status);
  }
  return json as T;
}

const tokensFrom = (r: { AuthenticationResult?: { IdToken: string; AccessToken: string; RefreshToken?: string; ExpiresIn: number } }): Tokens => {
  const a = r.AuthenticationResult;
  if (!a) throw new AuthError("Additional sign-in steps are not supported yet.", "challenge", 400);
  return { idToken: a.IdToken, accessToken: a.AccessToken, refreshToken: a.RefreshToken, expiresIn: a.ExpiresIn };
};

export const normEmail = (e: string) => e.trim().toLowerCase();

export async function signUp(cfg: CognitoConfig, email: string, password: string, name: string) {
  await call(cfg, "SignUp", {
    ClientId: cfg.clientId,
    Username: normEmail(email),
    Password: password,
    UserAttributes: [{ Name: "email", Value: normEmail(email) }, ...(name.trim() ? [{ Name: "name", Value: name.trim().slice(0, 80) }] : [])],
  });
}

export async function confirmSignUp(cfg: CognitoConfig, email: string, code: string) {
  await call(cfg, "ConfirmSignUp", { ClientId: cfg.clientId, Username: normEmail(email), ConfirmationCode: code.trim() });
}

export async function resendCode(cfg: CognitoConfig, email: string) {
  await call(cfg, "ResendConfirmationCode", { ClientId: cfg.clientId, Username: normEmail(email) });
}

export async function signIn(cfg: CognitoConfig, email: string, password: string): Promise<Tokens> {
  return tokensFrom(await call(cfg, "InitiateAuth", { ClientId: cfg.clientId, AuthFlow: "USER_PASSWORD_AUTH", AuthParameters: { USERNAME: normEmail(email), PASSWORD: password } }));
}

export async function refresh(cfg: CognitoConfig, refreshToken: string): Promise<Tokens> {
  return tokensFrom(await call(cfg, "InitiateAuth", { ClientId: cfg.clientId, AuthFlow: "REFRESH_TOKEN_AUTH", AuthParameters: { REFRESH_TOKEN: refreshToken } }));
}

export async function forgotPassword(cfg: CognitoConfig, email: string) {
  await call(cfg, "ForgotPassword", { ClientId: cfg.clientId, Username: normEmail(email) });
}

export async function confirmForgotPassword(cfg: CognitoConfig, email: string, code: string, password: string) {
  await call(cfg, "ConfirmForgotPassword", { ClientId: cfg.clientId, Username: normEmail(email), ConfirmationCode: code.trim(), Password: password });
}

/** Permanently deletes the signed-in user from the user pool. */
export async function deleteUser(cfg: CognitoConfig, accessToken: string) {
  await call(cfg, "DeleteUser", { AccessToken: accessToken });
}

/** Signs the user out everywhere: their refresh tokens stop working. */
export async function globalSignOut(cfg: CognitoConfig, accessToken: string) {
  await call(cfg, "GlobalSignOut", { AccessToken: accessToken });
}
