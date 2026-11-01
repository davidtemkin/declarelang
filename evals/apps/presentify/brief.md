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
