# riff-habits — Declare

riff; builder claude-opus-5-5, person claude-opus-5-5; 387c78f2 A drag's edge scrolling works under a finger; drive.traceInput (GitHub); evals/, docs/system-design/, test/ removed
Started 2026-10-29T01:55:14.427Z, ended 2026-10-29T02:16:09.517Z (20m 55s).

Totals — agent: 18m 33s, 237k fresh in · 17.11M cached re-read · 85k out · 102 calls. Person: 1m 52s, 35k fresh in · 510k cached re-read · 7k out · 27 calls.

## Requests

0. a habit tracker (the opening, already asked)
1. see a streak for each habit — how many days in a row
2. make it feel calmer and nicer to look at — say what about the way it looks now is not calm, from what you see, in your own words
3. I'd mostly use this on my phone, in bed at night — on your phone, at night (use --phone --dark)
4. let me put the habits in my own order
5. marking one done should feel good — a little something when I tap it
6. it should all still be there tomorrow when I open it again

## Turn 1 — request 0

**Person:**

> You have just downloaded the Declare distribution into `declarelang/`. Declare is a UI language not in your training data; that repository is the only source of truth and documents itself. Start at its README.md.
> 
> make me a habit tracker Use Declare.

**While it worked:**

- +26s: Read the language spec, the guide's core chapters, and the to-do app. Now checking a few library names (storage, Sheet, etc.) before planning the habit tracker.
- +1m 40s: Planning done; writing the habit tracker now. Quick check of the Popover pattern first.
- +2m 20s: Writing the program to `my-apps/habits/habits.declare`.
- +4m 22s: Fixing compiler errors one by one; it's past structure checks now.
- +5m 06s: It boots clean on laptop and phone. Taking screenshots to look at it.
- +5m 28s: Looks good. Two fixes: the add sheet overflows on phone, and the date line truncates.
- +5m 44s: Phone views work. Now a behavior check — add, tick, delete, undo — with an assert script.
- +6m 05s: That failure is my assertion's fault: a closed detail no longer exists, so `hidden` can't find it. Switching to checking `openId`.
- +6m 14s: All checks pass on laptop and phone. Formatting, a final look at the desktop add panel in dark mode, then starting the server.
- +6m 26s: Good. Starting the dev server so you can use it.

**Agent** (6m 40s; 46 tool uses (Bash 28, Read 14, Write 2, Edit 2); 141k fresh in · 4.24M cached re-read · 30k out · 38 calls):

> I built the habit tracker in Declare. It's running at **http://127.0.0.1:8200/my-apps/habits/habits.declare**
> 
> **What it does**
> - **Today's progress:** a ring at the top fills as you tick habits off (for example "3/4"), next to the date and how many habits are left for today.
> - **The week:** each habit has dots for the last 7 days, lined up under a day header. Tap a dot to mark that day done or not done, so you can fill in a day you missed. Today's dot has a heavier ring.
> - **Streaks:** each row shows its current streak, like "6 days in a row". A streak doesn't break until a full day has passed, so before you tick today it says "keep it going today".
> - **Opening a habit:** click its name to open it in place. You get the current streak, best streak, last 30 days (e.g. "19/30") and total days done, plus a grid of the last 18–26 weeks. You can also rename it, change its color or delete it there.
> - **Adding:** "New habit" (or press `n`) opens a small form. On a phone it comes up from the bottom of the screen instead.
> - **Deleting:** from the open card, or by right-clicking or long-pressing a row. A message offers Undo, and ⌘Z works too.
> - **Saving:** your habits are saved in the browser and come back when you reload. The first visit shows four sample habits with made-up history so the screen isn't empty.
> - **Phone and dark mode:** on a narrow screen the dots move under the habit name and are sized for a finger. Dark mode follows your system setting.
> 
> **Testing**
> - The program compiles and starts cleanly at both laptop and phone sizes.
> - A test script clicks through the app the way a person would, at both sizes, and all of it passes. It ticks and unticks today, opens and closes a habit, adds "Meditate", checks it was saved, then deletes it and undoes the delete.
> - I also looked at screenshots of the main screen, an open habit, and the add form on laptop and phone, in light and dark.
> 
> **Files**
> - `my-apps/habits/habits.declare`: the whole app.
> - `my-apps/habits/tests/flow.mjs`: the test script. Rerun it with `npx declare-verify my-apps/habits/habits.declare --assert my-apps/habits/tests/flow.mjs`.
> 
> To get it running I had to run `npm install` and `npm run build` in `declarelang/`, because the checking tools weren't built yet.
> 
> **Limitations**
> - Saving only works in a browser. Declare has no built-in storage yet, so the app saves through a small piece of browser-only code, and it wouldn't run in Declare's Mac app.
> - On a phone, the four numbers on an open habit wrap onto two lines (three, then one).
> - Every habit is daily. There are no weekly targets, reminders, or reordering of habits.

**Verdict on request 0: done.** A clean list of habits with a week of tick circles, a progress ring at the top and a 'New habit' button; I added 'Read' and ticked tonight's 'No phone after 10pm' and the ring went to 4/5.
(Person looked for 28s; 5 tool uses (Bash 3, Read 2); 12k fresh in · 45k cached re-read · 1k out · 6 calls.)

## Turn 2 — request 1

**Person:**

> I want to see a streak for each habit, how many days in a row I've kept it up, so it's easy to spot at a glance.

**While it worked:**

- +21s: Now adding a streak badge — a flame and the day count in a fixed column on every row — and turning the line under the name into what to do next.
- +49s: The app is right and my test was wrong: unticking today leaves 5 days, counted back from yesterday, not 6. Correcting the expectation.

**Agent** (1m 12s; 12 tool uses (Read 4, Edit 4, Bash 3, Grep 1); 12k fresh in · 1.24M cached re-read · 6k out · 8 calls):

> Every habit row now has a streak badge: a flame and the number of days in a row. The badges sit in one column at the end of the row's name line, so you can read down the list and compare streaks.
> 
> The badge's style also tells you how the streak stands today:
> - **Filled in the habit's color:** you've already kept it today.
> - **Outlined:** the streak is still going but today isn't ticked yet. It counts back from yesterday, so unticking today on a 6-day streak shows an outlined **5**.
> - **Grey 0:** no streak.
> 
> The badge updates as soon as you tick or untick a dot. The small line under each name, which used to repeat the streak, now says what's next: "Tick today to keep your streak", "Best streak: 12 days", "Your best streak yet" or "Start a new streak today".
> 
> The program still compiles and starts cleanly at laptop and phone sizes. I added checks for the badge to the test script, and all 25 checks pass at both sizes. They cover the sample numbers (6, 12 and 0), unticking today (the badge drops to an outlined 5), and a new 1-day streak after ticking today on a habit with none. I also looked at screenshots on laptop in light mode and on phone in dark mode.
> 
> The changes are in `my-apps/habits/habits.declare` and `my-apps/habits/tests/flow.mjs`. The dev server is still running, so just reload **http://127.0.0.1:8200/my-apps/habits/habits.declare**.

**Verdict on request 1: done.** Every row has a flame badge with the number of days in a row (6, 3, 12, 1, 0), right next to the week of circles. The new 'Read' habit shows a grey 0.
(Person looked for 11s; 2 tool uses (Bash 1, Read 1); 3k fresh in · 38k cached re-read · 721 out · 3 calls.)

## Turn 3 — request 2

**Person:**

> Can you make it feel calmer and nicer to look at? Right now it's a lot of loud colours all at once (bright blue, orange, green, purple, red), with filled circles and coloured badges everywhere. Every row is its own boxed card, so the whole thing feels busy, like a dashboard.

**While it worked:**

- +1m 40s: Much calmer. One fix: in light mode the rings for days not yet done are almost invisible. I'm giving them their own slightly stronger color.

**Agent** (2m 00s; 11 tool uses (Read 7, Bash 4); 23k fresh in · 1.55M cached re-read · 11k out · 9 calls):

> The tracker is calmer now. Reload **http://127.0.0.1:8200/my-apps/habits/habits.declare** to see it. All the checks still pass at laptop and phone sizes, and I looked at it in light and dark.
> 
> **What changed**
> - **Colors:** the bright blue, orange, green, purple and red are replaced by soft muted shades: sage, slate, clay, lavender, rose, sea and ochre. Habits you already have keep their color slot and simply show the softer version. The page is a warm off-white, and the one accent color is a muted green.
> - **No more cards:** the habits are now one list separated by thin lines, with no boxes, borders or white panels.
> - **Days:** a done day is a small soft dot in the habit's color, with no checkmark. A day not done yet is a thin ring, and today's ring is a shade darker. The day header above them is smaller and grey.
> - **Streaks:** the colored pill is gone. Each row shows a small flame and the number, still in one column down the right so you can compare at a glance. The flame takes the habit's color only once today is done; otherwise it stays grey.
> - **Header:** "Habits" is in a serif font, the progress ring is thinner, and "New habit" is a plain button instead of a solid colored one.
> - **Text:** the type is lighter weight overall. Status lines and the date are a soft grey, and the numbers on an open habit are in the normal text color instead of the habit's color.
> 
> After the first pass, the rings for days not yet done were almost invisible in light mode, so I made them a little darker.
> 
> All the changes are in `my-apps/habits/habits.declare`, mostly in the two color themes and the parts that draw the days, the streak and each row.

**Verdict on request 2: done.** Soft muted colours on a warm off-white page, one plain list with thin lines instead of boxes, soft dots for done days and a quiet serif title. It feels much gentler.
(Person looked for 9s; 2 tool uses (Bash 1, Read 1); 3k fresh in · 46k cached re-read · 576 out · 3 calls.)

## Turn 4 — request 3

**Person:**

> Honestly I'd mostly use this on my phone, in bed at night. Can you make it work well for that?

**While it worked:**

- +31s: Now I'll make the changes. Night is when the hour is 21:00 or later, or before 6:00.
- +52s: Now the bottom "New habit" button for the phone and the Day/Night/Auto switch.
- +1m 17s: Passing at both sizes. Now looking at it on a phone, at night.
- +1m 30s: Two details to fix. The selected button in the Day/Night/Auto switch is a cool blue that clashes with the warm colors, and the stats on an open habit wrap 3-and-1 on the phone.
- +1m 52s: Phone looks right. One last look at the desktop in Day mode to make sure nothing there broke.
- +2m 00s: Desktop is unchanged apart from the new switch. One practical thing to check: whether your phone can reach the dev server at all.

**Agent** (2m 18s; 17 tool uses (Bash 10, Read 6, Grep 1); 17k fresh in · 3.12M cached re-read · 10k out · 16 calls):

> I've reworked the tracker for using it on your phone in bed at night. All the checks pass at laptop and phone sizes, and I looked at each new phone screen in Night mode.
> 
> - **Night mode:** an almost-black, warm screen with soft off-white text instead of white, and dimmer habit colors so a row of done days doesn't glow.
> - **It switches by itself:** on Auto (the default), the app goes to Night from 9pm to 6am, and any time your phone is in dark mode.
> - **Manual switch:** a small Day / Night / Auto switch sits at the bottom of the list. Your choice is remembered.
> - **Late-night ticks count for the day you're finishing:** a habit "day" now runs from 4am to 4am. If you tick something at 12:30am, it counts for the day that just ended rather than starting tomorrow.
> - **Adding with your thumb:** on the phone, the "New habit" button is now at the bottom of the screen, above the home bar. It moves up when the Undo message shows, and the add form slides up from the bottom. On a laptop the button stays in the header.
> - **Readability:** habit names and status lines are a little larger on the phone. Day dots are still finger-sized.
> - **Open habit:** on the phone, the four numbers now sit in a tidy two-by-two grid instead of wrapping three-and-one.
> 
> The tests now also cover adding from the bottom button on the phone, and switching to Night and back to Day, including that the choice is saved. They can't change the time of day, though, so the 4am cut-off and the 9pm switch to Night haven't been checked against a real clock.
> 
> **Opening it on your phone:** the dev server only listens on this computer, so your phone can't reach it yet. I haven't changed that, because it would make the server visible to every device on your network. If you're OK with that, restart it with `HOST=0.0.0.0 npm start` and open `http://<your-computer's-IP>:8200/my-apps/habits/habits.declare` on your phone. Use the same Wi-Fi network on both.
> 
> Your habits are saved separately on each device, in that browser, so the phone won't see what you've ticked on the laptop.
> 
> All changes are in `my-apps/habits/habits.declare` and `my-apps/habits/tests/flow.mjs`.

**Verdict on request 3: done.** On the phone in the dark, the screen is a soft warm black with dim colours, the dots are big and easy to tap, and ticking 'Read' turned its dot pink and its streak to 1. The 'New habit' button sits at the bottom where my thumb is. Before I scroll it covers part of the day/night switch, but after scrolling both are clear.
(Person looked for 19s; 4 tool uses (Bash 2, Read 2); 6k fresh in · 98k cached re-read · 1k out · 5 calls.)

## Turn 5 — request 4

**Person:**

> I'd like to put the habits in my own order. Morning stretch should be first, and No phone after 10pm last.

**While it worked:**

- +1m 07s: Adding drag-to-reorder now: a grip handle on each row, plus Move up/down in the long-press menu.
- +1m 41s: Drag works in the tests on laptop and phone. Now a picture of a row mid-drag on the phone at night, to check how the lifted row looks.

**Agent** (1m 57s; 10 tool uses (Bash 8, Read 2); 16k fresh in · 2.09M cached re-read · 9k out · 10 calls):

> You can now put your habits in any order by dragging. The order is saved in the browser, so it stays after a reload.
> 
> - **Dragging:** each habit has a small six-dot handle at the left of its name, in the habit's color (it replaces the little color dot). Press it and drag up or down. The habit lifts slightly while you move it, and moves one place each time your finger passes about half a row.
> - **Scrolling still works:** only the handle grabs your finger, so swiping anywhere else on the row scrolls the page as before.
> - **Menu:** long-press a habit on the phone (or right-click it on a laptop) for **Move up** and **Move down**. They're greyed out at the top and bottom of the list.
> 
> **For your order:** drag Morning stretch's handle up to the top. "No phone after 10pm" is already last in the sample list, so it should end up where you want it. If you've rearranged or added habits, drag it to the bottom the same way.
> 
> The checks still pass at laptop and phone sizes, and the test script now covers reordering. It drags Morning stretch from third to first and checks the saved order, then drags it down one place and back up. I also looked at a habit mid-drag and just after dropping it on the phone at night.
> 
> The habit you're dragging steps from slot to slot rather than sliding smoothly under your finger. Declare has no way to shift a row in a list a few pixels at a time, so a smooth glide would need a custom layout.
> 
> The changes are in `my-apps/habits/habits.declare` and `my-apps/habits/tests/flow.mjs`.

**Verdict on request 4: done.** Dragging the little dotted handle on my phone moved Morning stretch to the top and No phone after 10pm to the bottom. The new order was still there after I reloaded.
(Person looked for 21s; 3 tool uses (Bash 2, Read 1); 4k fresh in · 98k cached re-read · 1k out · 4 calls.)

## Turn 6 — request 5

**Person:**

> When I mark one done it should feel good. I'd like a little something when I tap it, right now the dot just quietly fills in.

**While it worked:**

- +1m 15s: Checks pass. The tests don't show whether the animations actually play, though, so I'll catch them mid-motion and check that nothing fires on page load.
- +1m 46s: That failure is the test's fault: it checks for "nothing at load" after an earlier step has already re-ticked a day. Moving that check to the start.
- +2m 09s: Everything fires on the tap: the ring blooms and shows a check, and the flame swells. The ripple around the dot fades too fast to really register, so I'm making it linger a little longer.
- +2m 22s: The ripple and specks show clearly now, and they're gone again within a second. Running the full checks once more.

**Agent** (2m 38s; 15 tool uses (Bash 11, Read 4); 18k fresh in · 3.19M cached re-read · 12k out · 14 calls):

> Marking a habit done now has a small moment of reward, kept soft to match the calm look:
> 
> - **The dot pops.** It bounces in slightly past full size and settles. A thin ring and six small specks in the habit's color spread out from it and fade within about a second.
> - **The phone gives a light tap.** This works on Android; iPhone browsers don't allow websites to vibrate the phone, so on iPhone you'll only get the visual.
> - **The streak flame swells.** When you tick today, the flame and its number briefly grow and settle, as the streak goes up.
> - **Finishing the day is a bigger moment.** When you tick the last habit left for today, a soft halo opens out from the progress ring, "4/4" turns into a check, and the line under the title says "Everything done today. Nice."
> - **Unticking stays quiet.** The dot just fades away.
> 
> If your phone is set to reduce motion, the ripple, flame and halo are skipped. You still get the light tap and the dot filling in.
> 
> Marking a habit from the long-press menu ("Mark today done") counts it but doesn't play any of this; only tapping the dot does.
> 
> The checks still pass at laptop and phone sizes. The test script now confirms that nothing plays when the page loads, and that tapping the last habit for today starts the dot's ripple, the flame swell and the ring's halo. I also caught the ripple, the halo and the check mid-animation in screenshots on the phone in Night mode.
> 
> Reload the page to try it. The changes are in `my-apps/habits/habits.declare` and `my-apps/habits/tests/flow.mjs`.

**Verdict on request 5: done.** When I ticked 'Read' again, a soft ring spread out around the dot and a glow opened around the top circle as it turned into a check. A second later it had all settled down quietly.
(Person looked for 16s; 3 tool uses (Read 2, Bash 1); 5k fresh in · 84k cached re-read · 1k out · 3 calls.)

## Turn 7 — request 6

**Person:**

> Last thing: it should all still be there tomorrow when I open it again, my habits, my order and what I ticked.

**While it worked:**

- +12s: Your habits, their order, what you've ticked and the appearance setting are already saved in the browser on every change. Before calling it done I want to prove it with a real reload, and with a simulated "next day". I'm also making saving more robust where it can fail.
- +50s: Now the real test: a separate script that makes changes, reloads the page, and then reloads again with the clock moved forward one day.

**Agent** (1m 48s; 6 tool uses (Bash 5, Write 1); 10k fresh in · 1.68M cached re-read · 8k out · 7 calls):

> Yes. Your habits, their order, every tick, names, colors and the Day/Night setting all save the moment you change them, and come back when you open the app again. I tested that with real page reloads, including one with the clock moved a day forward.
> 
> **What the test does** (new script `my-apps/habits/tests/tomorrow.mjs`)
> - It moves Morning stretch to the top, ticks today on "No phone", unticks an earlier day, adds "Meditate", renames and recolors a habit, and switches to Night.
> - **Reopened:** after a reload, all of it is exactly as it was.
> - **Reopened tomorrow:** after another reload with the clock a day ahead, everything is still the same. Yesterday's tick has moved into yesterday's column. "No phone" still shows a 1-day streak with "Tick today to keep your streak".
> 
> Both test scripts pass at laptop and phone sizes.
> 
> **What I changed to make saving more reliable**
> - **The sample saves on your first visit.** Before, it was made up fresh each day until you changed something.
> - **Saved data that can't be read is kept aside.** The app starts with the sample, and your old data is never overwritten.
> - **The browser is asked to keep the app's storage** rather than clear it when space runs low. It may say no.
> - **You're told if saving fails.** In a private window, for example, a red line under the title says your changes won't be there tomorrow. The test checks this by making the browser refuse to save.
> 
> **Things that can still make your habits look gone** (all browser rules, not the app):
> - **The address must stay the same.** Your habits are tied to the exact address you open, so `127.0.0.1:8200` on this computer and `192.168.x.x:8200` on your phone each have their own separate copy. If your computer's network address changes, the phone will open an empty-looking app. Your data isn't lost, it's just stored under the old address. Bookmarking or adding to the Home Screen doesn't fix this, because the bookmark keeps the same address.
> - **Each browser and device keeps its own copy.** Nothing syncs between your laptop and your phone.
> - **Private windows don't keep anything.** You'll see the red warning there.
> - **Safari may clear it after a long break.** If you don't open the site for about a week, Safari can delete its stored data. Using it daily is fine.
> 
> If you'd like protection against those, I can add an export/import backup (a small file you save and can load back), or move saving to a small server so phone and laptop share one copy. Just say which.

**Verdict on request 6: done.** When I opened it again, my own order was there (Morning stretch first, No phone after 10pm last). So was the 'Read' habit I added, and today's ticks were still in, all done.
(Person looked for 8s; 1 tool uses (Bash 1); 2k fresh in · 66k cached re-read · 495 out · 2 calls.)

## Final verdicts

- 0. a habit tracker (the opening, already asked) — **done**: A working habit tracker: I could add habits and tick days off, with a progress ring at the top.
- 1. see a streak for each habit — how many days in a row — **done**: Every habit shows its streak, a flame and the number of days in a row, and it updates as soon as I tick.
- 2. make it feel calmer and nicer to look at — say what about the way it looks now is not calm, from what you see, in your own words — **done**: The loud colours and boxed cards are gone. It's now soft muted colours on a warm background, one simple list with thin lines.
- 3. I'd mostly use this on my phone, in bed at night — **done**: On my phone at night the screen is a soft dark one with big dots that are easy to tap, and the add button is at the bottom. Before I scroll, that button covers part of the day/night switch.
- 4. let me put the habits in my own order — **done**: I dragged the habits into my own order, and it stayed that way after reloading.
- 5. marking one done should feel good — a little something when I tap it — **done**: Ticking a habit gives a soft ripple around the dot, and finishing the day gives a glow and a check at the top.
- 6. it should all still be there tomorrow when I open it again — **done**: When I reopened it, my habits, my order and my ticks were all still there.

> It went really well: every time, I got what I asked for, and it ended up calm and nice to use in bed. The only small thing is the add button sitting on top of the day/night switch on my phone before I scroll.
