#!/bin/sh
# Venue run 33 audit: every repro, against the local tree. Run from anywhere.
# Each line says what it shows and what to expect today.
cd "$(dirname "$0")/../../../.." || exit 1          # ~/Code/Declare
A=evals/reports/2026-11-12-venue-run33-local/audit
V="npx declare-verify"

echo "== P1 schema :path check: inline is checked (expect DECLARE2000 'priceCents' not in the schema)"
$V $A/shadow-inline.declare --no-boot 2>&1 | sed -n 2p
echo "== P1a the agent's form: rows inside a CLASS whose datapath is set at the use site (expect: refused; today: clean)"
$V $A/shadow-class.declare 2>&1 | grep "verify:"
echo "== P1b schema declared on a class extending Dataset (expect: refused; today: clean). Control: on the instance, refused"
$V $A/schema-in-class.declare --no-boot 2>&1 | grep "verify:"
$V $A/schema-on-instance.declare --no-boot 2>&1 | sed -n 2p
echo "== P1c a class body whose cursor is { app.plan.value } (expect: refused; today: clean)"
$V $A/app-cursor-in-class.declare --no-boot 2>&1 | grep "verify:"

echo "== T1 locator press refuses a field the pinned bar covers; Tab (the platform's reveal) lands it clear"
$V $A/dock-cover.declare --assert $A/dock-press.mjs 2>&1 | grep -A1 "R5"
$V $A/dock-cover.declare --assert $A/dock-tab.mjs 2>&1 | grep FOCUSED

echo "== T2 strictness refusal lists its matches with empty descriptions (<span> \"\", <div> \"\")"
$V $A/toast-two.declare --assert $A/toast-two.mjs 2>&1 | grep -A1 "R5"

echo "== T3 declare-help: camelCase is not split before the concept table"
for q in scrollPadding "scroll padding" scrollMargin "scroll margin" View.focusEntry focusEntry App.phone phone; do
  printf '%-18s → ' "$q"; npx declare-help "$q" 2>&1 | head -1 | cut -c1-110
done

echo "== M1 'computes a this View | undefined'"
$V $A/optional-chain.declare --no-boot 2>&1 | grep "computes"
echo "== M2 'head' is not a member — no word on where a head is"
$V $A/anon-head.declare --no-boot 2>&1 | grep "head"
echo "== M3 one ']' too many: 'expected end of input'"
$V $A/extra-close.declare --no-boot 2>&1 | sed -n 2p

echo "== Aside (not met in the run): Button.press() doc says a click calls it; a click does not"
$V $A/button-press.declare --assert $A/button-press.mjs 2>&1 | grep AFTER
echo "== Design: content-sized text past a fixed-width column (no finding)"
$V $A/text-past-column.declare --phone 2>&1 | grep "verify:"

echo "== First boot: the hidden drive, as served, and with only the section fix (fb-fixed/)"
echo "   node evals/apps/venue/drive.mjs http://127.0.0.1:8290/my-apps/venue-run33-fb/venue.declare            # 1 of 11"
echo "   node evals/apps/venue/drive.mjs http://127.0.0.1:8290/$A/fb-fixed/venue.declare  # 11 of 11"
echo "   node $A/axdump.mjs <url>   # the seat names in the accessibility tree"
