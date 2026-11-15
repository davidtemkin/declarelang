#!/bin/sh
# Runs every flow against the Ledger service (port 8370) through the dev server.
#   my-apps/ledger/tests/run-all.sh [dev-server-address]
# Run it from the repository root. The service remembers what the flows write.
URL="${1:-http://127.0.0.1:8200}/my-apps/ledger/ledger.declare"
cd "$(dirname "$0")/../../.." || exit 2
status=0
for t in my-apps/ledger/tests/desk-*.mjs my-apps/ledger/tests/phone-*.mjs; do
  printf '%-48s ' "$(basename "$t")"
  if out=$(npx declare-verify my-apps/ledger/ledger.declare --url "$URL" --assert "$t" 2>&1); then
    echo "$out" | grep -E "R5 " | sed 's/^ *//'
  else
    echo "FAILED"; echo "$out" | grep -E "✗|^       " | head -6; status=1
  fi
done
exit $status
