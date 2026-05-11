import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function boxofficePort(): number {
  const raw = (process.env.BOXOFFICE_WS_PORT ?? "3020").trim();
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 3020;
}

export async function GET() {
  const port = boxofficePort();
  const url = `http://127.0.0.1:${port}/status`;

  try {
    const res = await fetch(url, { cache: "no-store" });
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

