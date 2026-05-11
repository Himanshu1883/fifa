import { NextResponse } from "next/server";

import {
  UndetectableApiError,
  undetectableCreateProfile,
  type UndetectableCreateProfileRequest,
} from "@/lib/undetectable-client";
import { undetectableUnauthorized } from "@/lib/undetectable-route-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = undetectableUnauthorized(req);
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

