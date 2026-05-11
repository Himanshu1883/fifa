import { createPrismaClient } from "../src/lib/prisma";

async function main() {
  const prisma = createPrismaClient();
  const [
    users,
    resalePrefRotationState,
    events,
    eventCategories,
    eventCategoryBlockPrices,
    eventCategoryBlockAvailability,
    eventBlockSeatNow,
    eventSeatListings,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.resalePrefRotationState.count(),
    prisma.event.count(),
    prisma.eventCategory.count(),
    prisma.eventCategoryBlockPrice.count(),
    prisma.eventCategoryBlockAvailability.count(),
    prisma.eventBlockSeatNow.count(),
    prisma.eventSeatListing.count(),
  ]);
  console.log(
    JSON.stringify({
      users,
      resalePrefRotationState,
      events,
      eventCategories,
      eventCategoryBlockPrices,
      eventCategoryBlockAvailability,
      eventBlockSeatNow,
      eventSeatListings,
    }),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
