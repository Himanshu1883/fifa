import { NextResponse } from "next/server";

import {
  UndetectableApiError,
  undetectableCreateProfile,
  type UndetectableCreateProfileRequest,
} from "@/lib/undetectable-client";

export const runtime = "nodejs";

function unauthorized(req: Request): NextResponse | null {
  const secret = process.env.UNDETECTABLE_API_SECRET?.trim();
  if (!secret) return null;

  const auth = req.headers.get("authorization");
  const bearer =
    auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const q = new URL(req.url).searchParams.get("secret")?.trim() ?? "";

  if (bearer === secret || q === secret) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  const denied = unauthorized(req);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400 },
    );
  }

  try {
    const result = await undetectableCreateProfile(raw as UndetectableCreateProfileRequest);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof UndetectableApiError) {
      return NextResponse.json(
        {
          error: e.message,
          apiError: e.apiError,
        },
        { status: 502 },
      );
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message.slice(0, 800) }, { status: 500 });
  }
}

