import { NextResponse } from "next/server";

import { UndetectableApiError, undetectableListProfiles } from "@/lib/undetectable-client";
import { undetectableUnauthorized } from "@/lib/undetectable-route-auth";

export const runtime = "nodejs";

type Props = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, props: Props) {
  const denied = undetectableUnauthorized(req);
  if (denied) return denied;

  const { id } = await props.params;

  try {
    const result = await undetectableListProfiles();
    const profile = result.data?.[id];
    if (!profile) {
      return NextResponse.json({ error: "Profile not found", profileId: id }, { status: 404 });
    }
    return NextResponse.json({
      code: 0,
      status: "success",
      data: { profile_id: id, ...profile },
    });
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

