import { CataloguePayloadError } from "@/lib/price-range-catalogue";

export type SockAvailableRowInput = {
  areaId: string;
  areaName: string;
  blockId: string;
  blockName: string;
  contingentId: string;
  seatId: string;
  seatNumber: string;
  amount: number | null;
  resaleMovementId: string;
  row: string;
  categoryName: string;
  categoryId: string;
};

type BuildSkipReason =
  | "missing_block"
  | "missing_area"
  | "missing_contingent_id"
  | "missing_seat_id"
  | "missing_seat_number"
  | "missing_resale_movement_id"
  | "missing_row"
  | "missing_category_id"
  | "invalid";

type BuildRowResult =
  | { kind: "ok"; row: SockAvailableRowInput }
  | { kind: "skip"; reason: BuildSkipReason };

function localizedLabel(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
  const o = raw as Record<string, unknown>;
  for (const k of ["en", "de", "fr", "es", "pt", "ar", "default"] as const) {
    const v = o[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  for (const v of Object.values(o)) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

function coerceId(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function coerceMoneyFinite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim().replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readBlockAreaPair(
  props: Record<string, unknown>,
  key: string,
): { id: string; name: string } | null {
  const raw = props[key];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = coerceId(o.id);
  if (!id) return null;
  return { id, name: localizedLabel(o.name) };
}

function isFeatureLikeObject(item: unknown): boolean {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const r = item as Record<string, unknown>;
  return (
    typeof r.properties === "object" &&
    r.properties !== null &&
    !Array.isArray(r.properties)
  );
}

const WRAPPER_KEYS = [
  "data",
  "payload",
  "body",
  "json",
  "record",
  "input",
  "hook",
  "event",
  "result",
  "response",
  "output",
] as const;

/** Any JSON value — used where tools send stringified objects/arrays. */
function tryParseJsonLoose(s: string): unknown | null {
  const t = s.trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}

function firstPrefFromObjects(objs: Record<string, unknown>[]): string {
  for (const obj of objs) {
    const p =
      (typeof obj.resalePrefId === "string" && obj.resalePrefId.trim()) ||
      (typeof obj.prefId === "string" && obj.prefId.trim()) ||
      "";
    if (p) return p;
  }
  return "";
}

function unwrapPayload(raw: unknown): {
  root: Record<string, unknown> | null;
  prefObjects: Record<string, unknown>[];
  topLevelArray?: unknown[];
} {
  let cur: unknown = raw;
  if (typeof cur === "string") {
    try {
      cur = JSON.parse(cur) as unknown;
    } catch {
      throw new CataloguePayloadError("Body must be valid JSON.");
    }
  }
  if (Array.isArray(cur)) {
    return { root: null, prefObjects: [], topLevelArray: cur };
  }
  if (!cur || typeof cur !== "object") {
    throw new CataloguePayloadError(
      'Body must be a JSON object, a GeoJSON FeatureCollection, a single Feature, or an array of GeoJSON-style features.',
    );
  }

  const prefObjects: Record<string, unknown>[] = [];
  let o = cur as Record<string, unknown>;
  prefObjects.push(o);

  for (let depth = 0; depth < 6; depth++) {
    if (
      Object.prototype.hasOwnProperty.call(o, "features") ||
      Object.prototype.hasOwnProperty.call(o, "Features") ||
      (typeof o.type === "string" &&
        (o.type === "FeatureCollection" || o.type === "Feature"))
    ) {
      break;
    }
    let inner: Record<string, unknown> | null = null;
    for (const k of WRAPPER_KEYS) {
      const v = o[k];
      if (typeof v === "string") {
        const loose = tryParseJsonLoose(v);
        if (loose && typeof loose === "object" && !Array.isArray(loose)) {
          inner = loose as Record<string, unknown>;
          break;
        }
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        inner = v as Record<string, unknown>;
        break;
      }
    }
    if (!inner) break;
    o = inner;
    prefObjects.push(o);
  }

  return { root: o, prefObjects };
}

function coerceFeaturesFromUnknown(rawFeatures: unknown): unknown[] {
  let features: unknown = rawFeatures;
  if (typeof features === "string") {
    const parsed = tryParseJsonLoose(features);
    if (parsed === null) {
      throw new CataloguePayloadError(
        'Property "features" must be a JSON array or a JSON string of an array.',
      );
    }
    features = parsed;
  }
  if (!Array.isArray(features)) {
    throw new CataloguePayloadError(
      'Feature list must be a JSON array (or a JSON string of an array).',
    );
  }
  return features;
}

function resolveFeaturesRaw(
  root: Record<string, unknown> | null,
  topLevelArray: unknown[] | undefined,
): unknown {
  if (topLevelArray !== undefined) return topLevelArray;
  if (!root) {
    throw new CataloguePayloadError(
      'Missing features — expected a JSON array of features, a GeoJSON FeatureCollection, or an object with "features".',
    );
  }

  const t = typeof root.type === "string" ? root.type : "";
  if (t === "Feature") return [root];
  if (t === "FeatureCollection" && Object.prototype.hasOwnProperty.call(root, "features")) {
    return root.features;
  }

  if (Object.prototype.hasOwnProperty.call(root, "features")) return root.features;
  if (Object.prototype.hasOwnProperty.call(root, "Features")) return root.Features;

  // Common alternates used by webhook builders.
  const altKeys = ["data", "items", "seats", "listings", "featuresRaw"] as const;
  for (const k of altKeys) {
    if (!Object.prototype.hasOwnProperty.call(root, k)) continue;
    const v = root[k];
    if (Array.isArray(v) && v.length > 0) return v;
    if (typeof v === "string") {
      const parsed = tryParseJsonLoose(v);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  }

  // As a last resort: if the object looks like a Feature (has properties), accept it.
  if (isFeatureLikeObject(root)) return [root];

  throw new CataloguePayloadError(
    'Missing features — expected { "type":"FeatureCollection", "features":[...] }, a single { "type":"Feature", ... }, a raw [ ... ] array, or a wrapper containing "features".',
  );
}

function tryBuildRow(
  props: Record<string, unknown>,
): BuildRowResult {
  const block = readBlockAreaPair(props, "block");
  const area = readBlockAreaPair(props, "area");
  if (!block) return { kind: "skip", reason: "missing_block" };
  if (!area) return { kind: "skip", reason: "missing_area" };

  const contingentId = coerceId(props.contingentId ?? props.contingent_id);
  if (!contingentId) return { kind: "skip", reason: "missing_contingent_id" };

  const seatId = coerceId(props.id);
  if (!seatId) return { kind: "skip", reason: "missing_seat_id" };

  const seatNumber = coerceId(props.number);
  if (!seatNumber) return { kind: "skip", reason: "missing_seat_number" };

  const resaleMovementId = coerceId(
    props.resaleMovementId ?? props.resale_movement_id,
  );
  if (!resaleMovementId) return { kind: "skip", reason: "missing_resale_movement_id" };

  const row = coerceId(props.row);
  if (!row) return { kind: "skip", reason: "missing_row" };

  const categoryId = coerceId(props.seatCategoryId ?? props.seat_category_id);
  if (!categoryId) return { kind: "skip", reason: "missing_category_id" };

  const categoryName = localizedLabel(props.seatCategory ?? props.seat_category);

  const amount = coerceMoneyFinite(props.amount);

  return {
    kind: "ok",
    row: {
      areaId: area.id,
      areaName: area.name,
      blockId: block.id,
      blockName: block.name,
      contingentId,
      seatId,
      seatNumber,
      amount,
      resaleMovementId,
      row,
      categoryName,
      categoryId,
    },
  };
}

export function parseSockAvailableGeojsonBody(
  raw: unknown,
  prefQs: string | null,
): {
  prefId: string;
  rows: SockAvailableRowInput[];
  featureCount: number;
  skippedCount: number;
  skippedMissingSeatIdCount: number;
  skippedMissingCategoryIdCount: number;
  kind: "RESALE" | "LAST_MINUTE";
} {
  const { root, prefObjects, topLevelArray } = unwrapPayload(raw);
  const features = coerceFeaturesFromUnknown(resolveFeaturesRaw(root, topLevelArray));

  const prefFromQs = prefQs?.trim() ?? "";
  const fromBody = firstPrefFromObjects(prefObjects);
  const prefId = prefFromQs || fromBody;
  if (!prefId) {
    throw new CataloguePayloadError(
      "Missing prefId — use ?prefId= or ?resalePrefId= or JSON fields prefId / resalePrefId.",
    );
  }

  const kindFromQs =
    (root && typeof root.kind === "string" ? root.kind : "") ||
    (root && typeof root.source === "string" ? root.source : "") ||
    (root && typeof root.dataKind === "string" ? root.dataKind : "");
  const kindRaw = (kindFromQs || "").trim().toLowerCase();
  const kind: "RESALE" | "LAST_MINUTE" =
    kindRaw === "last_minute" || kindRaw === "lastminute" || kindRaw === "last-minute"
      ? "LAST_MINUTE"
      : "RESALE";

  const rows: SockAvailableRowInput[] = [];
  let skippedCount = 0;
  let skippedMissingSeatIdCount = 0;
  let skippedMissingCategoryIdCount = 0;

  for (const f of features) {
    if (!f || typeof f !== "object" || Array.isArray(f)) {
      skippedCount += 1;
      continue;
    }
    const feat = f as Record<string, unknown>;
    const props = feat.properties;
    if (!props || typeof props !== "object" || Array.isArray(props)) {
      skippedCount += 1;
      continue;
    }

    const built = tryBuildRow(props as Record<string, unknown>);
    if (built.kind === "skip") {
      skippedCount += 1;
      if (built.reason === "missing_seat_id") skippedMissingSeatIdCount += 1;
      if (built.reason === "missing_category_id") skippedMissingCategoryIdCount += 1;
      continue;
    }
    rows.push(built.row);
  }

  if (features.length > 0 && rows.length === 0) {
    throw new CataloguePayloadError(
      [
        "No usable features found in payload.",
        "Expected each feature to have `properties.block.id`, `properties.area.id`, `properties.contingentId`, `properties.id`, `properties.number`, `properties.resaleMovementId`, `properties.row`, and `properties.seatCategoryId`.",
      ].join(" "),
    );
  }

  return {
    prefId,
    rows,
    featureCount: features.length,
    skippedCount,
    skippedMissingSeatIdCount,
    skippedMissingCategoryIdCount,
    kind,
  };
}

