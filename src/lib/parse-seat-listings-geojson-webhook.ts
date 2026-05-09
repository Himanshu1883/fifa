import { CataloguePayloadError } from "@/lib/price-range-catalogue";

/** Payload `properties.amount` is integer cents; persisted as-is (minor units). */

export type SeatListingRowInput = {
  categoryBlockId: string;
  categoryBlockName: string;
  areaId: string;
  areaName: string;
  color: string;
  rowLabel: string;
  seatNumber: string;
  seatCategoryId: string;
  seatCategoryName: string;
  contingentId: string;
  amount: number;
  resaleMovementId: string;
  exclusive: boolean;
  propertiesId: string;
  geometryType: string;
  rotation: number;
  coordX: number;
  coordY: number;
  mainId: string;
};

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

function parseExclusive(raw: unknown): boolean {
  if (raw === true || raw === false) return raw;
  if (raw === "true" || raw === 1) return true;
  if (raw === "false" || raw === 0) return false;
  if (raw === undefined || raw === null) return false;
  throw new Error("invalid exclusive");
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

function parseGeometry(
  g: unknown,
): { type: string; rotation: number; x: number; y: number } | null {
  if (!g || typeof g !== "object" || Array.isArray(g)) return null;
  const geo = g as Record<string, unknown>;
  const type = typeof geo.type === "string" ? geo.type.trim() : "";
  if (!type) return null;

  let rotation = 0;
  if (geo.rotation !== undefined && geo.rotation !== null) {
    const r = Number(geo.rotation);
    if (!Number.isFinite(r)) return null;
    rotation = Math.round(r);
  }

  const coords = geo.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const x = Number(coords[0]);
  const y = Number(coords[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { type, rotation, x: Math.round(x), y: Math.round(y) };
}

function tryBuildRow(
  feat: Record<string, unknown>,
  props: Record<string, unknown>,
): SeatListingRowInput | null {
  const block = readBlockAreaPair(props, "block");
  const area = readBlockAreaPair(props, "area");
  if (!block || !area) return null;

  const color = coerceId(props.color);
  if (!color) return null;

  const rowLabel = coerceId(props.row);
  const seatNumber = coerceId(props.number);
  if (!rowLabel || !seatNumber) return null;

  const seatCategoryId = coerceId(props.seatCategoryId ?? props.seat_category_id);
  if (!seatCategoryId) return null;
  const seatCategoryName = localizedLabel(props.seatCategory ?? props.seat_category);

  const contingentId = coerceId(props.contingentId ?? props.contingent_id);
  if (!contingentId) return null;

  const rawAmount = coerceMoneyFinite(props.amount);
  if (rawAmount === null) return null;

  const resaleMovementId = coerceId(
    props.resaleMovementId ?? props.resale_movement_id,
  );
  if (!resaleMovementId) return null;

  let exclusive: boolean;
  try {
    exclusive = parseExclusive(props.exclusive);
  } catch {
    return null;
  }

  const propertiesId = coerceId(props.id);
  if (!propertiesId) return null;

  const mainTop = coerceId(feat.id);
  const mainId = mainTop || propertiesId;
  if (!mainId) return null;

  const geom = parseGeometry(feat.geometry);
  if (!geom) return null;

  return {
    categoryBlockId: block.id,
    categoryBlockName: block.name,
    areaId: area.id,
    areaName: area.name,
    color,
    rowLabel,
    seatNumber,
    seatCategoryId,
    seatCategoryName,
    contingentId,
    amount: rawAmount,
    resaleMovementId,
    exclusive,
    propertiesId,
    geometryType: geom.type,
    rotation: geom.rotation,
    coordX: geom.x,
    coordY: geom.y,
    mainId,
  };
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

function tryParseJsonObjectOrArray(s: string): Record<string, unknown> | null {
  const t = s.trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return null;
  try {
    const v = JSON.parse(t) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Any JSON value — used where Zapier sends stringified arrays or FeatureCollections. */
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

/** Zapier / form tools sometimes wrap the real object or send `features` as a JSON string. */
function unwrapSeatListingsPayload(raw: unknown): {
  root: Record<string, unknown> | null;
  prefObjects: Record<string, unknown>[];
  /** Top-level JSON array is treated as a GeoJSON Feature array (no wrapper object). */
  topLevelFeatureArray?: unknown[];
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
    return { root: null, prefObjects: [], topLevelFeatureArray: cur };
  }
  if (!cur || typeof cur !== "object") {
    throw new CataloguePayloadError(
      'Body must be a JSON object or array of GeoJSON-style features.',
    );
  }

  const prefObjects: Record<string, unknown>[] = [];
  let o = cur as Record<string, unknown>;
  prefObjects.push(o);

  for (let depth = 0; depth < 6; depth++) {
    if (
      Object.prototype.hasOwnProperty.call(o, "features") ||
      Object.prototype.hasOwnProperty.call(o, "Features")
    ) {
      break;
    }
    let inner: Record<string, unknown> | null = null;
    for (const k of WRAPPER_KEYS) {
      const v = o[k];
      if (typeof v === "string") {
        const loose = tryParseJsonLoose(v);
        if (Array.isArray(loose) && loose.length > 0 && loose.every(isFeatureLikeObject)) {
          inner = { features: loose };
          break;
        }
        const parsed = tryParseJsonObjectOrArray(v);
        if (parsed) {
          inner = parsed;
          break;
        }
      }
      if (Array.isArray(v) && v.length > 0) {
        const onlyFeatures = v.every(isFeatureLikeObject);
        if (onlyFeatures) {
          inner = { features: v };
          break;
        }
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        inner = v as Record<string, unknown>;
        break;
      }
    }
    if (!inner) {
      break;
    }
    o = inner;
    prefObjects.push(o);
  }

  return { root: o, prefObjects };
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

/** Walk nested objects (and JSON strings) until we find a `features` / `Features` value. */
function deepFindFeaturesValue(
  obj: Record<string, unknown>,
  depth = 0,
  maxDepth = 16,
): unknown | null {
  if (depth > maxDepth) return null;
  if (
    Object.prototype.hasOwnProperty.call(obj, "features") &&
    obj.features !== undefined
  ) {
    return obj.features;
  }
  if (
    Object.prototype.hasOwnProperty.call(obj, "Features") &&
    obj.Features !== undefined
  ) {
    return obj.Features;
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const found = deepFindFeaturesValue(item as Record<string, unknown>, depth + 1, maxDepth);
          if (found !== null) return found;
        } else if (typeof item === "string") {
          const nested = tryParseJsonLoose(item);
          if (nested && typeof nested === "object") {
            if (!Array.isArray(nested)) {
              const found = deepFindFeaturesValue(nested as Record<string, unknown>, depth + 1, maxDepth);
              if (found !== null) return found;
            } else {
              for (const el of nested) {
                if (el && typeof el === "object" && !Array.isArray(el)) {
                  const found = deepFindFeaturesValue(el as Record<string, unknown>, depth + 1, maxDepth);
                  if (found !== null) return found;
                }
              }
            }
          }
        }
      }
      continue;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const found = deepFindFeaturesValue(v as Record<string, unknown>, depth + 1, maxDepth);
      if (found !== null) return found;
    }
    if (typeof v === "string") {
      const loose = tryParseJsonLoose(v);
      if (loose && typeof loose === "object") {
        if (!Array.isArray(loose)) {
          const found = deepFindFeaturesValue(loose as Record<string, unknown>, depth + 1, maxDepth);
          if (found !== null) return found;
        } else {
          for (const el of loose) {
            if (el && typeof el === "object" && !Array.isArray(el)) {
              const found = deepFindFeaturesValue(el as Record<string, unknown>, depth + 1, maxDepth);
              if (found !== null) return found;
            }
          }
        }
      }
    }
  }
  return null;
}

/** Webhook builders often nest bodies or use different keys for the GeoJSON feature list. */
function resolveFeaturesRaw(
  root: Record<string, unknown> | null,
  topLevelFeatureArray: unknown[] | undefined,
): unknown {
  if (topLevelFeatureArray !== undefined) {
    return topLevelFeatureArray;
  }
  if (!root) {
    throw new CataloguePayloadError(
      'Missing feature list — expected a JSON array of features or an object with "features".',
    );
  }

  if (Object.prototype.hasOwnProperty.call(root, "features")) {
    return root.features;
  }
  if (Object.prototype.hasOwnProperty.call(root, "Features")) {
    return root.Features;
  }

  const altKeys = ["data", "items", "seats", "listings"] as const;
  for (const k of altKeys) {
    if (!Object.prototype.hasOwnProperty.call(root, k)) continue;
    let v: unknown = root[k];
    if (typeof v === "string") {
      const loose = tryParseJsonLoose(v);
      if (Array.isArray(loose)) v = loose;
      else continue;
    }
    if (!Array.isArray(v) || v.length === 0) continue;
    if (v.every(isFeatureLikeObject)) {
      return v;
    }
  }

  const nested = deepFindFeaturesValue(root);
  if (nested !== null) {
    return nested;
  }

  for (const v of Object.values(root)) {
    let arr: unknown = v;
    if (typeof v === "string") {
      const loose = tryParseJsonLoose(v);
      if (Array.isArray(loose)) arr = loose;
      else continue;
    }
    if (Array.isArray(arr) && arr.length > 0 && arr.every(isFeatureLikeObject)) {
      return arr;
    }
  }

  throw new CataloguePayloadError(
    'Missing feature list — expected { "features": [ ... ] }, or "data" / "items" / "seats" / "listings" as a non-empty array of { "properties": { ... } } objects, or a top-level JSON feature array.',
  );
}

function coerceFeaturesArray(rawFeatures: unknown): unknown[] {
  let features: unknown = rawFeatures;
  if (typeof features === "string") {
    try {
      features = JSON.parse(features) as unknown;
    } catch {
      throw new CataloguePayloadError(
        'Property "features" must be a JSON array or a JSON string of an array.',
      );
    }
  }
  if (!Array.isArray(features)) {
    throw new CataloguePayloadError(
      'Feature list must be a JSON array (or a JSON string of an array). Expected { "features": [ GeoJSON features ] } or an alternate key such as "data" / "items". If you use a webhook builder, send raw JSON as the POST body, or wrap it once under "data" / "payload".',
    );
  }
  return features;
}

export function parseSeatListingsGeojsonBody(
  raw: unknown,
  prefQs: string | null,
): {
  resalePrefId: string;
  rows: SeatListingRowInput[];
  featureCount: number;
  skippedCount: number;
} {
  const { root, prefObjects, topLevelFeatureArray } =
    unwrapSeatListingsPayload(raw);
  const features = coerceFeaturesArray(
    resolveFeaturesRaw(root, topLevelFeatureArray),
  );

  const prefFromQs = prefQs?.trim() ?? "";
  const fromBody = firstPrefFromObjects(prefObjects);
  const resalePrefId = prefFromQs || fromBody;

  if (!resalePrefId) {
    throw new CataloguePayloadError(
      "Missing resalePrefId — use ?resalePrefId= or ?prefId= or JSON fields resalePrefId / prefId.",
    );
  }

  const rows: SeatListingRowInput[] = [];
  let skippedCount = 0;
  const seenMovement = new Set<string>();

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

    const built = tryBuildRow(feat, props as Record<string, unknown>);
    if (!built) {
      skippedCount += 1;
      continue;
    }
    if (seenMovement.has(built.resaleMovementId)) {
      skippedCount += 1;
      continue;
    }
    seenMovement.add(built.resaleMovementId);
    rows.push(built);
  }

  return {
    resalePrefId,
    rows,
    featureCount: features.length,
    skippedCount,
  };
}
