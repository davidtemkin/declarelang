# Presentify: the three rounds (draft for review)

*For you, not for an agent.* This holds:
- the three briefs, each as an agent would receive it (each round goes to a **fresh agent**, given the code the round
  before left);
- my notes on the document format, the service, how each round is scored, and what is still open.

Nothing here has been built; the service and the hidden drive come after you have reacted to this.

**The scheme in one line:** round 1 builds a desk slide editor against a service that owns the document format.
Round 2 adds rotation and images, uploaded. Round 3 makes it work on tablet and phone. Each round is scored on what
it adds and on not breaking what was there.

---

## Round 1: the brief

# Presentify: a brief

Build a slide editor: the thing a person uses to make a presentation out of slides, shapes and words, and then
give it.

This brief says what should be true for the person using it and how it should feel to handle. It does not say
how to build it. A slide editor is a tool people spend hours in. It has to be quick to aim, never lose work, and
never surprise the hand. This round is for a desk: a mouse or a trackpad, and a keyboard.

Every presentation lives behind a local service described in `api/API.md`. It is already written and already
running, and it defines how a presentation is stored. You never write a server.

---

## 1. Presentations

The person sees their presentations, each with its title, when it was last changed, and a picture of its first
slide. They can open one, start a new one, rename one, and delete one (asked first; nothing is deleted by a
single slip). A new presentation opens straight into editing, with one empty slide.

## 2. Slides

An open presentation shows its slides in order down one side, each as a small, live picture of the slide. The
pictures update as the slide is edited. One slide is the one being edited, shown large.

The person can:
- add a slide after the current one;
- duplicate a slide;
- delete a slide (the last one cannot be deleted);
- reorder slides by dragging them in the list.

The keyboard moves between slides in the list.

A slide is **1280 by 720** points, and keeps that shape however large the window is.

## 3. What goes on a slide

Four kinds of thing:
- rectangles, with square or rounded corners;
- ellipses;
- straight lines;
- text boxes.

Each is drawn by choosing the tool and dragging out its size on the slide. Drawing with shift makes a square or a
circle. A text box can also be made with a single click and starts empty, ready to type in.

Every shape has a fill (or none) and an outline (a colour and a width, or none). A line has only an outline.

A rectangle's corners can be rounded by any radius, from square to fully round ends. The radius is set in the
inspector or by dragging a handle at a corner. It stays the same when the rectangle is resized: a rounded
rectangle made wider keeps its corners, it does not stretch them.

A text box holds one block of text with one style: font, size, weight, italic, colour, and alignment (left,
centre, right). It wraps within its width and grows taller as it fills. Double-clicking a text box edits its
text in place, on the slide. A click elsewhere or Escape ends editing. A text box left empty when editing ends
disappears.

## 4. Selecting and changing

- **Selecting:** a click selects one thing. Shift-click adds or removes one. Dragging on empty slide selects
  everything the box touches. Escape clears the selection.
- **How a selection shows:** handles at its corners and sides, and it is unmistakable on any colour of slide.
- **Moving:** dragging moves the selection. The arrow keys nudge it by one point, by ten with shift.
- **Resizing:** dragging a handle resizes. With shift, it keeps its proportions. A line has a handle at each
  end.
- **Keeping proportions:** anything can be set, in the inspector, to keep its proportions. It then keeps them
  however it is resized, so a square stays square and a circle stays round, without the person holding a key.
  Something drawn with shift starts with this set. Holding shift while resizing something that keeps its
  proportions lets it change them once.
- **Delete, duplicate, copy, paste:** delete removes the selection. Duplicate and copy-and-paste place the copy
  slightly offset, selected. Paste works across slides and across presentations.
- **Groups:** two or more things can be grouped. A group moves, resizes and is selected as one, and is ungrouped
  back into its parts, each where it was. A double-click selects a single thing inside a group.
- **Aligning:** two or more things can be aligned by their left edges, centres, right edges, tops, middles or
  bottoms. Three or more can be distributed evenly, across or down.
- **Order:** things overlap in an order the person controls: bring forward, send backward, bring to front, send
  to back.

## 5. The inspector

Beside the slide, a panel shows the selection's fill, outline and, for text, its style, and changes them. When
the selection's things differ, the panel says so rather than showing one of them as if it were true of all, and
a change applies to all of them. With nothing selected it shows the slide's own background colour.

## 6. Undo

Everything that changes the presentation can be undone and redone, step by step, with the usual keys and from a
menu or a control:
- drawing;
- moving;
- resizing;
- styling;
- typing;
- grouping;
- aligning;
- ordering;
- adding, deleting and reordering slides.

**One step is one thing the person did.** A drag is one step, not one per pointer movement. A run of typing is one
step. A change made in the inspector is one step. Undoing puts the selection back as it was.

## 7. Saving

There is no Save button to forget. Changes reach the service within about two seconds of the last edit, and the
window always says which of these is true, exactly:

> **All changes saved** · **Saving…** · **Not saved: can't reach the service**

A change that can't be saved is kept and tried again, and nothing is lost by it. Command-S saves at once.

Someone else may change the same presentation from another window. When a slide the person is editing was changed
there since it was opened, they are told so in plain words. They are offered that slide as it is now, and their
work is never written over theirs without their say.

## 8. Presenting

Presenting fills the screen with one slide at a time, starting at the current one. The arrow keys, space and a
click move through the slides. Escape ends presenting and returns to the slide the person ended on. The
presentation looks exactly as it does in the editor.

## 9. The bar

Presentify should be good enough that people choose it over the tool they already use. Build it to that standard,
as an exemplar of design and interaction: consumer-grade, polished, with no rough edges.
- **Its own identity.** A wordmark, palette, type and icons that are recognisably Presentify, used consistently from
  the list of presentations down to the smallest handle.
- **Calm and precise, like a good tool.** The slide is the brightest thing on the screen. The controls around it are
  quiet, consistent, and easy to aim at with a pointer.
- **Learned without instructions.** Someone who has used any slide tool can make a three-slide presentation in their
  first minute. Every action can be found on screen, not only through a shortcut.
- **Direct manipulation that feels physical.** Handles are easy to hit, guides and snapping appear while dragging,
  the pointer shows what can be moved or resized, and nothing jumps: a selection's handles stay put while the
  person works, the slide list does not reflow under the pointer during a drag, and the inspector does not change
  shape when the selection does.
- **Every state designed.** An empty presentation, an empty slide, loading, saving, a save that failed or conflicted,
  a very long title, a hundred slides.
- **Keyboard and pointer both first-class,** and everything can be undone.
- **No rough edges.** No clipped text, layout shifts, flicker, unstyled controls or dead ends.

## 10. Labels

Every control says what it does, both to a pointer resting on it and to a screen reader:
- the tools are **Select**, **Rectangle**, **Ellipse**, **Line** and **Text**;
- the slides in the list are **Slide 1**, **Slide 2** and so on, in order;
- the slide being edited is labelled **Slide**, and its edges are the slide's edges: its 1280 × 720 points scale
  evenly to fill it.

Screen-reader access to the things on a slide is not asked for in this round.

## 11. Constraints

- **Desk only** in this round: no phone or tablet layout is asked for.
- **Not in this round:** rotation, images, charts, tables, animations, transitions, speaker notes, comments, sharing
  and accounts.
- **No server of your own.** The format is the service's (`api/API.md`).

## 12. What done looks like

- Someone opens Presentify and starts a new presentation called "Quarterly review".
- On the first slide they draw a dark rectangle across the top and type a title into it in white, centred, 48
  point. Below it they set three text boxes side by side, align their tops and distribute them evenly.
- They group a circle and a label, move the group, and change their mind with undo, twice.
- They duplicate the slide, change the title, drag the copy above the original, and present from the start. The
  arrow keys take them through.
- Meanwhile a colleague edited the second slide in another window. When they return to it, they're told, and
  they choose the colleague's version.
- Every change was saved without their thinking about it.

---

## Delivering it

Write it idiomatically, following the platform's established best practices, as code that other people will read
and maintain: the next person to work on Presentify will start from your code alone. Use the ecosystem's established
libraries where one fits, as a maintainer would expect.

The service runs separately, on port 8360. Check your work in the browser.

---

## Round 2: the brief (to a fresh agent, given round 1's code)

# Presentify, round 2: rotation and images

Presentify is a slide editor that already exists: its code is in `{where round 1 left it}`, and the brief it was
built to is `task/brief-round-1.md`. Everything that brief asks for must keep working. This round adds two things
people ask for first.

The service has a new version, described in `api/API.md`, which says what changed. Presentations saved by the
previous version open unchanged.

## 1. Rotation

Anything on a slide can be turned:
- by a handle above it;
- by typing an angle in the inspector.

With shift, dragging the handle turns in steps of 15°. A rotated thing is selected, moved, resized and hit
exactly where it is drawn:
- its handles turn with it;
- resizing a rotated thing grows it along its own edges, not the slide's;
- the outline that shows the selection turns with it.

A group turns as one, about its centre, and keeps its parts' own angles when ungrouped. Aligning and distributing
use what the person sees: the turned thing's bounds on the slide.

## 2. Images

An image can be put on a slide:
- by choosing a file;
- by dragging one in from the desktop;
- by pasting one copied elsewhere.

It arrives at its own proportions, fitted inside the slide if larger, and centred where it was dropped or, when
inserted, on the slide.

The image is uploaded to the service, and the presentation stores the service's reference to it, never the
picture itself. While it uploads, the slide shows where it will be, and the person can go on working. If the upload
fails, they are told, and nothing half-finished is left on the slide.

An image is selected, moved, resized (keeping its proportions unless the person holds shift), rotated, grouped,
aligned, ordered, copied and undone like anything else. It can have an outline but not a fill.

## 3. How it will be checked

As before, by role and name. **Each image on the slide is named "Image", or by its description** if the person has
given it one in the inspector.

## 4. Constraints

- **Still desk only.**
- **No editing of image pixels:** no cropping, filters or masks.
- **The upload limit is the service's;** a larger file is refused in its words.

## 5. What done looks like

- Someone opens "Quarterly review", drags a photograph onto the title slide, and turns it 8°.
- They rotate the title box to match and group the two. Then they turn the group back by 8° and ungroup it, and
  find the photograph straight again and the title still turned.
- They paste a logo copied from another application into the corner, give it a description, and present.
- Earlier presentations open exactly as they were.

## Delivering it

As round 1. The next person to work on Presentify will start from your code alone.

---

## Round 3: the brief (to a fresh agent, given round 2's code)

# Presentify, round 3: tablet and phone

Presentify is a slide editor that already exists: its code is in `{where round 2 left it}`, and the briefs it was
built to are `task/brief-round-1.md` and `task/brief-round-2.md`. Everything they ask for must keep working on a
desk. This round makes it work on a tablet and a phone, with a finger.

## 1. A tablet, held either way

A tablet is a full editor, for a finger:
- **Selecting and changing:** a tap selects. A drag moves. A handle is easy to catch with a fingertip without
  covering what it changes.
- **Gestures:** two fingers pinch to zoom the slide and turn the selection. A long press offers what a right-click
  would.
- **Text:** editing text brings up the on-screen keyboard without hiding the text being edited.
- **Turning the tablet:** the slide list and the inspector arrange themselves for the screen in either orientation,
  and the slide stays as large as it can.

## 2. A phone, for the small things

On a phone, a person mostly reads, presents, and fixes small things:
- moving through slides;
- presenting;
- correcting a word in a text box;
- nudging something into place;
- changing a colour;
- deleting or reordering slides.

**The slide is the screen.** The slide list becomes something the person brings up when they want it, and so does
the inspector, which must not cover the thing being changed.

**Presenting** works by swiping and tapping, in either orientation.

## 3. Everywhere

- **Undo** works on every device, by a control as well as by keys.
- **The keyboard and the pointer** keep working on a desk exactly as before.

## 4. What done looks like

- **On a tablet,** someone pinches into the title slide, drags the photograph a little to the left, turns it with
  two fingers, and edits the title's last word with the on-screen keyboard.
- **On a phone, the same evening,** they fix a typo on slide 3, swap slides 4 and 5, and present it on the train,
  holding the phone sideways.
- **At a desk the next morning,** everything is as they left it.

## Delivering it

As before.

---

## Notes for you

### The document format and service (round 1, version 1)

The format is the service's and is given to the agent in `api/API.md`. Here is its shape.

**The deck and its slides:**
- **Deck:** `{ id, title, version, updatedAt, slideOrder: [slideId…], thumbnailSlideId }`.
- **Slide:** `{ id, deckId, version, background, elements: [Element…] }`.

**Elements:**
- An element is `{ id, kind, x, y, width, height, … }` in slide points (1280 × 720). Its kind is `rect`,
  `ellipse`, `text` or `group`.
- A **line** is `{ id, kind: "line", x1, y1, x2, y2, stroke }`.
- **Fill** is a colour or `null`. **Stroke** is `{ color, width }` or `null`.
- A **rectangle** adds `cornerRadius` (points; 0 is square).
- Every element but a line adds `keepProportions` (true or false).
- A **text** element adds `text: { content, font, size, weight, italic, color, align }`.
- A **group** is `{ id, kind: "group", children: [Element…] }`. Its children keep their own slide coordinates,
  and its bounds are derived.
- **Stacking order** is array order, back to front.

**Endpoints:**
- `GET /api/decks` lists decks.
- `POST /api/decks` creates one.
- `GET /api/decks/:id` returns the deck.
- `PATCH /api/decks/:id` changes the title or the slide order, with `version`.
- `DELETE /api/decks/:id` deletes it.
- `GET /api/decks/:id/slides` returns every slide.
- `POST /api/decks/:id/slides` adds one, `{ after }`.
- `PUT /api/slides/:id` saves one, with `version`.
- `DELETE /api/slides/:id` deletes one.

**Refusals:**
- **409** `{ error: "conflict", current }` when the version is stale, with the slide or deck as it now is.
- **422** `{ errors: [{ pointer, message }] }` for a malformed element (an unknown kind, a negative size, a colour
  that isn't one), the same refusal shape as Venue's.

**The harness:** `POST /api/_edit` changes a slide as "another window" would, for the conflict flow. `GET /api/_log`
lists every request. `POST /api/_reset` resets the service.

**Why separate slide resources:** saving one slide at a time makes the app track what changed per slide, with
conflicts per slide. It's a real data-model test, and it gives round 2's images a natural home as assets.

**Round 2 (version 2) adds:**
- `rotation` (degrees) on every element, defaulting to 0, so round 1 decks load unchanged;
- `kind: "image"` with `{ assetId, description }`;
- `POST /api/assets`, a multipart upload, returning `{ id, url, width, height }`, and `GET /api/assets/:id`;
- a size limit, refused in the service's words.

`API.md` gains a "what changed" section, so the round 2 agent sees the difference.

**Round 3:** no service change.

### Scoring each round

1. **Hidden flows in a browser,** each checked twice: against what reached the service (`_log` and the stored
   slides, geometry within a tolerance) and against what is on screen (accessible names, element boxes).
   - **Round 1:** about 14 flows:
     - creating a deck;
     - drawing each kind of element, a square and a circle with shift;
     - rounding a rectangle's corners, and the radius holding when it is resized;
     - a shape set to keep its proportions keeping them through a resize;
     - selecting with a drag;
     - moving and nudging, and resizing with and without shift;
     - styling through the inspector, including the mixed state;
     - grouping and ungrouping (positions preserved);
     - aligning and distributing;
     - z-order;
     - undo granularity: one step per drag, typing as one step;
     - adding, duplicating, reordering and deleting slides;
     - saving status and a retry after a refused connection;
     - the conflict;
     - presenting.
   - **Round 2:** rotation hit-testing, resizing a rotated element along its own edges, group rotation and ungroup
     angles, image upload by file and by drop, an upload failure leaving nothing, round 1 decks loading.
   - **Round 3,** under touch emulation: tap select, drag move, pinch zoom, the long-press menu, the phone layout
     (slide fills, list and inspector on demand), swipe presenting.
   - **Every round also re-runs the earlier rounds' flows.**
2. **A checklist** for what a drive can't judge: handle steadiness, selection visible on any colour, thumbnails
   live, the inspector not jumping, presenting looking identical, the on-screen keyboard not covering the text.
3. **The bar (§9), judged by eye.** The hidden flows measure function only. The look and feel are a subjective
   assessment, by the user and by Claude, from screenshots and a walk through the app: identity, learnability,
   direct manipulation, every state designed, rough edges. Each judgement cites what was seen.
4. **The idiom review,** as now.
5. **Recording and first-boot scoring,** as with Venue.

### What it tests in Declare, and why it's worth an hour

- **Free placement and layout together.** Slides are hand-placed geometry; the chrome around them is layout.
- **Direct manipulation:** handles, drags, marquee selection, and hit-testing through groups and z-order.
- **A coordinate space inside another** (groups), and in round 2 a rotated one.
- **An undo model:** how Declare's data model makes command history or snapshots natural.
- **Per-slide change tracking,** conflicts and retry.
- **Text editing in place,** with one style per text box (no rich text, by design).
- **Drawing small:** thumbnails at `scale`.
- **File input and upload** (round 2). I'll check before round 2 that Declare can do it; it may be a gap.
- **Touch at full depth** (round 3), and the same app laid out three ways.

### Open for you

1. **The name.** Presentify (settled).
2. **Round 1's size.** It's large. If you want a run of about 40 minutes, I'd move copy and paste across
   presentations and the conflict flow to round 2.
3. **The "How it will be checked" section.** It's kept for consistency with Venue, but it's exactly the
   grading-framing cue we filed for later.
4. **Fonts.** Unspecified, so the agent offers a small sensible set. Fix the list if you want to check it.
5. **The conflict flow as a "colleague in another window".** This needs the harness's `_edit`. The alternative is
   two browser windows in the drive.
