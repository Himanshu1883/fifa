import { NextResponse } from "next/server";

import { UndetectableApiError, undetectableStopProfile } from "@/lib/undetectable-client";
import { undetectableUnauthorized } from "@/lib/undetectable-route-auth";

export const runtime = "nodejs";

type Props = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, props: Props) {
  const denied = undetectableUnauthorized(req);
  if (denied) return denied;

  const { id } = await props.params;

  try {
    const result = await undetectableStopProfile(id);
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

