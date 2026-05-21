"use server";

import { setPersistedMarkupPercent } from "@/lib/markup-settings";

export async function saveMarkupPercentAction(value: number): Promise<void> {
  await setPersistedMarkupPercent(value);
}

export async function clearMarkupPercentAction(): Promise<void> {
  await setPersistedMarkupPercent(0);
}
