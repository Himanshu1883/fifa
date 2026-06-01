# SeatsBrokers sandbox — Postman

## Import

1. Open Postman → **Import** → select `SeatsBrokers-Sandbox.postman_collection.json`.
2. Open the collection → **Variables** tab.
3. Set **Current value** for `apiKey` (same as `SEATS_BROKERS_API_KEY` in `.env.local`).
4. Save.

## Run order

| # | Request | Notes |
|---|---------|--------|
| 1 | Get tournaments | Expect `status: 1`, `result[]` with tournament ids |
| 2 | List events | Set `tournamentId` (e.g. `1`); copy a match id → `matchId` |
| 3 | List tickets | Needs `matchId` |
| 4 | Ticket dropdown | Optional; helps fill create-ticket fields |
| 5 | Create ticket | **Live write** — use sandbox only |

## Important

- **Auth**: header `apiKey: <your-key>` (inherited from collection).
- **Body**: `form-data` only — not raw JSON.
- **Base URL**: `https://sandbox-sellerapi.seatsbrokers.com/api` (no trailing slash required; Postman paths append `/tournament`, etc.).
- If you see **522 HTML**, the sandbox origin is down — retry later.

## Test via your FIFA app (proxy)

Same API, easier env handling:

```bash
curl -sS "http://localhost:3000/api/seatsbrokers/status" | python3 -m json.tool
curl -sS "http://localhost:3000/api/seatsbrokers/events?tournamentId=1" | python3 -m json.tool
```

Or run `./scripts/test-apis.sh`.
