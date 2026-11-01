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
