import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { BuyingCriteriaDialog } from "@/app/buying-criteria-dialog";

export const runtime = "nodejs";

type RuleRow = {
  eventId: number;
  categoryNum: 1 | 2 | 3 | 4;
  kind: "QTY_UNDER_PRICE" | "TOGETHER_UNDER_PRICE";
  minQty: number | null;
  togetherCount: number | null;
  maxPriceUsdCents: number | null;
};

function formatUsdFromCents(cents: number | null): string {
  if (cents === null) return "—";
  const whole = cents % 100 === 0;
  const v = cents / 100;
  return whole ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`;
}

function summarizeTogetherRules(rules: RuleRow[]): string {
  const parts = rules
    .filter((r) => r.kind === "TOGETHER_UNDER_PRICE" && r.togetherCount !== null)
    .slice()
    .sort((a, b) => (a.togetherCount ?? 0) - (b.togetherCount ?? 0))
    .map((r) => {
      const t = r.togetherCount ?? 0;
      const label = t === 6 ? "6+T" : `${t}T`;
      return `${label} ≤${formatUsdFromCents(r.maxPriceUsdCents)}`;
    });
  return parts.length ? parts.join("; ") : "—";
}

function summarizeQtyRule(rules: RuleRow[]): string {
  const qty = rules.find((r) => r.kind === "QTY_UNDER_PRICE");
  if (!qty) return "—";
  const minQty = qty.minQty ?? null;
  if (minQty === null) return `Qty≥? ≤${formatUsdFromCents(qty.maxPriceUsdCents)}`;
  return `Qty≥${minQty} ≤${formatUsdFromCents(qty.maxPriceUsdCents)}`;
}

export default async function BuyingCriteriaPage() {
  const session = await getSession();
  if (!session) redirect("/login?msg=buying_criteria_signin_required&next=%2Fbuying-criteria");
  const userId = Number(session.sub);
  if (!Number.isInteger(userId) || userId <= 0) redirect("/login?msg=buying_criteria_signin_required&next=%2Fbuying-criteria");

  const events = await prisma.event.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, matchLabel: true, name: true },
  });
  const eventIds = events.map((e) => e.id);

  const criteriaRows =
    eventIds.length === 0
      ? []
      : await prisma.eventBuyingCriteria.findMany({
          where: { eventId: { in: eventIds } },
          select: { eventId: true, cat3FrontRow: true },
        });

  const frontRowByEventId = new Map<number, boolean>();
  for (const r of criteriaRows) frontRowByEventId.set(r.eventId, r.cat3FrontRow);

  const ruleRows =
    eventIds.length === 0
      ? []
      : await prisma.eventBuyingCriteriaRule.findMany({
          where: { eventId: { in: eventIds } },
          select: {
            eventId: true,
            categoryNum: true,
            kind: true,
            minQty: true,
            togetherCount: true,
            maxPriceUsdCents: true,
          },
          orderBy: [{ eventId: "asc" }, { categoryNum: "asc" }, { kind: "asc" }, { togetherCount: "asc" }, { minQty: "asc" }],
        });

  const asCategoryNum = (value: number): 1 | 2 | 3 | 4 | null =>
    value === 1 || value === 2 || value === 3 || value === 4 ? value : null;

  const rulesByEventId = new Map<number, Record<1 | 2 | 3 | 4, RuleRow[]>>();
  for (const rule of ruleRows) {
    const cat = asCategoryNum(rule.categoryNum);
    if (cat === null) continue;
    const perEvent = rulesByEventId.get(rule.eventId) ?? { 1: [], 2: [], 3: [], 4: [] };
    perEvent[cat].push({
      eventId: rule.eventId,
      categoryNum: cat,
      kind: rule.kind,
      minQty: rule.minQty ?? null,
      togetherCount: rule.togetherCount ?? null,
      maxPriceUsdCents: rule.maxPriceUsdCents ?? null,
    });
    rulesByEventId.set(rule.eventId, perEvent);
  }

  const eventStubs = events.map((e) => ({ id: e.id, matchLabel: e.matchLabel, name: e.name }));

  return (
    <div className="min-h-screen bg-[color:var(--ticketing-surface)] font-sans text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_85%_55%_at_50%_-18%,var(--ticketing-accent-dim),transparent_52%),radial-gradient(ellipse_55%_45%_at_100%_0%,color-mix(in_oklab,var(--ticketing-accent)_10%,transparent),transparent_45%),radial-gradient(ellipse_50%_40%_at_0%_100%,rgba(255,255,255,0.03),transparent_50%)]"
        aria-hidden
      />

      <div className="flex min-h-screen w-full flex-col gap-4 px-4 pb-12 pt-6 sm:gap-5 sm:px-6 sm:pb-14 sm:pt-7">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/35 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.04] backdrop-blur-md">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[color:color-mix(in_oklab,var(--ticketing-accent)_70%,transparent)] to-transparent"
            aria-hidden
          />

          <header className="relative px-4 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Preferences</p>
                <h1 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-[2.125rem] sm:leading-tight">
                  Buying criteria
                </h1>
                <p className="max-w-2xl text-pretty text-sm leading-relaxed text-zinc-400">
                  Saved per-match rules across categories. Values below reflect persisted data (no need to open the editor).
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <BuyingCriteriaDialog
                  events={eventStubs}
                  triggerLabel="Edit"
                  triggerClassName="rounded-md bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] px-3 py-1.5 text-xs font-medium text-zinc-100 ring-1 ring-white/10 hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_18%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                />
                <Link
                  href="/"
                  className="rounded-md bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.12]"
                >
                  Back to schedule
                </Link>
                <Link
                  href="/settings"
                  className="rounded-md bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.10]"
                >
                  Settings
                </Link>
              </div>
            </div>

            <div
              className="mt-6 h-px w-full bg-gradient-to-r from-[color:color-mix(in_oklab,var(--ticketing-accent)_40%,transparent)] via-white/[0.12] to-transparent"
              aria-hidden
            />
          </header>

          <div className="border-t border-white/[0.06] px-4 pb-6 pt-5 sm:px-8 sm:pb-8">
            <section aria-label="Saved buying criteria">
              <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/20 ring-1 ring-white/[0.04]">
                <div className="max-h-[min(70vh,52rem)] overflow-auto overscroll-contain">
                  <table className="min-w-[72rem] w-full border-collapse text-left text-sm">
                    <thead className="sticky top-0 z-20 border-b border-white/[0.10] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_94%,white_3%)] text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 shadow-[0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-[color:color-mix(in_oklab,var(--ticketing-surface)_88%,transparent)]">
                      <tr>
                        <th scope="col" className="whitespace-nowrap px-3 py-3 pl-4 font-mono sm:px-4 sm:pl-5">
                          Match
                        </th>
                        <th scope="col" className="min-w-[14rem] px-3 py-3 sm:px-4">
                          Event
                        </th>
                        <th scope="col" className="min-w-[12rem] px-3 py-3 sm:px-4">
                          CAT 1
                        </th>
                        <th scope="col" className="min-w-[12rem] px-3 py-3 sm:px-4">
                          CAT 2
                        </th>
                        <th scope="col" className="min-w-[12rem] px-3 py-3 sm:px-4">
                          CAT 3
                        </th>
                        <th scope="col" className="min-w-[10rem] px-3 py-3 text-center sm:px-4">
                          CAT 3 FRONT ROW
                        </th>
                        <th scope="col" className="min-w-[12rem] px-3 py-3 pr-4 sm:px-4 sm:pr-5">
                          CAT 4
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-200">
                      {events.map((event, idx) => {
                        const zebra = idx % 2 === 1 ? "bg-[color:var(--ticketing-elevated)]" : "bg-transparent";
                        const frontRow = frontRowByEventId.get(event.id) ?? false;
                        const perEvent = rulesByEventId.get(event.id) ?? { 1: [], 2: [], 3: [], 4: [] };
                        const cell = (cat: 1 | 2 | 3 | 4) => {
                          const rules = perEvent[cat] ?? [];
                          const qty = summarizeQtyRule(rules);
                          const together = summarizeTogetherRules(rules);
                          return (
                            <div className="space-y-1">
                              <div className="text-[11px] font-semibold text-zinc-200">{qty}</div>
                              <div className="text-[11px] leading-snug text-zinc-500">
                                <span className="line-clamp-2">{together}</span>
                              </div>
                            </div>
                          );
                        };
                        return (
                          <tr
                            key={event.id}
                            className={`border-t border-white/[0.06] transition-colors hover:bg-[color:color-mix(in_oklab,white_9%,transparent)] ${zebra}`}
                          >
                            <td className="whitespace-nowrap px-3 py-2.5 pl-4 align-top font-mono text-[11px] font-semibold text-[color:color-mix(in_oklab,var(--ticketing-accent)_72%,white_12%)] sm:px-4 sm:pl-5">
                              {event.matchLabel}
                            </td>
                            <td className="px-3 py-2.5 align-top text-xs text-zinc-200 sm:px-4">
                              <span className="line-clamp-2">{event.name}</span>
                            </td>
                            <td className="px-3 py-2.5 align-top sm:px-4">{cell(1)}</td>
                            <td className="px-3 py-2.5 align-top sm:px-4">{cell(2)}</td>
                            <td className="px-3 py-2.5 align-top sm:px-4">{cell(3)}</td>
                            <td className="px-3 py-2.5 align-top text-center sm:px-4">
                              <span
                                className={`inline-flex min-h-9 w-full items-center justify-center rounded-md border px-2.5 text-xs font-semibold shadow-inner shadow-black/25 ring-1 ring-white/[0.04] ${
                                  frontRow
                                    ? "border-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] text-zinc-100"
                                    : "border-white/10 bg-black/35 text-zinc-400"
                                }`}
                              >
                                {frontRow ? "YES" : "—"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 pr-4 align-top sm:px-4 sm:pr-5">{cell(4)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                Qty rules are stored as <span className="font-medium text-zinc-300">Qty≥min ≤$max</span>. Together rules are stored per category as{" "}
                <span className="font-medium text-zinc-300">2T/3T/… ≤$max</span>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

