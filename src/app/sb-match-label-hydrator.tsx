"use client";

import { hydrateSbMatchLabels } from "@/app/use-sb-match-label";
import { useEffect } from "react";

type Props = {
  labels: Record<string, string | null>;
};

/** Seeds the client SB match-label cache from server-resolved data (one fetch, zero per-row calls). */
export function SbMatchLabelHydrator({ labels }: Props) {
  useEffect(() => {
    hydrateSbMatchLabels(labels);
  }, [labels]);

  return null;
}
