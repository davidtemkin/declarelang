# Murmur — design statement

**Hierarchy.** Warm paper, one ink, one clay. The clay is the only saturated
colour here and says exactly two things: *this is mine*, or *this is new*.
Everything else is neutral, so the eye finds the unread mark and your own voice
without being told.

**Type.** Five sizes, each with one job: wordmark, conversation name, 16 for
what people said, preview line, and the small marks.

**Space.** Deliberately uneven: 3px inside a run of one person talking, 14
between runs, 52 for a day. A bubble stops where its gutter begins, and the
gutter holds one thing at a time — the time a run ended, or, when you reach for
the message, the way in to a reaction.


**Motion.** Everything that moves is a sprung scalar with geometry derived from
it. One number carries the conversation over the list. A row's *rank* is
sprung, so re-ordering the list is rows travelling. A reaction springs a
message's height, so what is below eases down. A photograph's box springs from
a guess to its true proportion as the bytes land; opening one full size takes
that same rectangle to a bigger one, and home again.

**Two widths.** 390 is one surface at a time; 1440 is two panes, and the
conversation column stops at 720 and centres rather than stretching.

**The decision I would defend:** the voice scrubber's lens. Sixty-four peaks in
two hundred points is three pixels a bar, so under a finger the bars swell
around the grab point — a moment inside a clip becomes something you can aim
at.

**Infrastructure:** none, bar one thing named in the source. Declare has no
scroll or image-load event, so four places gate a `Time` on a reactive fact as
a one-shot trigger, each closing its own gate by doing the work.
