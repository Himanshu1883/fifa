"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_SECRET_SETUP_ROUTE } from "@/lib/auth-secret-docs";
import { setSessionCookie, signSessionToken } from "@/lib/auth/session";
import { clientInfoFromHeaders } from "@/lib/auth/client-info";
import { prisma } from "@/lib/prisma";

const USERNAME_MAX = 64;
const PASSWORD_MAX = 256;

function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;
  if (v.includes("://")) return null;
  if (v.includes("\n") || v.includes("\r")) return null;
  return v;
}

function validateUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const u = raw.trim();
  if (!u || u.length > USERNAME_MAX) return null;
  return u;
}

function validatePassword(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (!raw || raw.length > PASSWORD_MAX) return null;
  return raw;
}

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const username = validateUsername(formData.get("username"));
  const password = validatePassword(formData.get("password"));
  const nextPath = safeNextPath(formData.get("next"));

  if (!username || !password) {
    return { error: "Enter a valid username and password." };
  }

  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Invalid username or password." };
  }

  const h = await headers();
  const { ip, userAgent } = clientInfoFromHeaders(h);

  let token: string;
  try {
    token = await signSessionToken(user.id, user.username, {
      approved: user.isApproved,
      admin: user.isAdmin,
    });
  } catch {
    return {
      error: `Could not create a session. Set AUTH_SECRET (32+ random characters), redeploy or restart dev, then try again. Setup: ${AUTH_SECRET_SETUP_ROUTE}`,
    };
  }
  await setSessionCookie(token);

  await prisma.userLoginAudit.create({
    data: {
      userId: user.id,
      ip,
      userAgent,
      method: "PASSWORD",
    },
  });

  redirect(user.isApproved ? (nextPath ?? "/") : "/pending-approval");
}
