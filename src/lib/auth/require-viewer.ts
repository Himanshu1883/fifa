import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export type Viewer = {
  id: number;
  username: string;
  isAdmin: boolean;
  isApproved: boolean;
};

function parseUserId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function requireViewer(): Promise<Viewer> {
  const session = await getSession();
  if (!session) redirect("/login?msg=signin_required");

  const userId = parseUserId(session.sub);
  if (!userId) redirect("/login?msg=signin_required");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, isAdmin: true, isApproved: true },
  });

  if (!user) redirect("/login?msg=signin_required");
  return user;
}

export async function requireApprovedViewer(): Promise<Viewer> {
  const user = await requireViewer();
  if (!user.isApproved) redirect("/pending-approval");
  return user;
}

export async function requireAdminViewer(): Promise<Viewer> {
  const user = await requireApprovedViewer();
  if (!user.isAdmin) redirect("/");
  return user;
}

