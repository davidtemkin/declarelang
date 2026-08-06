# Lightwell — a brief

Five hundred and sixty photographs. Build the thing a person uses to wander
through them, look hard at one, and pull out the handful worth printing.

This brief says what should be true for the person using it, and how it should
feel to look at. The photographs are the point; everything you add is in
service of them.

## 1. The material

The photographs live behind the local service described in `api/API.md`. Each
has a file and a title — nothing else. **The pictures themselves are the only
record of their shape**: the service does not know their sizes, and they are a
thorough mix — landscapes, portraits, squares, panoramas.

## 2. The wall

All 560 at once, as a wall a person drifts along. It reads exactly:

> **560 photographs**

and the count follows a title search. Scrolling should feel like walking past
prints, not operating software — no paging, no stutter, and it must not load
what nobody has reached.

**No photograph may be distorted. Ever.** Whatever the arrangement — and the
arrangement is yours — every crop is deliberate framing, never a squash, and a
panorama and a portrait can stand on the same wall each looking like itself.
The wall should be *about* the pictures: chrome recedes, the mix of shapes
becomes the texture, and two adjacent frames never fight.

## 3. Looking at one

A tap opens the photograph as large as the screen honestly allows — whole, its
own shape, nothing cut. Beside or beneath it, its title and a short written
reflection (the service supplies one per photo): **set like a book page, not a
terminal** — measurably: body text line spacing at least 1.5× its size, a
comfortable measure, ragged right. Next and previous continue the walk;
arriving should feel like stepping closer, not like a page load.

## 4. The picks

A person marks photographs as picks and unmarks them; the running count reads
exactly `12 picks`. A pick is visible on the wall at a glance. The picks
gather on a **contact sheet** — a second surface that treats them as a set
worth keeping: same no-distortion law, tighter and more deliberate than the
wall. Picks live only for the session.

## 5. How it should look

Photography first: mostly ink and paper, one accent earned by the act of
picking. Type carries what type must (titles, the reflection, the counts) and
otherwise stays out of the pictures' way — but where it appears it is set with
care: real leading, real hierarchy, no default-looking text anywhere. If a
surface wants warmth, think of prints pinned to a wall or laid on a table —
and if something sits slightly askew, it sits so *deliberately*, like a print
placed by hand, never as decoration for its own sake. Restraint throughout:
every motion does a job — arriving, leaving, marking. Nothing loops.

## 6. On a phone, and at a desk

Both real. The wall re-arranges for the width it has — a phone gets fewer
columns, never smaller-than-legible pictures; the desk uses its space for more
wall, not bigger chrome. Looking-at-one on a phone is full-screen with the
reflection below; flipping should work with a thumb. Nothing depends on hover.

## 7. Constraints

- No accounts, no upload, no editing, no persistence between sessions.
- The service is the whole backend; never write your own.
- Copy as written: `560 photographs` (and the narrowed count), `12 picks`,
  singulars `1 photograph` / `1 pick`.

## 8. What done looks like

Someone opens it, drifts down a wall where every picture is exactly its own
shape, types "autumn" and watches the wall narrow, opens an acorn photograph
that fills the screen whole, reads three well-set lines about it, flips
through the next dozen with a thumb, marks five, and ends on a contact sheet
they'd happily send to the printer.

## Delivering it

One file at `my-apps/lightwell.declare`. Dev server: `npm start 8209` →
http://localhost:8209/my-apps/lightwell.declare. The service runs on **8340**.
Check your work with `node tools/verify.mjs` and drive it with `--assert`;
headless Chrome emulates the phone well enough for layout, reach, and touch.
