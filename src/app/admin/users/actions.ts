"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminViewer } from "@/lib/auth/require-viewer";

const USERNAME_MAX = 64;
const PASSWORD_MAX = 256;

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

function parseUserId(raw: unknown): number | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function truthyCheckbox(raw: unknown): boolean {
  return raw === "on" || raw === "1" || raw === "true";
}

export async function createUserAction(formData: FormData) {
  await requireAdminViewer();

  const username = validateUsername(formData.get("username"));
  const password = validatePassword(formData.get("password"));
  const isAdmin = truthyCheckbox(formData.get("isAdmin"));
  const isApproved = truthyCheckbox(formData.get("isApproved"));

  if (!username || !password) {
    redirect("/admin/users?error=invalid_input");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await prisma.user.create({
      data: {
        username,
        passwordHash,
        isAdmin,
        isApproved,
        approvedAt: isApproved ? new Date() : null,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint") || msg.includes("unique")) {
      redirect("/admin/users?error=username_taken");
    }
    redirect("/admin/users?error=create_failed");
  }

  redirect("/admin/users?created=1");
}

export async function setUserApprovedAction(formData: FormData) {
  const viewer = await requireAdminViewer();
  const userId = parseUserId(formData.get("userId"));
  const approved = truthyCheckbox(formData.get("approved"));

  if (!userId) redirect("/admin/users?error=invalid_user");
  if (viewer.id === userId) redirect("/admin/users?error=cannot_change_self");

  await prisma.user.update({
    where: { id: userId },
    data: {
      isApproved: approved,
      approvedAt: approved ? new Date() : null,
    },
  });

  redirect("/admin/users");
}

export async function setUserAdminAction(formData: FormData) {
  const viewer = await requireAdminViewer();
  const userId = parseUserId(formData.get("userId"));
  const admin = truthyCheckbox(formData.get("admin"));

  if (!userId) redirect("/admin/users?error=invalid_user");
  if (viewer.id === userId) redirect("/admin/users?error=cannot_change_self");

  await prisma.user.update({
    where: { id: userId },
    data: { isAdmin: admin },
  });

  redirect("/admin/users");
}

