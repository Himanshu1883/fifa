import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { SeatsidekickPollSnapshot } from "@/lib/seatsidekick-types";

function snapshotDir(): string {
  const configured = process.env.SEATSIDEKICK_SNAPSHOT_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.join(os.tmpdir(), "seatsidekick-poll");
}

function snapshotPath(performanceId: string): string {
  const safe = performanceId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(snapshotDir(), `${safe}.json`);
}

export async function loadSeatsidekickSnapshot(
  performanceId: string,
): Promise<SeatsidekickPollSnapshot | null> {
  try {
    const raw = await fs.readFile(snapshotPath(performanceId), "utf8");
    const parsed = JSON.parse(raw) as SeatsidekickPollSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.lastPostedTopFingerprint) return parsed;
    if (parsed.seats && typeof parsed.seats === "object") return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function saveSeatsidekickSnapshot(snapshot: SeatsidekickPollSnapshot): Promise<void> {
  const dir = snapshotDir();
  await fs.mkdir(dir, { recursive: true });
  const file = snapshotPath(snapshot.performanceId);
  await fs.writeFile(file, JSON.stringify(snapshot), "utf8");
}
