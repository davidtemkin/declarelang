Cadence is built as a single file at `declarelang/my-apps/cadence.declare` (about 1,300 lines). It passes the checker through rung 4, and I tested it in headless Chrome at 360, 390, 820 and 1440 px wide.

**One thing to check before you open it:** whatever is running on port 8200 right now is serving a different checkout (`/Users/temkin/Code/Declare`), not this `declarelang/` folder. So the URL in the brief won't find this file until you run `npm start` from `declarelang/`. I tested on my own server on port 8201 and have stopped it.

**What's on screen**
- **Today:** "4 sessions · 4h 11m" and "2 days" (or "no streak") in very large type, with the words set small. Below that are the week's shape as seven bars and the last session. The session in progress is the only dark block on the page: its clock ticks, and its dot pulses at the reported heart rate.
- **The year:** one surface covering all fourteen months. It follows the finger mid-drag and mid-pinch, with no lag. On desktop you can scroll sideways, scroll or trackpad-pinch to zoom, and use the arrow and +/− keys. Zoomed out, weekly volume shows in the background and fades as you zoom in; zoomed in, each bar gets its sport and duration. Above it are the date range on screen and its totals, and below it the list of sessions in that range.
- **A session:** the effort figure is the biggest thing, drawn in its effort colour, so a hard one looks hard. It also shows duration, distance, heart rate, pace, the note, and where the session sits against everything else, in a sentence and a small chart. Edit and a two-tap Delete are at the bottom.
- **Adding one:** every field starts filled in with the likely answer. Sport, date, duration, distance and effort are all taps or ± buttons; only the note uses the keyboard. The Save button says exactly what it will save. On desktop the same sheet takes keys: N opens it, R/B/L/S picks the sport, the arrows change time and day, 1–0 sets effort, Enter saves.
- **Look:** ink on paper, with one accent that means effort, used everywhere a session is drawn. Two type families: a system sans for figures and a mono for small captions. The only motion is figures moving to new values, sheets sliding in, and the live dot. On first load the numbers just appear rather than counting up.

**Tested with real touch and mouse input**
- **Adding on a phone:** three taps (+, back one day, Save). The week went from 4 sessions · 4h 11m to 5 · 5h 51m straight away.
- **Editing and deleting:** a correction was saved and a delete removed the session, with every figure following.
- **The year surface:** dragging, pinching and a vertical swipe (which still scrolls the page) all work.
- **Cleanup:** my test sessions are deleted, and the service is back to its original 248.

**Choices I made where the brief was open**
- **"This week" is the last 7 days, not Monday to today.** Your Monday-morning scenario only works that way; on a Monday a calendar week would be empty. The caption says "last 7 days".
- **The streak counts from today, or from yesterday if nothing is logged yet today.** A session in progress doesn't count until it's saved.
- **The default sport is a guess by weekday, not by hour.** Sessions have no time of day, so "the sport they always do at this hour" isn't possible. It uses what they usually do on this weekday, then what they've done recently. The default duration and effort come from their recent sessions in that sport, and distance from their usual pace.
- **Exact hours read "3h", not "3h 0m".**

**Not verified:** gesture handling on a real phone, which the brief says headless Chrome can't reproduce, and how the app behaves when the service is unreachable. If the first load fails, the screen stays empty with no error.