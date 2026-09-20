I co-founded Laszlo Systems and led the team behind OpenLaszlo — a declarative
UI language, first shipped in 2002, that pushed right to the edge of what that
era’s web browsers could handle.

What brought me back to UI development was
[Mesa](https://davidtemkin.com/about-mesa/), a zoomable canvas app I built
without using a browser framework, toolkit, or higher-level language. Mesa
renders a thousand live objects at a 60fps floor, even on a phone. It’s been
positively amazing to see how fast today’s browsers have become — and how
powerful and flexible today’s web platform is.

And yet the web as it actually stands is still, mostly, slow and clunky. Even
brand-new sites. How can that be?

It turns out the browser isn’t what makes the web feel worse than a good
native app. It’s what we’ve built on top of it. A lot of accumulated code —
and a lot of accumulated habits — take their toll, and the interfaces that do
escape them are hand-crafted, one at a time, by specialists.

In June I handed the original OpenLaszlo compiler to an LLM and got back a
modern port that compiles any OpenLaszlo program perfectly, byte-for-byte.

Seeing those programs again through fresh eyes — and seeing how small and how
fast the sites built with them are — I decided the language deserved to be
modernized. Declare is what came out of that: a direct descendant of
OpenLaszlo, with the core ideas intact, built on an entirely new foundation,
and shaped to be written with an LLM.

Enjoy!
