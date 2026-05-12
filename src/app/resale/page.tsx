import { redirect } from "next/navigation";
import {
  HomePage,
  firstQs,
  homeBasePathForKind,
  homeQueryStringFrom,
  parseHomeSockKindFilter,
  type HomeSearchParams,
} from "@/app/home/HomePage";

export const runtime = "nodejs";

type Props = {
  searchParams: Promise<HomeSearchParams>;
};

export default async function ResalePage({ searchParams }: Props) {
  const q = await searchParams;
  const kindRaw = (firstQs(q.kind) ?? "").trim();
  if (kindRaw && parseHomeSockKindFilter(q) === "LAST_MINUTE") {
    const qs = homeQueryStringFrom(q);
    redirect(`${homeBasePathForKind("LAST_MINUTE")}${qs ? `?${qs}` : ""}`);
  }
  return <HomePage searchParams={Promise.resolve(q)} kind="RESALE" />;
}

