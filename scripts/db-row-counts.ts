import { createPrismaClient } from "../src/lib/prisma";

async function main() {
  const prisma = createPrismaClient();
  const [users, events, eventCategories] = await Promise.all([
    prisma.user.count(),
    prisma.event.count(),
    prisma.eventCategory.count(),
  ]);
  console.log(JSON.stringify({ users, events, eventCategories }));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
