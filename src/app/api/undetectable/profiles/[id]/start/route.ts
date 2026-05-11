import { NextResponse } from "next/server";

import { UndetectableApiError, undetectableStartProfile } from "@/lib/undetectable-client";
import { undetectableUnauthorized } from "@/lib/undetectable-route-auth";

export const runtime = "nodejs";

type Props = {
  params: Promise<{ id: string }>;
};

function normalizeStartPages(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) {
    const pages = value
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean);
    return pages.length ? pages.join(",") : undefined;
  }
  return undefined;
}

export async function POST(req: Request, props: Props) {
  const denied = undetectableUnauthorized(req);
  if (denied) return denied;

  const { id } = await props.params;
  const url = new URL(req.url);

  let rawBody: unknown = null;
  const hasBody =
    (req.headers.get("content-length") ?? "").trim() !== "0" &&
    req.headers.get("content-type")?.includes("application/json");
  if (hasBody) {
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
    }
  }

  const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? (rawBody as Record<string, unknown>) : {};

  const chromeFlagsFromBody =
    typeof body.chrome_flags === "string"
      ? body.chrome_flags
      : typeof body.chromeFlags === "string"
        ? body.chromeFlags
        : undefined;
  const startPagesFromBody =
    normalizeStartPages(body["start-pages"]) ??
    normalizeStartPages(body.start_pages) ??
    normalizeStartPages(body.startPages);

  const chromeFlags = (url.searchParams.get("chrome_flags") ?? chromeFlagsFromBody)?.trim() || undefined;
  const startPages = (url.searchParams.get("start-pages") ?? startPagesFromBody)?.trim() || undefined;

  try {
    const result = await undetectableStartProfile(id, {
      chrome_flags: chromeFlags,
      start_pages: startPages,
    });
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

