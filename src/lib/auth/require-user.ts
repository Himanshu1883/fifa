import { getSession } from "@/lib/auth/session";

export async function requireUserId(): Promise<number> {
  const session = await getSession();
  if (!session) {
    throw new Error("Not signed in.");
  }
  const n = Number(session.sub);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid session user id.");
  }
  return n;
}

