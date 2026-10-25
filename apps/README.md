# `apps/`

The complete applications the distro ships. Each program opens with a prose block
saying what it is and what to notice. The seven that show a whole program's shape are
listed in [`skill/SKILL.md`](../skill/SKILL.md): todo, tracker, weather, calendar, birds,
marketmap and desktop.

`todo` is the one the skill has an agent read first: a familiar program, with comments
for a reader new to Declare. `todo.declare` includes `todo-parts.declare` (its themes,
icons and small parts), and the two are read together.

`games/` holds four games: faithful ports of Asteroids, Stargate and Tempest, each
reproducing the arcade frame by frame, and Vortex, Tempest written afresh as a
Declare program. A folder like `games/` with no program of its own only groups the programs
below it; see `docs/system-design/requests.md` § The directory-program rule.

Two groups here are not models to copy. `docs`, `homepage` and `architecture` are
Declare's own site. The three `lzx-*` programs are ports of OpenLaszlo samples from
2003, faithful to the originals' look and behavior.

The `index.html` files here are generated (`npm run derive`); never edit them.
