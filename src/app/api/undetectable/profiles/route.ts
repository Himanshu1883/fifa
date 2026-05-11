import { NextResponse } from "next/server";

import { UndetectableApiError, undetectableListProfiles } from "@/lib/undetectable-client";
import { undetectableUnauthorized } from "@/lib/undetectable-route-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = undetectableUnauthorized(req);
  if (denied) return denied;

  try {
    const result = await undetectableListProfiles();
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

