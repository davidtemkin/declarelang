# The Layout Manager Showdown (java.net, 2006): the source material

Kept here so the comparison doesn't depend on the archive. John O'Conner proposed a common
"Address Book" frame for comparing Java layout managers (MigLayout, FormLayout, GroupLayout,
GridBagLayout, TableLayout, DesignGridLayout, ZoneLayout, PageLayout and others); each
manager's advocate built it and reported on the wiki.

- Index: https://web.archive.org/web/20120414134638/http://wiki.java.net/bin/view/Javadesktop/LayoutManagerShowdown
- The call, with the questions: https://web.archive.org/web/2007/http://weblogs.java.net/blog/joconner/archive/2006/10/layout_manager.html
- The frame's spec: https://web.archive.org/web/2007/http://weblogs.java.net/blog/joconner/archive/2006/10/more_informatio.html
- `addressbookdemo.png` — the frame with the alignment lines A–G marked; `addressbookdemo_mac.png` — the same on a Mac.

## The questions each entry answered (O'Conner, 2006-10-11)

- Can it align components across other components — the phone field with the city field, on the
  other side of the two address fields — both on the left and on the right?
- Does it know platform-specific gaps and spacing between components?
- Can text fields and labels grow and shrink when the text is localized?
- How much code (Java, or declarative XML) does it take?
- Can panels nest?
- Can it align components along a baseline (labels with their fields' text)?
- What is the licensing?
- Will it work for bi-directional locales — how hard is mirroring the layout for right-to-left?

## The frame's spec (O'Conner, 2006-10-12, lightly condensed)

- The list is anchored to the panel's top and left, and grows vertically to take extra height.
- The labels Last Name, Phone, Address 1, Address 2, City, State and Country are right-aligned
  on line A.
- Their fields are left-aligned on line B, at the preferred gap from the labels.
- The fields for Last Name, Phone, City, State and Country are right-aligned on line C — all of
  them, even though Address 1 and 2 run past C and break the column.
- The labels First Name, Email and Postal Code are left-aligned on line D, at the preferred gap.
- Their fields sit against their labels (line E shows they are not aligned with each other).
- The fields for First Name, Email, Address 1, Address 2 and Postal Code extend to a preferred
  gap from the panel's right edge, line F.
- Line G: the first row's labels and fields share a baseline.
- The button row (New, Delete, Edit, Save, Cancel) belongs to no column above: it is indented to
  the right of the list, each button a platform gap from the next, and it is anchored left and
  top — a gap below the list and the Country row — not to the bottom.
- When the panel grows, the list and all text fields share the extra width equally.
