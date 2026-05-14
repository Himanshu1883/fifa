export type WhatsAppNotifyResult = {
  attempted: boolean;
  ok: boolean;
  provider: "ultramsg";
  status?: number;
  error?: string;
};

function envTrim(key: string): string {
  return String(process.env[key] ?? "").trim();
}

function clampError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const t = msg.trim();
  if (!t) return "Unknown error";
  return t.length > 240 ? `${t.slice(0, 240)}…` : t;
}

export async function sendUltraMsgWhatsAppMessage(text: string): Promise<WhatsAppNotifyResult> {
  const provider = "ultramsg" as const;
  const instanceId = envTrim("ULTRAMSG_INSTANCE_ID");
  const token = envTrim("ULTRAMSG_TOKEN");
  // Default to the known destination; override via env in prod.
  const to = envTrim("ULTRAMSG_TO") || "+919870529711";

  if (!instanceId || !token) {
    return { attempted: false, ok: false, provider };
  }

  const url = `https://api.ultramsg.com/${encodeURIComponent(instanceId)}/messages/chat`;
  const body = new URLSearchParams();
  body.set("token", token);
  body.set("to", to);
  body.set("body", text);

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
      signal: ac.signal,
    });

    if (!res.ok) {
      return {
        attempted: true,
        ok: false,
        provider,
        status: res.status,
        error: `UltraMsg returned HTTP ${res.status}`,
      };
    }

    return { attempted: true, ok: true, provider, status: res.status };
  } catch (err) {
    return { attempted: true, ok: false, provider, error: clampError(err) };
  } finally {
    clearTimeout(timeout);
  }
}

