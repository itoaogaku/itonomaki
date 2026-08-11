// Separate password gate for the web editor (src/app/edit), distinct from
// the site-wide Basic Auth in proxy.ts — anyone with the viewing password
// can read the site, but writing requires this second, editor-only secret.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const COOKIE_NAME = "edit_auth";
export const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** EDIT_PASSWORD, trimmed of accidental leading/trailing whitespace — easy to
 *  pick up when pasting into Vercel's env var field or from a password
 *  manager, and would otherwise cause silent, confusing login failures. */
function envPassword(): string | undefined {
  const raw = process.env.EDIT_PASSWORD;
  return raw ? raw.trim() : undefined;
}

/** Token proving a request already supplied EDIT_PASSWORD, derived from it
 *  so no session state needs to be stored anywhere. */
function expectedToken(): string {
  const password = envPassword();
  if (!password) throw new Error("EDIT_PASSWORD is not configured");
  return createHmac("sha256", password).update("edit-authorized").digest("hex");
}

export function checkPassword(password: string): boolean {
  const expected = envPassword();
  return typeof expected === "string" && expected.length > 0 && timingSafeStringEqual(password.trim(), expected);
}

export function signToken(): string {
  return expectedToken();
}

export function verifyToken(token: string | undefined): boolean {
  return typeof token === "string" && token.length > 0 && timingSafeStringEqual(token, expectedToken());
}

export async function requireEditAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyToken(cookieStore.get(COOKIE_NAME)?.value);
}
