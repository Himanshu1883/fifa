import { fetchVivaLatestMarketplace, normalizeVivaLatest } from "@/lib/shop-service";
import { loadShopEventMetaLookup, syncShopMarketplaceToDatabase } from "@/lib/shop-sync-service";
import { ensureAllShopMatches } from "@/lib/shop-match-grid";
import { prisma } from "@/lib/prisma";

async function main() {
  const api = await fetchVivaLatestMarketplace();
  const meta = await loadShopEventMetaLookup();
  const normalized = normalizeVivaLatest(api, meta);
  const payload = { ...normalized, events: ensureAllShopMatches(normalized.events, meta) };
  console.log("events", payload.events.length, "scannedAt", payload.scannedAt);
  await syncShopMarketplaceToDatabase(payload);
  const metaRow = await prisma.shopMarketplaceSyncMeta.findUnique({ where: { id: 1 } });
  console.log("sync meta scannedAt", metaRow?.scannedAt?.toISOString());
  const count = await prisma.shopMarketplaceEventRecord.count();
  console.log("event rows", count);
}

main()
  .catch((e) => {
    console.error("FAILED", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
