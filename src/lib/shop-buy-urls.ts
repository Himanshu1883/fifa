import performanceIds from "@/lib/shop-fifa-performance-ids.json";

/** Same base URL used by vivalafifa.realb.it for match-level Buy buttons. */
export const SHOP_FIFA_BUY_BASE =
  "https://fwc26-shop-usd.tickets.fifa.com/secure/selection/event/seat/performance";

export const SHOP_FIFA_BUY_SUFFIX =
  "/contact-advantages/10229997072863,10230003371090/table/1/lang/en";

const IDS: readonly string[] = performanceIds;

/** FIFA Last Minute Sales checkout for a match (1–104). */
export function buildMatchBuyUrl(matchNum: number): string | null {
  if (!Number.isInteger(matchNum) || matchNum < 1 || matchNum > IDS.length) return null;
  const performanceId = IDS[matchNum - 1];
  if (!performanceId) return null;
  return `${SHOP_FIFA_BUY_BASE}/${performanceId}${SHOP_FIFA_BUY_SUFFIX}`;
}
