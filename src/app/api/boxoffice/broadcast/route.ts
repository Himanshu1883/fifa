import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BroadcastInput = {
  action: "start" | "stop";
  payload?: Record<string, unknown>;
};

function boxofficePort(): number {
  const raw = (process.env.BOXOFFICE_WS_PORT ?? "3020").trim();
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 3020;
}

function boxofficeToken(): string | null {
  const t = (process.env.BOXOFFICE_WS_TOKEN ?? "").trim();
  return t ? t : null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function parseBroadcastInput(body: unknown): BroadcastInput | null {
  if (!isPlainObject(body)) return null;
  const action = body.action;
  if (action !== "start" && action !== "stop") return null;
  const payload = body.payload;
  if (payload !== undefined && !isPlainObject(payload)) return null;
  return payload !== undefined ? { action, payload } : { action };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const input = parseBroadcastInput(body);
  if (!input) {
    return NextResponse.json(
      { ok: false, error: 'Body must be {"action":"start"|"stop","payload"?:{...}}' },
      { status: 400 },
    );
  }

  const port = boxofficePort();
  const url = `http://127.0.0.1:${port}/broadcast`;
  const token = boxofficeToken();

  const headers = new Headers({
    "Content-Type": "application/json",
  });
  if (token) headers.set("Authorization", `Bearer ${token}`);

  try {
    const upstreamBody = JSON.stringify({
      type: "boxoffice",
      action: input.action,
      payload: input.payload,
    });

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: upstreamBody,
      cache: "no-store",
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Upstream returned non-JSON response", upstreamStatus: res.status },
        { status: 502 },
      );
    }

    return new NextResponse(JSON.stringify(data), {
      status: res.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "Could not reach local boxoffice server", detail: message.slice(0, 800) },
      { status: 502 },
    );
  }
}

