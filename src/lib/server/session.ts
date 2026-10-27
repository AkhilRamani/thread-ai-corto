import "server-only";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { z } from "zod";
import { getAuthConfig } from "./config";

export const SESSION_TTL = 8 * 60 * 60;
export const OAUTH_TTL = 10 * 60;
export const githubUserSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/),
});
const authSchema = z.object({
  user: githubUserSchema,
  accessToken: z.string().min(1).max(1024),
  expiresAt: z.number().positive(),
  nonce: z.string().min(20).max(100),
});
export type Auth = z.infer<typeof authSchema>;
export type OAuthAttempt = {
  state: string;
  verifier: string;
  expiresAt: number;
};

export function sessionOptions(name: string, ttl: number) {
  const config = getAuthConfig();
  if (!config) throw new Error("GitHub sign-in is not configured.");
  const secure =
    process.env.NODE_ENV === "production" || config.appUrl.startsWith("https:");
  return {
    password: config.sessionPassword,
    cookieName: `${secure ? "__Host-" : ""}mysubscriptions-${name}`,
    ttl,
    cookieOptions: {
      httpOnly: true,
      secure,
      sameSite: "lax" as const,
      path: "/",
      maxAge: ttl,
    },
  };
}

export async function getSession() {
  return getIronSession<{ auth: Auth }>(
    await cookies(),
    sessionOptions("session", SESSION_TTL),
  );
}

export async function getOAuthSession() {
  return getIronSession<{ attempt: OAuthAttempt }>(
    await cookies(),
    sessionOptions("oauth", OAUTH_TTL),
  );
}

export function validAuth(value: unknown): Auth | null {
  const parsed = authSchema.safeParse(value);
  return parsed.success && parsed.data.expiresAt > Date.now()
    ? parsed.data
    : null;
}

export async function getSignedInUser() {
  if (!getAuthConfig()) return null;
  const session = await getSession();
  return validAuth(session.auth)?.user ?? null;
}
