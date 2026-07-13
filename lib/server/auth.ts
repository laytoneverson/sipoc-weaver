import { createHmac, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { SessionUser } from "@/lib/orgTypes";
import { getUserById } from "@/lib/server/userRepo";

const scryptAsync = promisify(scrypt);

export const SESSION_COOKIE = "sipoc_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function authSecret(): string {
  return (
    process.env.SIPOC_AUTH_SECRET ??
    "dev-only-change-me-in-production-sipoc-weaver"
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algo, salt, hash] = stored.split(":");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

type SessionPayload = {
  userId: string;
  exp: number;
};

function sign(payload: string): string {
  return createHmac("sha256", authSecret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string): string {
  const payload: SessionPayload = {
    userId,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function parseSessionToken(token: string): SessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  if (signature.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (!payload.userId || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(): {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}

export function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=");
  }
  return null;
}

export async function getSessionUser(
  cookieHeader: string | null,
): Promise<SessionUser | null> {
  const token = readSessionCookie(cookieHeader);
  if (!token) return null;
  const payload = parseSessionToken(token);
  if (!payload) return null;
  const user = await getUserById(payload.userId);
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name };
}

export function formatSetCookie(token: string): string {
  const opts = sessionCookieOptions();
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
    "HttpOnly",
    `SameSite=${opts.sameSite}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export function formatClearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=lax`;
}
