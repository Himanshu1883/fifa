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
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<HomeSearchParams>;
};
export default async function Home({ searchParams }: Props) {
  const q = await searchParams;
  const kindRaw = (firstQs(q.kind) ?? "").trim();
  if (kindRaw && parseHomeSockKindFilter(q) === "RESALE") {
    const qs = homeQueryStringFrom(q);
    redirect(`${homeBasePathForKind("RESALE")}${qs ? `?${qs}` : ""}`);
  }
  const onlyBuyingCriteriaMeet = firstQs(q.bc) === "1";
  const onlyDeals = firstQs(q.deal) === "1";
  return (
    <HomePage
      searchParams={Promise.resolve(q)}
      kind="LAST_MINUTE"
      onlyBuyingCriteriaMeet={onlyBuyingCriteriaMeet}
      onlyDeals={onlyDeals}
    />
  );
}
