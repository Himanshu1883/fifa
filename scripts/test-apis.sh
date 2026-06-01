#!/usr/bin/env bash
# Quick smoke tests for local FIFA + SeatsBrokers proxy APIs.
# Usage: ./scripts/test-apis.sh [BASE_URL] [EVENT_ID] [MATCH_ID]
# Example: ./scripts/test-apis.sh http://localhost:3000 1 6756

set -euo pipefail

BASE="${1:-http://localhost:3000}"
EVENT_ID="${2:-1}"
MATCH_ID="${3:-}"

echo "Base URL: $BASE"
echo "Event ID: $EVENT_ID"
echo ""

section() { echo ""; echo "======== $1 ========"; }

section "1. SeatsBrokers — connection (tournament)"
curl -sS --max-time 35 "$BASE/api/seatsbrokers/status" | python3 -m json.tool | head -40

section "2. SeatsBrokers — events list"
curl -sS --max-time 35 "$BASE/api/seatsbrokers/events?eventName=test" | python3 -c "
import sys, json
j = json.load(sys.stdin)
print('ok:', j.get('ok'), '| tournamentId:', j.get('tournamentId'), '| matches:', len(j.get('matches') or []))
if j.get('suggested'):
    print('suggested:', j['suggested']['matchId'], '-', j['suggested']['label'][:80])
"

if [[ -n "$MATCH_ID" ]]; then
  section "3. SeatsBrokers — tickets for match_id=$MATCH_ID"
  curl -sS --max-time 35 "$BASE/api/seatsbrokers/status?matchId=$MATCH_ID" | python3 -m json.tool | head -50
  curl -sS --max-time 35 "$BASE/api/seatsbrokers/events?matchId=$MATCH_ID" | python3 -m json.tool | head -50
else
  echo ""
  echo "(Skip match tickets — pass MATCH_ID as 3rd arg, e.g. ./scripts/test-apis.sh $BASE $EVENT_ID 6756)"
fi

section "4. Local — transformed seat offers"
curl -sS --max-time 60 "$BASE/api/events/$EVENT_ID/seat-offers-transformed" | python3 -c "
import sys, json
j = json.load(sys.stdin)
print(json.dumps({
  'ok': j.get('ok'),
  'eventId': j.get('eventId'),
  'eventName': j.get('eventName'),
  'sbEventId': j.get('sbEventId'),
  'offerCount': j.get('offerCount'),
  'markupPercent': j.get('markupPercent'),
  'grandTotals': (j.get('summary') or {}).get('grandTotals'),
}, indent=2))
"

section "5. Push to SeatsBrokers — dry run RESALE only (needs sbEventId on event)"
curl -sS --max-time 90 -X POST "$BASE/api/events/$EVENT_ID/push-to-seatsbrokers?dryRun=1&limit=3&kind=RESALE" | python3 -m json.tool | head -60

echo ""
echo "Done. For live push, remove dryRun=1 (only when sbEventId is set)."
