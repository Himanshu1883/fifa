export type ClientInfo = {
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
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

  // Vercel geolocation headers (best-effort).
  const vercelCountry = h.get("x-vercel-ip-country")?.trim() || null;
  const vercelRegion = h.get("x-vercel-ip-country-region")?.trim() || null;
  const vercelCity = h.get("x-vercel-ip-city")?.trim() || null;

  // Cloudflare country header (ISO code) if present.
  const cfCountry = h.get("cf-ipcountry")?.trim() || null;

  const country = vercelCountry || cfCountry || null;
  const region = vercelRegion || null;
  const city = vercelCity || null;

  return { ip: ip || null, country, region, city, userAgent };
}

