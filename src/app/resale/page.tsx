import { redirect } from "next/navigation";
import { homeQueryStringFrom, type HomeSearchParams } from "@/app/home/HomePage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<HomeSearchParams>;
};

/** Legacy /resale URL → home (resale is now the default at /). */
export default async function ResalePage({ searchParams }: Props) {
  const q = await searchParams;
  const qs = homeQueryStringFrom(q);
  redirect(`/${qs ? `?${qs}` : ""}`);
}
