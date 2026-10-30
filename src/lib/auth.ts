import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "crypto";
import { query, one, newId, type User, type Loop, type Membership } from "./db";

const SESSION_COOKIE = "cl_session";
const SESSION_DAYS = 120;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function appUrl(): string {
  const url =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    "http://localhost:3000";
  return url.replace(/\/$/, "");
}

/** Only allow same-site relative redirects. */
export function safeRedirect(path: string | null | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/";
  return path;
}

/** Create a one-time sign-in link for an email address. */
export async function createLoginLink(email: string, redirectTo: string, validHours = 1): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await query(
    `insert into login_tokens (token_hash, email, redirect_to, expires_at)
     values ($1, $2, $3, now() + make_interval(hours => $4))`,
    [hashToken(token), normalizeEmail(email), safeRedirect(redirectTo), validHours],
  );
  return `${appUrl()}/auth/verify?token=${token}`;
}

export async function recentLoginTokenCount(email: string): Promise<number> {
  const row = await one<{ n: string }>(
    `select count(*) as n from login_tokens where email = $1 and created_at > now() - interval '1 hour'
       and expires_at <= created_at + interval '1 hour'`,
    [normalizeEmail(email)],
  );
  return Number(row?.n ?? 0);
}

export async function peekLoginToken(token: string) {
  return one<{ email: string; redirect_to: string | null }>(
    `select email, redirect_to from login_tokens
     where token_hash = $1 and used_at is null and expires_at > now()`,
    [hashToken(token)],
  );
}

/** Mark a token used and return the user it belongs to (creating the user if needed). */
export async function consumeLoginToken(token: string): Promise<{ user: User; redirectTo: string } | null> {
  const row = await one<{ email: string; redirect_to: string | null }>(
    `update login_tokens set used_at = now()
     where token_hash = $1 and used_at is null and expires_at > now()
     returning email, redirect_to`,
    [hashToken(token)],
  );
  if (!row) return null;
  const user = await findOrCreateUser(row.email);
  return { user, redirectTo: safeRedirect(row.redirect_to) };
}

export async function findOrCreateUser(email: string, name?: string | null): Promise<User> {
  const normalized = normalizeEmail(email);
  const existing = await one<User>(`select * from users where email = $1`, [normalized]);
  if (existing) return existing;
  const created = await one<User>(
    `insert into users (id, email, name) values ($1, $2, $3)
     on conflict (email) do update set email = excluded.email
     returning *`,
    [newId(), normalized, name?.trim() || null],
  );
  return created!;
}

export async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await query(
    `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`,
    [hashToken(token), userId, SESSION_DAYS],
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query(`delete from sessions where token_hash = $1`, [hashToken(token)]);
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return one<User>(
    `select u.* from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
}

/** Require a signed-in user with a display name; otherwise redirect to login/onboarding. */
export async function requireUser(returnTo = "/"): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  if (!user.name) redirect(`/welcome?next=${encodeURIComponent(returnTo)}`);
  return user;
}

/** Require that the signed-in user belongs to the loop. Marks pending invites as joined. */
export async function requireMember(loopId: string, returnTo?: string) {
  const user = await requireUser(returnTo ?? `/loops/${loopId}`);
  const membership = await one<Membership>(`select * from memberships where loop_id = $1 and user_id = $2`, [
    loopId,
    user.id,
  ]);
  const loop = membership ? await one<Loop>(`select * from loops where id = $1`, [loopId]) : null;
  if (!membership || !loop) redirect("/?error=not-a-member");
  if (!membership.joined_at) {
    await query(`update memberships set joined_at = now() where loop_id = $1 and user_id = $2`, [loopId, user.id]);
  }
  return { user, loop, membership, isAdmin: membership.role === "admin" };
}
