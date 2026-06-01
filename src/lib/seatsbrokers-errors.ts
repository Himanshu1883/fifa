const CLOUDFLARE_TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;
const CLOUDFLARE_CODE_RE = /\b(52[0-9]|53[0-9])\b/;

export function isHtmlErrorBody(raw: string): boolean {
  const t = raw.trimStart().slice(0, 200).toLowerCase();
  return t.startsWith("<!doctype html") || t.startsWith("<html");
}

/** Turn Cloudflare / HTML error pages into a short readable message. */
export function formatSeatsBrokersError(status: number, raw: string, fallback = "Request failed"): string {
  if (!raw.trim()) {
    if (status === 522) {
      return "SeatsBrokers unreachable (522 Connection timed out). The API did not respond — try again later or enter a match_id manually.";
    }
    if (status === 524) {
      return "SeatsBrokers unreachable (524 Timeout). Try again later or enter a match_id manually.";
    }
    return fallback;
  }

  if (isHtmlErrorBody(raw)) {
    const titleMatch = raw.match(CLOUDFLARE_TITLE_RE);
    const title = titleMatch?.[1]?.trim() ?? "";
    const codeMatch = title.match(CLOUDFLARE_CODE_RE) ?? raw.match(CLOUDFLARE_CODE_RE);
    const code = codeMatch?.[1] ?? (status >= 520 && status <= 599 ? String(status) : null);

    if (title.includes("522") || code === "522" || status === 522) {
      return "SeatsBrokers sandbox is unreachable (522 Connection timed out). Their server did not respond — you can still enter and save a custom match_id below.";
    }
    if (title.includes("524") || code === "524" || status === 524) {
      return "SeatsBrokers unreachable (524 Timeout). You can still enter and save a custom match_id below.";
    }
    if (title.includes("521") || code === "521" || status === 521) {
      return "SeatsBrokers server is down (521). You can still enter and save a custom match_id below.";
    }

    if (title) {
      const short = title.replace(/^seatsbrokers\.com\s*\|\s*/i, "").trim();
      return `SeatsBrokers error: ${short}. You can still enter and save a custom match_id below.`;
    }

    return "SeatsBrokers returned an HTML error page instead of JSON. The API may be down — enter a custom match_id below.";
  }

  if (raw.length > 400) return `${raw.slice(0, 400)}…`;
  return raw || fallback;
}

export function formatSeatsBrokersFetchError(e: unknown): string {
  if (
    e instanceof Error &&
    (e.name === "AbortError" || e.name === "TimeoutError" || e.message.includes("aborted"))
  ) {
    return "SeatsBrokers request timed out. The sandbox may be slow or down — enter a match_id manually below.";
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i.test(msg)) {
    return "Could not reach SeatsBrokers (network error). Enter a match_id manually below.";
  }
  return msg.slice(0, 500);
}
