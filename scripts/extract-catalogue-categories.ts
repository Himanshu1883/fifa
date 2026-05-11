/**
 * Reads a ticketing/catalogue-style JSON export and prints only fields we persist:
 * — category numeric id → categoryId (string)
 * — category label → name.en when name is multilingual, otherwise string name
 * — each block numeric id → categoryBlockId
 * — each block label → name.en when multilingual
 *
 * Block rows are deduplicated inside each category (first occurrence wins).
 *
 * Supported root shapes:
 *   • array of categories: [ { id, name, blocks: [...] }, ... ]
 *   • single category object: { id, name, blocks: [...] }
 *   • { "priceRangeCategories": <array> } (seat-map / ticketing payload)
 *   • array of wrappers with categories: [{ "categories": [...] }] (uses each wrapper’s categories in order)
 *
 * Usage:
 *   npx tsx scripts/extract-catalogue-categories.ts ./path/to/export.json [--pref-id YOUR_PREF_ID]
 *   curl -s … | npx tsx scripts/extract-catalogue-categories.ts -
 */

import * as fs from "node:fs";

function localizedLabel(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
  const o = raw as Record<string, unknown>;
  for (const k of ["en", "de", "fr", "es", "pt", "ar", "default"] as const) {
    const v = o[k];
    if (typeof v === "string" && v.length) return v;
  }
  for (const v of Object.values(o)) {
    if (typeof v === "string" && v.length) return v;
  }
  return "";
}

function coerceId(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

type IncomingBlock = { id?: unknown; name?: unknown };
type IncomingCategory = {
  id?: unknown;
  name?: unknown;
  blocks?: IncomingBlock[];
};

function dedupeBlocks(blocks: IncomingBlock[]): [string, string][] {
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const b of blocks) {
    const bid = coerceId(b.id);
    const label = localizedLabel(b.name);
    if (!bid) continue;
    if (seen.has(bid)) continue;
    seen.add(bid);
    out.push([bid, label]);
  }
  return out;
}

function isCategory(o: unknown): o is IncomingCategory {
  return Boolean(o && typeof o === "object" && Array.isArray((o as IncomingCategory).blocks));
}

function collectCategories(root: unknown): IncomingCategory[] {
  if (Array.isArray(root)) {
    const first = root[0];
    if (root.length && isCategory(first)) return root.filter(isCategory);
    const cats: IncomingCategory[] = [];
    for (const el of root) {
      if (
        el &&
        typeof el === "object" &&
        !Array.isArray(el) &&
        Array.isArray((el as { categories?: unknown }).categories)
      )
        cats.push(...(((el as { categories?: unknown }).categories ?? []) as IncomingCategory[]));
    }
    if (cats.length) return cats.filter((c) => Array.isArray(c.blocks));
    return [];
  }
  if (!root || typeof root !== "object") return [];

  const o = root as Record<string, unknown>;
  if (Array.isArray(o.priceRangeCategories))
    return (o.priceRangeCategories as IncomingCategory[]).filter((c) => Array.isArray(c.blocks));

  if (Array.isArray(o.categories))
    return (o.categories as IncomingCategory[]).filter((c) => Array.isArray(c.blocks));

  if (Array.isArray((o.data as { categories?: unknown } | undefined)?.categories))
    return ((o.data as { categories?: IncomingCategory[] }).categories ?? []).filter(
      (c) => Array.isArray(c.blocks),
    );

  if (isCategory(o)) return [o];

  return [];
}

function escapeCategoryName(label: string): string {
  return label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function printExpandCalls(categories: IncomingCategory[], prefId?: string): void {
  if (prefId) {
    console.log(`// Pref ID: ${prefId}`);
    console.log("// Paste this array spread into prisma/seed.ts under categoryBundlesByPrefId[\"" + prefId + "\"]:");
    console.log("// (replace or merge with existing …expandCategoryBlocks(...),)\n");
  } else {
    console.log("// Paste into prisma/seed.ts under the right pref id:\n");
  }

  for (const cat of categories) {
    const categoryId = coerceId(cat.id);
    const categoryName = localizedLabel(cat.name);
    const blocksRaw = cat.blocks ?? [];
    const blocks = dedupeBlocks(blocksRaw);
    console.log(`    ...expandCategoryBlocks(`);
    console.log(`      {`);
    console.log(`        categoryId: "${categoryId}",`);
    console.log(`        categoryName: "${escapeCategoryName(categoryName)}",`);
    console.log(`      },`);
    console.log(`      [`);
    for (const [bid, bn] of blocks) {
      console.log(`        ["${bid}", "${escapeCategoryName(bn)}"],`);
    }
    console.log(`      ],`);
    console.log(`    ),`);
    console.log(``);
  }
}

function readInput(pathArg: string): string {
  if (pathArg === "-") return fs.readFileSync(0, "utf8");
  return fs.readFileSync(pathArg, "utf8");
}

function parseArgs(argv: string[]) {
  let prefId: string | undefined;
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pref-id") {
      prefId = argv[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--pref-id=")) {
      prefId = a.slice("--pref-id=".length);
      continue;
    }
    if (!a.startsWith("-")) files.push(a);
  }
  return { files, prefId };
}

function main() {
  const { files, prefId } = parseArgs(process.argv.slice(2));
  if (!files.length) {
    console.error(`Usage:\n  npx tsx scripts/extract-catalogue-categories.ts <file.json|-) [--pref-id PREF]\n`);
    process.exit(1);
  }

  let rawText: string;
  try {
    rawText = readInput(files[0]!);
  } catch {
    console.error(`Could not read: ${files[0]}`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    console.error("Input is not valid JSON.");
    process.exit(1);
  }

  const categories = collectCategories(parsed);
  if (!categories.length) {
    console.error(
      "Could not find categories[]. Expected: array of { id, name, blocks }, { categories: [...] }, or a single category object.",
    );
    process.exit(1);
  }

  printExpandCalls(categories, prefId);
}

main();
