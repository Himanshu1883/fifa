import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function requireUserId(): Promise<number> {
  const session = await getSession();
  if (!session) {
    throw new Error("Not signed in.");
  }
  const n = Number(session.sub);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid session user id.");
  }
  const user = await prisma.user.findUnique({
    where: { id: n },
    select: { id: true, isApproved: true },
  });
  if (!user) {
    throw new Error("User not found.");
  }
  if (!user.isApproved) {
    throw new Error("Account is pending approval.");
  }
  return user.id;
}

