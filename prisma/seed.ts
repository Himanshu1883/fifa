import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { createPrismaClient } from "../src/lib/prisma";
import { catalogueRowsFromPayload } from "../src/lib/price-range-catalogue";
import { resolveEventForCataloguePref } from "../src/lib/resolve-event-for-catalogue-pref";

const prisma = createPrismaClient();

type Row = {
  matchLabel: string;
  sortOrder: number;
  name: string;
  prefId: string;
  resalePrefId?: string | null;
};

const rows: Row[] = [
  {
    matchLabel: "Match1",
    sortOrder: 1,
    name: "Mexico vs South Africa",
    prefId: "10229226700908",
    resalePrefId: "10229225516056",
  },
  {
    matchLabel: "Match2",
    sortOrder: 2,
    name: "Korea Republic vs Czechia",
    prefId: "10229226700886",
  },
  { matchLabel: "Match3", sortOrder: 3, name: "Canada vs Bosnia and Herzegovina", prefId: "10229226700887" },
  {
    matchLabel: "Match4",
    sortOrder: 4,
    name: "USA vs Paraguay",
    prefId: "10229226700888",
    resalePrefId: "10229997366894",
  },
  { matchLabel: "Match5", sortOrder: 5, name: "Haiti vs Scotland", prefId: "10229226700889" },
  { matchLabel: "Match6", sortOrder: 6, name: "Australia vs Türkiye", prefId: "10229226700890" },
  { matchLabel: "Match7", sortOrder: 7, name: "Brazil vs Morocco", prefId: "10229226700891" },
  { matchLabel: "Match9", sortOrder: 9, name: "Côte d'Ivoire vs Ecuador", prefId: "10229226700893" },
  { matchLabel: "Match10", sortOrder: 10, name: "Germany vs Curaçao", prefId: "10229226700895" },
  { matchLabel: "Match11", sortOrder: 11, name: "Netherlands vs Japan", prefId: "10229226700896" },
  { matchLabel: "Match14", sortOrder: 14, name: "Spain vs Cabo Verde", prefId: "10229226700902" },
  { matchLabel: "Match16", sortOrder: 16, name: "Belgium vs Egypt", prefId: "10229226700903" },
  { matchLabel: "Match17", sortOrder: 17, name: "France vs Senegal", prefId: "10229226700904" },
  { matchLabel: "Match18", sortOrder: 18, name: "France vs Senegal", prefId: "10229226700905" },
  { matchLabel: "Match19", sortOrder: 19, name: "Argentina vs Algeria", prefId: "10229226700907" },
  { matchLabel: "Match22", sortOrder: 22, name: "England vs Croatia", prefId: "10229226700910" },
  { matchLabel: "Match23", sortOrder: 23, name: "Portugal vs Congo DR", prefId: "10229226700911" },
  { matchLabel: "Match24", sortOrder: 24, name: "Uzbekistan vs Colombia", prefId: "10229226700912" },
  { matchLabel: "Match25", sortOrder: 25, name: "Czechia vs South Africa", prefId: "10229226700913" },
  { matchLabel: "Match26", sortOrder: 26, name: "Switzerland vs Bosnia and Herzegovina", prefId: "10229226700914" },
  { matchLabel: "Match27", sortOrder: 27, name: "Canada vs Qatar", prefId: "10229226700915" },
  { matchLabel: "Match28", sortOrder: 28, name: "Mexico vs Korea Republic", prefId: "10229226700916" },
  { matchLabel: "Match29", sortOrder: 29, name: "Brazil vs Haiti", prefId: "10229226700917" },
  { matchLabel: "Match30", sortOrder: 30, name: "Scotland vs Morocco", prefId: "10229226700918" },
  { matchLabel: "Match31", sortOrder: 31, name: "Türkiye vs Paraguay", prefId: "10229226700919" },
  { matchLabel: "Match32", sortOrder: 32, name: "USA vs Australia", prefId: "10229226700920" },
  { matchLabel: "Match33", sortOrder: 33, name: "Germany vs Côte d'Ivoire", prefId: "10229226700921" },
  { matchLabel: "Match34", sortOrder: 34, name: "Ecuador vs Curaçao", prefId: "10229226700922" },
  { matchLabel: "Match35", sortOrder: 35, name: "Netherlands vs Sweden", prefId: "10229226700923" },
  { matchLabel: "Match37", sortOrder: 37, name: "Uruguay vs Cabo Verde", prefId: "10229226700925" },
  { matchLabel: "Match38", sortOrder: 38, name: "Spain vs Saudi Arabia", prefId: "10229226700926" },
  { matchLabel: "Match39", sortOrder: 39, name: "Belgium vs IR Iran", prefId: "10229226700927" },
  { matchLabel: "Match41", sortOrder: 41, name: "Norway vs Senegal", prefId: "10229226700929" },
  { matchLabel: "Match42", sortOrder: 42, name: "France vs Iraq", prefId: "10229226700930" },
  { matchLabel: "Match43", sortOrder: 43, name: "Argentina vs Austria", prefId: "10229226700931" },
  { matchLabel: "Match45", sortOrder: 45, name: "England vs Ghana", prefId: "10229226700933" },
  { matchLabel: "Match46", sortOrder: 46, name: "Panama vs Croatia", prefId: "10229226700934" },
  { matchLabel: "Match47", sortOrder: 47, name: "Portugal vs Uzbekistan", prefId: "10229226700935" },
  { matchLabel: "Match49", sortOrder: 49, name: "Scotland vs Brazil", prefId: "10229226700937" },
  { matchLabel: "Match51", sortOrder: 51, name: "Switzerland vs Canada", prefId: "10229226700941" },
  { matchLabel: "Match56", sortOrder: 56, name: "Ecuador vs Germany", prefId: "10229226700944" },
  { matchLabel: "Match57", sortOrder: 57, name: "Japan vs Sweden", prefId: "10229226700945" },
  { matchLabel: "Match59", sortOrder: 59, name: "Turkey vs United States", prefId: "10229226700947" },
  { matchLabel: "Match60", sortOrder: 60, name: "Paraguay vs Australia", prefId: "10229226700948" },
  { matchLabel: "Match61", sortOrder: 61, name: "Norway vs France", prefId: "10229226700949" },
  { matchLabel: "Match62", sortOrder: 62, name: "Senegal vs Iraq", prefId: "10229226700950" },
  { matchLabel: "Match67", sortOrder: 67, name: "Panama vs England", prefId: "10229226700955" },
  { matchLabel: "Match68", sortOrder: 68, name: "Croatia vs Ghana", prefId: "10229226700956" },
  { matchLabel: "Match70", sortOrder: 70, name: "Jordan vs Argentina", prefId: "10229226700960" },
  { matchLabel: "Match71", sortOrder: 71, name: "Colombia vs Portugal", prefId: "10229226700957" },
  { matchLabel: "Match73", sortOrder: 73, name: "2A vs 2B", prefId: "10229226725328" },
  { matchLabel: "Match74", sortOrder: 74, name: "1E vs 3 A/B/C/D/F", prefId: "10229226725329" },
  { matchLabel: "Match76", sortOrder: 76, name: "1c vs 2f", prefId: "10229226725331" },
  { matchLabel: "Match77", sortOrder: 77, name: "1I vs 3CDFGH", prefId: "10229226725332" },
  { matchLabel: "Match78", sortOrder: 78, name: "2E vs 2I", prefId: "10229226725333" },
  { matchLabel: "Match80", sortOrder: 80, name: "1L vs 3EHIJK", prefId: "10229226725335" },
  { matchLabel: "Match81", sortOrder: 81, name: "1D vs 3BEFIJ", prefId: "10229226725336" },
  { matchLabel: "Match82", sortOrder: 82, name: "1G vs 3AEHIJ", prefId: "10229226725337" },
  { matchLabel: "Match83", sortOrder: 83, name: "2K vs 2L", prefId: "10229226725338" },
  { matchLabel: "Match84", sortOrder: 84, name: "1H vs 2J", prefId: "10229226725339" },
  { matchLabel: "Match85", sortOrder: 85, name: "1B vs 3EFGIJ", prefId: "10229226725340" },
  { matchLabel: "Match86", sortOrder: 86, name: "1J vs 2H", prefId: "10229226725339" },
  { matchLabel: "Match87", sortOrder: 87, name: "1K vs 3DEIJL", prefId: "10229226725342" },
  { matchLabel: "Match88", sortOrder: 88, name: "2D vs 2G", prefId: "10229226725343" },
  { matchLabel: "Match89", sortOrder: 89, name: "WINNER 74 VS WINNER 77", prefId: "10229226725345" },
  { matchLabel: "Match90", sortOrder: 90, name: "WINNER 73 VS WINNER 75", prefId: "10229226725346" },
  { matchLabel: "Match91", sortOrder: 91, name: "WINNER 76 VS WINNER 78", prefId: "10229226725347" },
  { matchLabel: "Match93", sortOrder: 93, name: "WINNER 79 VS WINNER 80", prefId: "10229226725349" },
  { matchLabel: "Match94", sortOrder: 94, name: "WINNER 83 VS WINNER 84", prefId: "10229226725350" },
  { matchLabel: "Match95", sortOrder: 95, name: "WINNER 81 VS WINNER 86", prefId: "10229226725351" },
  { matchLabel: "Match96", sortOrder: 96, name: "WINNER 85 VS WINNER 87", prefId: "10229226725352" },
  { matchLabel: "Match97", sortOrder: 97, name: "WINNER 89 VS WINNER 90", prefId: "10229226725353" },
  { matchLabel: "Match98", sortOrder: 98, name: "WINNER 93 VS WINNER 94", prefId: "10229226725354" },
  { matchLabel: "Match99", sortOrder: 99, name: "WINNER 91 VS WINNER 92", prefId: "10229226725355" },
  { matchLabel: "Match100", sortOrder: 100, name: "WINNER 95 VS WINNER 96", prefId: "10229226725356" },
  { matchLabel: "Match101", sortOrder: 101, name: "WINNER 97 VS WINNER 98", prefId: "10229226725357" },
  { matchLabel: "Match102", sortOrder: 102, name: "WINNER 99 VS WINNER 100", prefId: "10229226725358" },
  { matchLabel: "Match103", sortOrder: 103, name: "Bronze 101 vs Bronze 102", prefId: "10229226725361" },
  { matchLabel: "Match104", sortOrder: 104, name: "Winner 101 vs Winner 102", prefId: "10229226725360" },
];

type CategoryRow = {
  categoryId: string;
  categoryName: string;
  categoryBlockName: string;
  categoryBlockId: string;
};

function expandCategoryBlocks(
  cat: { categoryId: string; categoryName: string },
  blocks: [categoryBlockId: string, categoryBlockName: string][],
): CategoryRow[] {
  return blocks.map(([categoryBlockId, categoryBlockName]) => ({
    ...cat,
    categoryBlockId,
    categoryBlockName,
  }));
}

/** Category rows keyed by catalogue pref ID (tie to whatever event owns that pref in `rows`).
 * Regenerate from exports with `priceRangeCategories` (seat map JSON):
 * `npm run catalogue:extract -- path/to/export.json --pref-id 10229226700886`
 */
const categoryBundlesByPrefId: Record<string, CategoryRow[]> = {
  "10229226700886": [
    ...expandCategoryBlocks(
      {
        categoryId: "10229226860430",
        categoryName: "Category 1",
      },
      [
        ["10229225776298", "T1-01"],
        ["10229225776299", "T1-02"],
        ["10229225776300", "T1-03"],
        ["10229225776301", "T1-04"],
        ["10229225776305", "T1-37"],
        ["10229225776306", "T1-38"],
        ["10229225846972", "T1-25"],
        ["10229225846981", "T1-34"],
        ["10229225846874", "T1-17"],
        ["10229225846875", "T1-18"],
        ["10229225846876", "T1-19"],
        ["10229225846878", "T1-21"],
        ["10229225846879", "T1-22"],
        ["10229225846880", "T1-23"],
        ["10229225776302", "T1-05"],
        ["10229225776303", "T1-35"],
        ["10229225776304", "T1-36"],
        ["10229225847090", "T1-06"],
        ["10229225847091", "T1-07"],
        ["10229225847092", "T1-08"],
        ["10229225847093", "T1-09"],
        ["10229225847094", "T1-10"],
        ["10229225847096", "T1-12"],
        ["10229225847097", "T1-13"],
        ["10229225847098", "T1-14"],
        ["10229225847099", "T1-15"],
        ["10229225846973", "T1-26"],
        ["10229225846974", "T1-27"],
        ["10229225846975", "T1-28"],
        ["10229225846976", "T1-29"],
        ["10229225846977", "T1-30"],
        ["10229225846978", "T1-31"],
        ["10229225846979", "T1-32"],
        ["10229225846980", "T1-33"],
        ["10229225846873", "T1-16"],
        ["10229225846881", "T1-24"],
      ],
    ),
    ...expandCategoryBlocks(
      {
        categoryId: "10229226860431",
        categoryName: "Category 2",
      },
      [
        ["10229225776314", "T2-04"],
        ["10229225776315", "T2-05"],
        ["10229225776307", "T2-45"],
        ["10229225776308", "T2-46"],
        ["10229225776309", "T2-47"],
        ["10229225846890", "T2-23"],
        ["10229225846891", "T2-24"],
        ["10229225846883", "T2-25"],
        ["10229225846882", "T2-26"],
        ["10229225846884", "T2-27"],
        ["10229225846885", "T2-28"],
        ["10229225846886", "T2-29"],
        ["10229225776313", "T2-03"],
        ["10229225776316", "T2-06"],
        ["10229225776310", "T2-48"],
        ["10229225847100", "T2-07"],
        ["10229225847101", "T2-08"],
        ["10229225846982", "T2-31"],
        ["10229225846983", "T2-32"],
        ["10229225846994", "T2-43"],
        ["10229225846995", "T2-44"],
        ["10229225846889", "T2-22"],
        ["10229225846887", "T2-30"],
        ["10229225846888", "T2-21"],
        ["10229225847112", "T2-19"],
        ["10229225847113", "T2-20"],
      ],
    ),
    ...expandCategoryBlocks(
      {
        categoryId: "10229226860432",
        categoryName: "Category 3",
      },
      [
        ["10229225847102", "T2-09"],
        ["10229225847103", "T2-10"],
        ["10229225847104", "T2-11"],
        ["10229225846991", "T2-40"],
        ["10229225846992", "T2-41"],
        ["10229225846993", "T2-42"],
        ["10229225847105", "T2-12"],
        ["10229225846984", "T2-33"],
        ["10229225846985", "T2-34"],
        ["10229225846986", "T2-35"],
        ["10229225846987", "T2-36"],
        ["10229225846989", "T2-38"],
        ["10229225846990", "T2-39"],
        ["10229225847107", "T2-14"],
        ["10229225847109", "T2-16"],
        ["10229225847110", "T2-17"],
        ["10229225847111", "T2-18"],
      ],
    ),
    ...expandCategoryBlocks(
      {
        categoryId: "10229226879886",
        categoryName: "Technical",
      },
      [
        ["10229225776299", "T1-02"],
        ["10229225776306", "T1-38"],
      ],
    ),
    ...expandCategoryBlocks(
      {
        categoryId: "10229226860433",
        categoryName: "Category 4",
      },
      [
        ["10229225847107", "T2-14"],
        ["10229225846988", "T2-37"],
      ],
    ),
    ...expandCategoryBlocks(
      {
        categoryId: "10229226879890",
        categoryName: "Easy Access Standard - Category 1",
      },
      [
        ["10229225776299", "T1-02"],
        ["10229225776306", "T1-38"],
        ["10229225847092", "T1-08"],
        ["10229225847097", "T1-13"],
        ["10229225846974", "T1-27"],
        ["10229225846979", "T1-32"],
        ["10229225846876", "T1-19"],
      ],
    ),
    ...expandCategoryBlocks(
      {
        categoryId: "10229226879892",
        categoryName: "Easy Access Amenity - Category 1",
      },
      [
        ["10229225776300", "T1-03"],
        ["10229225776301", "T1-04"],
        ["10229225847092", "T1-08"],
      ],
    ),
    ...expandCategoryBlocks(
      {
        categoryId: "10229227326899",
        categoryName: "Easy Access Amenity - Category 2",
      },
      [["10229225847097", "T1-13"]],
    ),
    ...expandCategoryBlocks(
      {
        categoryId: "10229227326897",
        categoryName: "Easy Access Standard - Category 3",
      },
      [
        ["10229225847103", "T2-10"],
        ["10229225847108", "T2-15"],
      ],
    ),
    ...expandCategoryBlocks(
      {
        categoryId: "10229998853764",
        categoryName: "Front Category 1",
      },
      [
        ["10229225776301", "T1-04"],
        ["10229225776302", "T1-05"],
        ["10229225776304", "T1-36"],
        ["10229225847090", "T1-06"],
        ["10229225847091", "T1-07"],
        ["10229225847092", "T1-08"],
        ["10229225847093", "T1-09"],
        ["10229225847097", "T1-13"],
        ["10229225847098", "T1-14"],
        ["10229225847099", "T1-15"],
        ["10229225846972", "T1-25"],
        ["10229225846973", "T1-26"],
        ["10229225846974", "T1-27"],
        ["10229225846978", "T1-31"],
        ["10229225846979", "T1-32"],
        ["10229225846980", "T1-33"],
        ["10229225846981", "T1-34"],
        ["10229225846874", "T1-17"],
        ["10229225846879", "T1-22"],
        ["10229225846880", "T1-23"],
        ["10229225846881", "T1-24"],
      ],
    ),
    ...expandCategoryBlocks(
      {
        categoryId: "10229998853765",
        categoryName: "Front Category 2",
      },
      [
        ["10229225776316", "T2-06"],
        ["10229225776307", "T2-45"],
        ["10229225776308", "T2-46"],
        ["10229225847100", "T2-07"],
        ["10229225847101", "T2-08"],
        ["10229225847112", "T2-19"],
        ["10229225847113", "T2-20"],
        ["10229225846982", "T2-31"],
        ["10229225846983", "T2-32"],
        ["10229225846994", "T2-43"],
        ["10229225846888", "T2-21"],
        ["10229225846889", "T2-22"],
        ["10229225846890", "T2-23"],
        ["10229225846891", "T2-24"],
        ["10229225846883", "T2-25"],
        ["10229225846882", "T2-26"],
        ["10229225846884", "T2-27"],
        ["10229225846885", "T2-28"],
        ["10229225846886", "T2-29"],
        ["10229225846887", "T2-30"],
      ],
    ),
    ...expandCategoryBlocks(
      {
        categoryId: "10229998853766",
        categoryName: "Front Category 3",
      },
      [
        ["10229225847103", "T2-10"],
        ["10229225847104", "T2-11"],
        ["10229225847109", "T2-16"],
        ["10229225847110", "T2-17"],
        ["10229225847111", "T2-18"],
        ["10229225846984", "T2-33"],
        ["10229225846985", "T2-34"],
        ["10229225846986", "T2-35"],
        ["10229225846991", "T2-40"],
        ["10229225846992", "T2-41"],
      ],
    ),
  ],
};

/** Optional JSON under `prisma/catalogues/` — `{ prefId, categories }`.
 * Rows attach to events with `prefId`, or merge onto `resalePrefId` matches (Mexico vs RSA + resale catalogue). */
const catalogueJsonSnapshots = ["prisma/catalogues/catalogue-10229225516056.json"];

async function main() {
  await prisma.event.deleteMany();

  await prisma.event.createMany({ data: rows });

  const dataDir = process.cwd();
  for (const rel of catalogueJsonSnapshots) {
    const abs = path.join(dataDir, rel);
    if (!fs.existsSync(abs)) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(abs, "utf8"));
    } catch {
      console.error(`Seed: skip unreadable catalogue JSON ${rel}`);
      continue;
    }
    const { prefId, rows: catalogueRows } = catalogueRowsFromPayload(raw);
    const event = await resolveEventForCataloguePref(prisma, prefId);
    if (!event) {
      console.warn(
        `Seed: no event for catalogue pref ${prefId} (${rel}) — set prefId or resalePrefId on an event.`,
      );
      continue;
    }
    await prisma.eventCategory.createMany({
      data: catalogueRows.map((r) => ({ ...r, eventId: event.id })),
    });
  }

  for (const [prefId, cats] of Object.entries(categoryBundlesByPrefId)) {
    if (cats.length === 0) continue;
    const event = await prisma.event.findFirst({
      where: { prefId },
      select: { id: true },
    });
    if (!event) continue;
    await prisma.eventCategory.createMany({
      data: cats.map((c) => ({ ...c, eventId: event.id })),
    });
  }

  const passwordHash = await bcrypt.hash("Tickets@zaq1", 12);
  await prisma.user.upsert({
    where: { username: "shub" },
    create: { username: "shub", passwordHash },
    update: { passwordHash },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
