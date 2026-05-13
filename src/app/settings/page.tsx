import Link from "next/link";
import { headers } from "next/headers";
import { requireAdminViewer } from "@/lib/auth/require-viewer";

export const runtime = "nodejs";

type EndpointParam = {
  name: string;
  required: boolean;
  notes?: string;
};

type EndpointItem = {
  title: string;
  path: string;
  methods: string[];
  queryParams: EndpointParam[];
  notes: string;
  sampleCurl: string[];
};

function pillClass(method: string): string {
  const m = method.toUpperCase();
  if (m === "GET")
    return "border-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] text-[color:color-mix(in_oklab,var(--ticketing-accent)_72%,white_12%)]";
  if (m === "POST") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  return "border-white/15 bg-white/5 text-zinc-200";
}

function renderQueryParams(params: EndpointParam[]) {
  if (params.length === 0) {
    return <span className="text-zinc-500">None</span>;
  }
  return (
    <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
      {params.map((p) => (
        <li key={p.name} className="flex flex-wrap items-baseline gap-2">
          <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-zinc-200">
            {p.name}
          </code>
          <span
            className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
              p.required ? "text-[color:color-mix(in_oklab,var(--ticketing-accent)_78%,white_18%)]" : "text-zinc-500"
            }`}
          >
            {p.required ? "required" : "optional"}
          </span>
          {p.notes ? (
            <span className="text-xs leading-relaxed text-zinc-500">{p.notes}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default async function SettingsPage() {
  await requireAdminViewer();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const baseUrl = host ? `${proto}://${host}` : "http://localhost:3000";

  const showBoxofficeSection =
    process.env.NODE_ENV === "development" ||
    /^(1|true|yes)$/i.test((process.env.BOXOFFICE_WS_SHOW_IN_PROD ?? "").trim());

  const boxofficePort = process.env.BOXOFFICE_WS_PORT ?? "3020";
  const boxofficeWsUrl = `ws://127.0.0.1:${boxofficePort}/ws`;
  const boxofficeHttpUrl = `http://127.0.0.1:${boxofficePort}`;
  const boxofficeTokenEnabled = Boolean((process.env.BOXOFFICE_WS_TOKEN ?? "").trim());
  const boxofficeProxyStatusUrl = `${baseUrl}/api/boxoffice/status`;
  const boxofficeProxyBroadcastUrl = `${baseUrl}/api/boxoffice/broadcast`;

  const webhooks: EndpointItem[] = [
    {
      title: "Event catalogue (pref or resale lookup)",
      path: "/api/webhooks/event-catalogue",
      methods: ["GET", "POST"],
      queryParams: [
        {
          name: "prefId",
          required: false,
          notes: "Used when POST body is a raw array and omits prefId",
        },
      ],
      notes:
        "Accepts ticketing catalogue categories + availability rows. Inserts missing EventCategory rows; does not update existing rows. Event lookup matches Event.prefId OR Event.resalePrefId.",
      sampleCurl: [
        `curl -sS "${baseUrl}/api/webhooks/event-catalogue"`,
        `curl -sS -X POST "${baseUrl}/api/webhooks/event-catalogue?prefId=CATALOGUE_PREF_ID" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  --data-binary @catalogue.json`,
      ],
    },
    {
      title: "Event catalogue (resale-pref only)",
      path: "/api/webhooks/event-catalogue-resale",
      methods: ["GET", "POST"],
      queryParams: [
        { name: "resalePrefId", required: false, notes: "Alias: prefId" },
        { name: "prefId", required: false, notes: "Alias for resalePrefId" },
      ],
      notes:
        "Same payload as event-catalogue, but resolves events only by Event.resalePrefId (resale catalogue pref).",
      sampleCurl: [
        `curl -sS "${baseUrl}/api/webhooks/event-catalogue-resale"`,
        `curl -sS -X POST "${baseUrl}/api/webhooks/event-catalogue-resale?resalePrefId=RESALE_PREF_ID" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  --data-binary @catalogue.json`,
      ],
    },
    {
      title: "Resale seat listings (GeoJSON)",
      path: "/api/webhooks/event-seat-listings-resale",
      methods: ["GET", "POST"],
      queryParams: [
        { name: "resalePrefId", required: false, notes: "Alias: prefId" },
        { name: "prefId", required: false, notes: "Alias for resalePrefId" },
      ],
      notes:
        "GeoJSON-style seat map payload. Replace semantics: each POST deletes all existing event_seat_listings for the event and inserts the new payload. Event lookup matches Event.resalePrefId only.",
      sampleCurl: [
        `curl -sS "${baseUrl}/api/webhooks/event-seat-listings-resale"`,
        `curl -sS -X POST "${baseUrl}/api/webhooks/event-seat-listings-resale?resalePrefId=RESALE_PREF_ID" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  --data-binary @seat-listings.geojson`,
      ],
    },
    {
      title: "Sock available (GeoJSON seat features)",
      path: "/api/webhooks/sock-available",
      methods: ["GET", "POST"],
      queryParams: [
        { name: "prefId", required: false, notes: "Can match Event.prefId or Event.resalePrefId" },
        { name: "resalePrefId", required: false, notes: "Alias for prefId (same id value)" },
      ],
      notes:
        "Ingests GeoJSON-style seat listing features into sock_available. Replace semantics: each POST deletes all existing sock_available rows for the event and inserts the new snapshot. Event lookup matches Event.prefId OR Event.resalePrefId.",
      sampleCurl: [
        `curl -sS "${baseUrl}/api/webhooks/sock-available"`,
        `curl -sS -X POST "${baseUrl}/api/webhooks/sock-available?prefId=CATALOGUE_PREF_ID" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  --data-binary @sock-available.geojson`,
      ],
    },
    {
      title: "Sock available (Shop / Last Minute)",
      path: "/api/webhooks/sock-available-shop",
      methods: ["GET", "POST"],
      queryParams: [
        { name: "prefId", required: false, notes: "Can match Event.prefId or Event.resalePrefId" },
        { name: "resalePrefId", required: false, notes: "Alias for prefId (same id value)" },
      ],
      notes:
        "Same payload as sock-available, but always stores kind=LAST_MINUTE (Shop). Replace semantics are scoped to Shop rows only.",
      sampleCurl: [
        `curl -sS "${baseUrl}/api/webhooks/sock-available-shop"`,
        `curl -sS -X POST "${baseUrl}/api/webhooks/sock-available-shop?prefId=CATALOGUE_PREF_ID" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  --data-binary @sock-available.geojson`,
      ],
    },
    {
      title: "Shop event category blocks (face value)",
      path: "/api/webhooks/shop-event-category",
      methods: ["GET", "POST"],
      queryParams: [
        {
          name: "prefId",
          required: false,
          notes: "Recommended. Resolves Event by matching prefId OR resalePrefId.",
        },
        {
          name: "eventId",
          required: false,
          notes: "Alternative. If both prefId and eventId are provided, eventId wins.",
        },
      ],
      notes:
        "Stores face-value category×block rows for an event (shop_event_category). Snapshot replace (only when at least 1 row is accepted): each POST deletes all existing rows for the resolved event then inserts the unique payload. Preferred POST body: { priceRangeCategories, seatMapPriceRanges }. Integer amounts are upstream mills (USD ÷1000); decimals are USD as-is. Response includes received/accepted/deleted/inserted/skipped/partial.",
      sampleCurl: [
        `curl -sS "${baseUrl}/api/webhooks/shop-event-category"`,
        `curl -sS -X POST "${baseUrl}/api/webhooks/shop-event-category?prefId=CATALOGUE_PREF_ID" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  --data-binary '{"priceRangeCategories":[{"id":"1","name":{"en":"Category 1"},"minPrice":380000,"blocks":[{"id":"A","name":{"en":"Block A"}}]}],"seatMapPriceRanges":{"seatPriceRangesByAreaBlock":{"A":{"min":380000}}}}'`,
      ],
    },
    {
      title: "Event block seat now (category×block availability)",
      path: "/api/webhooks/event-block-seat-now",
      methods: ["GET", "POST"],
      queryParams: [
        { name: "prefId", required: false, notes: "Can match Event.prefId or Event.resalePrefId" },
        { name: "resalePrefId", required: false, notes: "Alias for prefId (same id value)" },
      ],
      notes:
        "Stores per-event category×block availability and availabilityResale (from priceRangeCategories[*].areaBlocksAvailability). Replace semantics: each POST deletes all existing rows for the event and inserts the new snapshot.",
      sampleCurl: [
        `curl -sS "${baseUrl}/api/webhooks/event-block-seat-now"`,
        `curl -sS -X POST "${baseUrl}/api/webhooks/event-block-seat-now?prefId=CATALOGUE_PREF_ID" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  --data-binary @event-block-seat-now.json`,
      ],
    },
    {
      title: "Category block prices (auto pref/resale lookup)",
      path: "/api/webhooks/event-category-prices",
      methods: ["GET", "POST"],
      queryParams: [
        { name: "prefId", required: false, notes: "If body omits prefId or is a raw array" },
        { name: "resalePrefId", required: false, notes: "Also accepted as a prefId source" },
        {
          name: "amountUnit",
          required: false,
          notes: 'Omit or "cents" (default). Use amountUnit=usd if JSON amounts are dollars.',
        },
      ],
      notes:
        "Posts a list of category/block min+max prices. Resolves event by resalePrefId first, then primary prefId. Stores catalogueSource accordingly.",
      sampleCurl: [
        `curl -sS "${baseUrl}/api/webhooks/event-category-prices"`,
        `curl -sS -X POST "${baseUrl}/api/webhooks/event-category-prices?prefId=CATALOGUE_PREF_ID&amountUnit=cents" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  --data-binary @category-prices.json`,
      ],
    },
    {
      title: "Category block prices (primary pref only)",
      path: "/api/webhooks/event-category-prices-pref",
      methods: ["GET", "POST"],
      queryParams: [
        { name: "prefId", required: false, notes: "Must match Event.prefId" },
        {
          name: "amountUnit",
          required: false,
          notes: 'Omit or "cents" (default). Use amountUnit=usd if JSON amounts are dollars.',
        },
      ],
      notes:
        "Same price payload as auto route, but only matches Event.prefId (primary ticketing catalogue). Stores catalogueSource PRIMARY_PREF.",
      sampleCurl: [
        `curl -sS "${baseUrl}/api/webhooks/event-category-prices-pref"`,
        `curl -sS -X POST "${baseUrl}/api/webhooks/event-category-prices-pref?prefId=PRIMARY_PREF_ID" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  --data-binary @category-prices.json`,
      ],
    },
    {
      title: "Category block prices (resale pref only)",
      path: "/api/webhooks/event-category-prices-resale",
      methods: ["GET", "POST"],
      queryParams: [
        { name: "resalePrefId", required: false, notes: "Alias: prefId" },
        { name: "prefId", required: false, notes: "Alias for resalePrefId" },
        {
          name: "amountUnit",
          required: false,
          notes: 'Omit or "cents" (default). Use amountUnit=usd if JSON amounts are dollars.',
        },
      ],
      notes:
        "Same price payload as auto route, but only matches Event.resalePrefId (resale catalogue). Stores catalogueSource RESELL_PREF.",
      sampleCurl: [
        `curl -sS "${baseUrl}/api/webhooks/event-category-prices-resale"`,
        `curl -sS -X POST "${baseUrl}/api/webhooks/event-category-prices-resale?resalePrefId=RESALE_PREF_ID" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  --data-binary @category-prices.json`,
      ],
    },
  ];

  const endpoints: EndpointItem[] = [
    {
      title: "Next resale pref (rotation cursor)",
      path: "/api/resale-pref/next",
      methods: ["GET"],
      queryParams: [{ name: "secret", required: false, notes: "Optional (required only if RESALE_PREF_ROTATION_SECRET is set)" }],
      notes:
        "Returns the next distinct Event.resalePrefId in stable order. Persists a cursor in DB so each call advances. If RESALE_PREF_ROTATION_SECRET is set, requires Authorization: Bearer <secret> or ?secret=<secret>.",
      sampleCurl: [
        `curl -sS "${baseUrl}/api/resale-pref/next"`,
        `curl -sS "${baseUrl}/api/resale-pref/next?secret=YOUR_SECRET"`,
        `curl -sS "${baseUrl}/api/resale-pref/next" -H "Authorization: Bearer YOUR_SECRET"`,
      ],
    },
    {
      title: "Undetectable API (status)",
      path: "/api/undetectable/status",
      methods: ["GET"],
      queryParams: [
        {
          name: "secret",
          required: false,
          notes: "Optional (required only if UNDETECTABLE_API_SECRET is set)",
        },
      ],
      notes:
        "Proxy wrapper for the local Undetectable API /status endpoint. Uses UNDETECTABLE_API_BASE_URL (default http://127.0.0.1:25325). Returns the upstream { code, status, data } envelope.",
      sampleCurl: [
        `curl -sS "${baseUrl}/api/undetectable/status"`,
        `curl -sS "${baseUrl}/api/undetectable/status?secret=YOUR_SECRET"`,
        `curl -sS "${baseUrl}/api/undetectable/status" -H "Authorization: Bearer YOUR_SECRET"`,
      ],
    },
    {
      title: "Undetectable API (list profiles)",
      path: "/api/undetectable/profiles",
      methods: ["GET"],
      queryParams: [
        {
          name: "secret",
          required: false,
          notes: "Optional (required only if UNDETECTABLE_API_SECRET is set)",
        },
      ],
      notes:
        "Proxy wrapper for the local Undetectable API /list endpoint. Response data is a map of { profileId: { name, status, debug_port, websocket_link, ... } }.",
      sampleCurl: [
        `curl -sS "${baseUrl}/api/undetectable/profiles"`,
        `curl -sS "${baseUrl}/api/undetectable/profiles?secret=YOUR_SECRET"`,
      ],
    },
    {
      title: "Undetectable API (get profile)",
      path: "/api/undetectable/profiles/PROFILE_ID",
      methods: ["GET"],
      queryParams: [
        {
          name: "secret",
          required: false,
          notes: "Optional (required only if UNDETECTABLE_API_SECRET is set)",
        },
      ],
      notes:
        "Returns a single profile summary by id (includes status, debug_port, websocket_link, tags, folder).",
      sampleCurl: [
        `curl -sS "${baseUrl}/api/undetectable/profiles/PROFILE_ID"`,
        `curl -sS "${baseUrl}/api/undetectable/profiles/PROFILE_ID?secret=YOUR_SECRET"`,
      ],
    },
    {
      title: "Undetectable API (create profile)",
      path: "/api/undetectable/profiles/create",
      methods: ["POST"],
      queryParams: [
        {
          name: "secret",
          required: false,
          notes: "Optional (required only if UNDETECTABLE_API_SECRET is set)",
        },
      ],
      notes:
        "Proxy wrapper for the local Undetectable API /profile/create endpoint. Body is a JSON object (all fields optional) like { name, os, browser, tags, proxy, folder, timezone, ... }.",
      sampleCurl: [
        `curl -sS -X POST "${baseUrl}/api/undetectable/profiles/create" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  --data-binary '{"name":"My Profile","os":"Windows","browser":"Chrome","tags":["eventdetail"]}'`,
      ],
    },
    {
      title: "Undetectable API (start profile)",
      path: "/api/undetectable/profiles/PROFILE_ID/start",
      methods: ["POST"],
      queryParams: [
        {
          name: "secret",
          required: false,
          notes: "Optional (required only if UNDETECTABLE_API_SECRET is set)",
        },
        {
          name: "chrome_flags",
          required: false,
          notes: "Launch flags (URL-encoded by curl automatically). Forwarded to Undetectable /profile/start/{id}.",
        },
        {
          name: "start-pages",
          required: false,
          notes: "Comma-separated URLs for initial tabs. Forwarded to Undetectable /profile/start/{id}.",
        },
      ],
      notes:
        "Starts a profile by id and returns websocket_link + debug_port (Chromium only). You can pass chrome_flags/start-pages as query params, or as JSON in the POST body (chrome_flags / chromeFlags, start_pages / startPages).",
      sampleCurl: [
        `curl -sS -X POST "${baseUrl}/api/undetectable/profiles/PROFILE_ID/start?chrome_flags=--headless%3Dnew&start-pages=https%3A%2F%2Fgoogle.com"`,
        `curl -sS -X POST "${baseUrl}/api/undetectable/profiles/PROFILE_ID/start" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  --data-binary '{"chrome_flags":"--headless=new","start_pages":["https://google.com","https://undetectable.io"]}'`,
      ],
    },
    {
      title: "Undetectable API (stop profile)",
      path: "/api/undetectable/profiles/PROFILE_ID/stop",
      methods: ["POST"],
      queryParams: [
        {
          name: "secret",
          required: false,
          notes: "Optional (required only if UNDETECTABLE_API_SECRET is set)",
        },
      ],
      notes:
        "Stops a profile by id (proxy wrapper around Undetectable /profile/stop/{id}).",
      sampleCurl: [
        `curl -sS -X POST "${baseUrl}/api/undetectable/profiles/PROFILE_ID/stop"`,
      ],
    },
    {
      title: "DB connectivity (dev only)",
      path: "/api/health-db",
      methods: ["GET"],
      queryParams: [],
      notes:
        "Development helper to confirm DATABASE_URL + Postgres auth. Returns 404 in production.",
      sampleCurl: [`curl -sS "${baseUrl}/api/health-db"`],
    },
    {
      title: "Log out (session cookie)",
      path: "/api/logout",
      methods: ["POST"],
      queryParams: [],
      notes:
        "Clears the session cookie (used by the auth proxy/session flow). In the UI, the layout uses a server action for logout; this is the underlying API route.",
      sampleCurl: [`curl -sS -X POST "${baseUrl}/api/logout"`],
    },
  ];

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
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Settings
                </p>
                <h1 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-[2.125rem] sm:leading-tight">
                  Webhooks &amp; endpoints
                </h1>
                <p className="max-w-2xl text-pretty text-sm leading-relaxed text-zinc-400">
                  Quick reference for the app’s inbound webhooks and helper API routes (methods, query params, and copy-paste{" "}
                  <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11px] text-zinc-300">curl</code>{" "}
                  examples).
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href="/"
                  className="rounded-md bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.12]"
                >
                  Back to schedule
                </Link>
                <Link
                  href="/undetectable"
                  className="rounded-md bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-100 ring-1 ring-white/10 hover:bg-sky-500/20"
                >
                  Undetectable
                </Link>
              </div>
            </div>

            <div
              className="mt-6 h-px w-full bg-gradient-to-r from-[color:color-mix(in_oklab,var(--ticketing-accent)_40%,transparent)] via-white/[0.12] to-transparent"
              aria-hidden
            />
          </header>

          <div className="border-t border-white/[0.06] px-4 pb-6 pt-5 sm:px-8 sm:pb-8">
            <section className="space-y-10">
              {showBoxofficeSection ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Local BoxOffice WebSocket (Chrome extension)
                    </h2>
                    <p className="text-xs leading-relaxed text-zinc-500">
                      Dev-only local server for generic start/stop broadcast messages and extension status reporting. Token auth
                      is{" "}
                      <span className="font-medium text-zinc-300">
                        {boxofficeTokenEnabled ? "ON" : "OFF"}
                      </span>
                      .
                    </p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <article className="overflow-hidden rounded-xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_55%,transparent)] ring-1 ring-white/[0.04]">
                      <div className="border-b border-white/[0.06] px-4 py-4 sm:px-5">
                        <p className="text-sm font-semibold tracking-tight text-white">WebSocket URL</p>
                        <p className="mt-1 text-xs text-zinc-400">Paste this into the extension.</p>
                      </div>
                      <div className="space-y-3 px-4 py-4 sm:px-5">
                        <pre className="overflow-auto rounded-lg border border-white/[0.08] bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-zinc-200">
                          {boxofficeWsUrl}
                        </pre>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            First message (only if token enabled)
                          </p>
                          <pre className="mt-2 overflow-auto rounded-lg border border-white/[0.08] bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-zinc-200">
                            {`{"type":"boxoffice-auth","token":"$BOXOFFICE_WS_TOKEN"}`}
                          </pre>
                        </div>
                      </div>
                    </article>

                    <article className="overflow-hidden rounded-xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_55%,transparent)] ring-1 ring-white/[0.04]">
                      <div className="border-b border-white/[0.06] px-4 py-4 sm:px-5">
                        <p className="text-sm font-semibold tracking-tight text-white">HTTP helpers</p>
                        <p className="mt-1 text-xs text-zinc-400">
                          Broadcast start/stop and read latest extension status (recommended: via this app’s proxy routes).
                        </p>
                      </div>
                      <div className="space-y-4 px-4 py-4 sm:px-5">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            Status (proxy)
                          </p>
                          <pre className="mt-2 overflow-auto rounded-lg border border-white/[0.08] bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-zinc-200">{`curl -sS "${boxofficeProxyStatusUrl}"`}</pre>
                        </div>

                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            Broadcast start (proxy)
                          </p>
                          <pre className="mt-2 overflow-auto rounded-lg border border-white/[0.08] bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-zinc-200">{`curl -sS -X POST "${boxofficeProxyBroadcastUrl}" \\
  -H "Content-Type: application/json" \\
  --data-binary '{"action":"start"}'`}</pre>
                          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                            The proxy attaches{" "}
                            <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11px] text-zinc-300">
                              BOXOFFICE_WS_TOKEN
                            </code>{" "}
                            server-side (if configured), so browsers don’t need to call the WS server directly.
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            Broadcast stop (proxy)
                          </p>
                          <pre className="mt-2 overflow-auto rounded-lg border border-white/[0.08] bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-zinc-200">{`curl -sS -X POST "${boxofficeProxyBroadcastUrl}" \\
  -H "Content-Type: application/json" \\
  --data-binary '{"action":"stop"}'`}</pre>
                        </div>

                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            Direct (debug)
                          </p>
                          <pre className="mt-2 overflow-auto rounded-lg border border-white/[0.08] bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-zinc-200">{`curl -sS "${boxofficeHttpUrl}/status"`}</pre>
                        </div>
                      </div>
                    </article>
                  </div>
                </div>
              ) : null}

              <div className="space-y-4">
                <div className="space-y-1">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Webhook endpoints
                  </h2>
                  <p className="text-xs leading-relaxed text-zinc-500">
                    Most webhook routes expose a <span className="font-medium text-zinc-300">GET</span> that returns machine-readable usage docs.
                  </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {webhooks.map((e) => (
                    <article
                      key={e.path}
                      className="overflow-hidden rounded-xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_55%,transparent)] ring-1 ring-white/[0.04]"
                    >
                      <div className="border-b border-white/[0.06] px-4 py-4 sm:px-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold tracking-tight text-white">{e.title}</p>
                            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400">
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                {e.methods.map((m) => (
                                  <span
                                    key={m}
                                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${pillClass(
                                      m,
                                    )}`}
                                  >
                                    {m}
                                  </span>
                                ))}
                              </span>
                              <code className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-zinc-200">
                                {e.path}
                              </code>
                            </p>
                          </div>
                          <Link
                            href={e.path}
                            className="rounded-md bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.10]"
                            title="Open the GET docs for this endpoint"
                          >
                            Open
                          </Link>
                        </div>
                      </div>

                      <div className="space-y-4 px-4 py-4 sm:px-5">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            Query params
                          </p>
                          <div className="mt-2">{renderQueryParams(e.queryParams)}</div>
                        </div>

                        <p className="text-sm leading-relaxed text-zinc-400">{e.notes}</p>

                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            Sample curl
                          </p>
                          <pre className="mt-2 overflow-auto rounded-lg border border-white/[0.08] bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-zinc-200">
                            {e.sampleCurl.join("\n")}
                          </pre>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Other useful endpoints
                  </h2>
                  <p className="text-xs leading-relaxed text-zinc-500">
                    Operational helpers and session endpoints.
                  </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {endpoints.map((e) => (
                    <article
                      key={e.path}
                      className="overflow-hidden rounded-xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_55%,transparent)] ring-1 ring-white/[0.04]"
                    >
                      <div className="border-b border-white/[0.06] px-4 py-4 sm:px-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold tracking-tight text-white">{e.title}</p>
                            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400">
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                {e.methods.map((m) => (
                                  <span
                                    key={m}
                                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${pillClass(
                                      m,
                                    )}`}
                                  >
                                    {m}
                                  </span>
                                ))}
                              </span>
                              <code className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-zinc-200">
                                {e.path}
                              </code>
                            </p>
                          </div>
                          <Link
                            href={e.path}
                            className="rounded-md bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.10]"
                          >
                            Open
                          </Link>
                        </div>
                      </div>

                      <div className="space-y-4 px-4 py-4 sm:px-5">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            Query params
                          </p>
                          <div className="mt-2">{renderQueryParams(e.queryParams)}</div>
                        </div>

                        <p className="text-sm leading-relaxed text-zinc-400">{e.notes}</p>

                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            Sample curl
                          </p>
                          <pre className="mt-2 overflow-auto rounded-lg border border-white/[0.08] bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-zinc-200">
                            {e.sampleCurl.join("\n")}
                          </pre>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

