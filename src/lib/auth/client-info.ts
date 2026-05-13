export type ClientInfo = {
  ip: string | null;
  userAgent: string | null;
};

function firstForwardedForIp(raw: string): string | null {
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts[0] ?? null;
}

export function clientInfoFromHeaders(h: Headers): ClientInfo {
  const xff = h.get("x-forwarded-for");
  const xReal = h.get("x-real-ip");
  const cf = h.get("cf-connecting-ip");
  const fly = h.get("fly-client-ip");

  const ip =
    (xff ? firstForwardedForIp(xff) : null) ??
    (cf ? cf.trim() : null) ??
    (fly ? fly.trim() : null) ??
    (xReal ? xReal.trim() : null) ??
    null;

  const userAgent = h.get("user-agent")?.trim() || null;
  return { ip: ip || null, userAgent };
}

