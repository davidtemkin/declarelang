# Vortex — design note

Atari's *Tempest* (1981) as an example of idiomatic Declare. Written before the code;
the last section is filled in after the program ran.

## What the game is (the subset)

The player looks down a **tube** (a "well" or "web"): a shape of 16 lanes drawn as a
near rim and a far rim joined by lane lines. Some tubes are closed (circle, square,
plus, star); some are open (a V, a trough, steps, a flat plane). Everything is
vector-drawn, glowing, on black.

- **The claw** (the player) sits on the near rim, in one lane, and spins round it.
  It fires shots down its lane. The lane it is in is lit in its color.
- **Enemies** appear at the far end and climb toward the rim:
  - **Flipper** — a red bow-tie. Climbs, flipping end over end into the next lane now
    and then. At the rim it flips along the rim toward the claw and grabs it.
    Sometimes fires a shot up its lane.
  - **Tanker** — a purple diamond. Climbs straight; shot, or on reaching the rim, it
    splits into two flippers in the lanes beside it.
  - **Spiker** — a green spiral. Climbs part way, laying a **spike** behind it, then
    goes back down and starts again in another lane. Spikes stay; a shot shortens one.
  - **Fuseball** — a multicolored tangle. Climbs unevenly and hops lanes. Deadly at
    the rim.
  - **Pulsar** — a zigzag. Climbs and flips slowly; while it pulses its lane is
    electrified and kills a claw in it.
- **Shots**: up to eight player shots in flight; enemy shots climb and kill a claw at the
  rim of their lane. A player shot destroys an enemy shot.
- **Superzapper**: once per level it destroys every enemy in the tube; a second use
  in the same level destroys one. The screen flashes.
- **Levels**: each level has a wave (how many of each enemy, how fast). When the wave
  is cleared the claw **flies down the tube** — the camera dives with it, the tube rushes
  past — and spikes still standing kill it if it meets one in its lane (it can shoot
  them on the way). Then the next tube zooms in from the distance. The colors change
  between levels (Tempest changes palette every sixteen levels; here every level, so
  the change is visible in a short game).
- **Lives**: three. A claw caught, shot, electrified or spiked bursts; the enemies
  in the tube go back into the wave and play resumes on the same tube. With no lives
  left: GAME OVER, then the attract screen.
- **Screens**: the attract screen (the title, the high score, the keys, PRESS RETURN,
  and the tube shapes cycling behind, each zooming in); a pause card; a game-over
  card; a short banner at the start of each level.
- **HUD**: score and the spare lives (as small claws) top-left, the level top-center,
  the high score top-right, the superzapper's state under the score.

Left out: the spinner's analogue feel, the scoring bonuses for level-select, sound,
the "rescue" of a claw being dragged down, enemy-speed curves past level 16.

Controls: ←/→ or A/S spin (holding repeats), Space or Return fires (holding
auto-fires), ↓ or Z superzaps, Escape pauses, Return starts.

## The model, and where it lives

> Records in datasets; where the user is on the App; views derived from both.

### The data

| What | Where | Why there |
|---|---|---|
| The tube shapes — name, open or closed, the vanishing offset, the rim points | `tubes: Dataset`, a JSON literal, `schema = [ shapes[]: Well ]` | Literal data, read-only. Points are data, not code. |
| The waves — per level, how many enemies, which kinds and how many at once, how flippers move, how fast everything climbs and fires | `waves: DataSource` on `waves.json`, `schema = [ levels[]: Wave ]` | The level design is the arcade's own table, 98 rows, in this program's units; past it, one of rows 65–96 for each level, as the arcade does. |
| What is in the tube now — enemies, player shots, enemy shots, spikes, bursts | `field: Playfield`, a class that `extends Dataset` | These records have rules (how deep an enemy is now, what a shot hits, what a tanker becomes), and the rules belong to the records' own class (guide 14, "the dataset becomes the class"). |
| The keys on the attract screen | `help: Dataset` literal | A list of rows is replicated from data, not built in a loop. |
| The spare-life icons | `spares: Dataset [ contents = { … } ]`, derived from `lives` | A row of icons is replication over a derived dataset. |

### Time as the input, not per-entity integration

The crucial decision. An enemy's depth is **not** stored and stepped every frame. Its
record holds when it set out (`born`) and how fast it climbs (`speed`); its depth is
a *function of the game clock*, `Playfield.depthOf(foe, t)`. Likewise a shot's depth
(`firedAt`, `from`), a flip's progress (`flipAt`), a burst's age (`at`), a pulsar's
pulse. So:

- each sprite's position is a **constraint** over its record and `app.t`;
- records are written only when something *happens* (a spawn, a flip begins, a hit, a
  split), not sixty times a second. That keeps the dataset quiet (and stays clear of
  the runtime's known leak when records are replaced many times a second);
- **pause is free**: `t` is game time, advanced by the frame `Time` only while playing;
  stop advancing it and every derived position stops.

The one per-frame handler, `frame: Time [ tick = frame ]`'s `onTick(dt)`, integrates
only what genuinely depends on the previous frame: the game clock `t`, the held-key
spin and auto-fire, and the collision sweep (which asks the `Playfield` what happened in
this step). That is the guide's sanctioned use of `onTick` (integration).

Another clock is a **period**, not a frame (guide 22's `tick = <ms>`): the pulsars'
and fuseballs' "brain" (`tick = 250`, a hop or a closing on the claw). A second
cycles the tube shapes on the attract screen. Flippers move and enemies fire in the
step of play, on the arcade's own waits and odds, each written to the foe's record
only when it moves or fires.

### Where the user is (the App)

`mode` (`"attract" | "play" | "zoom" | "dying" | "over"`), `paused`, `level`,
`score`, `hiScore`, `lives`, `zaps` (superzapper uses left this level), `t` (game
clock), `clawSpot` (the lane the claw is going to, unwrapped so a spring can cross the
seam of a closed tube), `queue` (the enemy kinds still to spawn this level).

### Geometry: a Node class on a record

`tube: Tube [ datapath = { app.tubes.value.shapes[app.shapeIndex] } ]`. `Tube extends Node`
stands on the current shape record (guide 14, "A Node class on a record"): `rim`,
`closed`, `lanes` derive from the record, and its methods are the projection:
`at(lane, depth) -> Spot` (screen x, y, perspective scale, lane angle, lane width) for a
*fractional* lane, so a flip between lanes and the sprung claw are the same call.
Change the level and the datapath moves; every sprite's constraint follows.

Perspective: depth 0 is the far rim, 1 the near. `z = zFar − (zFar−1)·depth`, and the
camera's position `cam` is subtracted, so `s = 1 / (z − cam)`. A point at unit rim
position `p` is at `center + p·R·s + V·(1−s)` (V the vanishing offset). Brightness
from depth is a constraint on each sprite's `opacity`.

The camera: `cam = dive·(zFar−1) − approach`. `dive` (0→1) is an **Animator**
(`started = { app.mode == "zoom" }`) — the fly-down is clock-shaped, it advances over
a known time; its `onStop` begins the next level. `approach` is a second Animator,
from far away to 0, started when a tube is new, so each tube zooms in. During the dive
the claw's depth is `1 − dive`, so it stays at the camera's distance while the tube
rushes past.

### The views

- `WebView` — the tube, drawn by `draw(d)`. It reads the rim, the camera, the claw's
  lane and the electrified lanes, so it re-records only when one of those changes:
  never while the claw sits still and nothing pulses, every frame during a dive.
- `Sprite` — the base of everything placed in the tube: it declares `laneAt`, `depth`,
  `turn`, and derives `x`, `y`, `scale`, `rotation`, `opacity` from `app.tube.at(…)`.
  Its shape is drawn once in a fixed 40×40 box by its subclass's `draw`; motion is
  attributes, never a re-drawn shape (guide 17: "draw the part that is a shape; leave
  the box to attributes"; "never animate a drawing's size").
- `Foe extends Sprite`, standing on a foe record, with **one class per kind** —
  `Flipper`, `Tanker`, `Spiker`, `Fuseball`, `Pulsar` — chosen by
  `classFor = { :kind == … }` on the replicated `Foe` (guide 16, "Records of different
  kinds"). Each adds only its drawing and what is particular to it (a flipper's turn
  while it flips, a pulsar's pulse).
- `PlayerShot`, `EnemyShot`, `Burst`, `Claw` — sprites too.
- `SpikeLine` — a spike is a line from the far rim up its lane; it is a thin `View`
  whose `x`, `y`, `width` and `rotation` are constraints over the two projected end
  points: no drawing at all.
- `Hud` — the score panel: a `SimpleLayout` row of three columns, with `Spacer`s;
  spare lives are `LifeIcon`s replicated over `spares`.
- `TitleScreen` and the `Notice` cards (level banner, pause, game over) — `SimpleLayout` columns of `Text`, the
  key list replicated from `help` as `KeyRow`s. Which screen shows is `visible = { app.mode == … }`.

### Color

Per-level palettes are **theme records** (`theme Blue [ web = …, claw = …,
flipper = … ]`, then Red, Yellow, Green, Violet), laid over the dark preset, and the App's
`theme = { … }` picks one from the level. Every drawing and text reads
`provided("theme").<token>`, so a change of level re-colors everything with no code.

### Keyboard

A `KeyListener` member on the App: `onKeyDown` for the discrete keys (start, pause,
superzap, the first step of a spin, the first shot), and `Keyboard.isDown` in the frame tick
for held keys (repeat spin, auto-fire), the documented way for a game to read held keys
(which also stops the browser's own use of them).

### Script

Pure helpers only: `lerp`, `clamp`, `mod`, the shortest step round a closed tube,
`rnd`. No state, no colors, no placement.

## Where Declare is likely to be awkward (predicted)

- **A game loop**: the collision sweep is inherently imperative. It sits in one method on
  the `Playfield` (`step`), returns what happened, and the App applies it (score, death).
- **Spikes grow while a spiker climbs**: rather than write the spike's height every
  frame, the spike view's height is `max(record height, the climbing spiker's depth)`,
  derived; the record is written once when the spiker turns back.
- **A Node class cannot be replicated** (guide 14), so the per-foe rules are methods on
  `Playfield` that take the record, not a model object per foe.

## How it turned out

The design held. The files: `vortex.declare` (helpers, fixed data, the App),
`model.declare` (schemas, `Tube`, `Playfield`), `sprites.declare` (the tube drawing
and every sprite class), `screens.declare` (themes, `Hud`, the attract screen, the
cards).

Renames the compiler forced: `Field` and `Card` are library classes (now `Playfield`
and `Notice`); `Shape` is a built-in type name (the schema is now `Well`).

What Declare did well here:

- **Position as a function of the clock.** Sprites have no update code. Each one's
  `x`, `y`, `scale`, `rotation` and `opacity` are constraints over its record and `t`;
  pausing is "stop advancing `t`". The dataset is written a few times a second (on
  events), never per frame.
- **`classFor` over kinds.** Five enemy classes with a shared base, one replicated
  line, and each class is only its drawing and what is particular to it.
- **A Node class on a record.** Changing level is the `Tube`'s datapath moving to the
  next shape; every sprite, spike and the web follow.
- **Themes for palettes.** A level change re-colors everything with no code.
- **Animators for the camera.** `started = { app.mode == "zoom" }` makes the dive
  declarative; `onStop` is the one place the next level begins.
- **`trackChanges` for "the wave is cleared".** A derived boolean, and one action when
  it turns true.
- **Draw once, move by attributes.** Shapes record once; perspective, flips and spin
  are `scale` and `rotation`. Spikes and live lanes need no drawing at all: they are
  thin views whose length and angle are constraints.

Where it was awkward:

- **The collision sweep is imperative.** `Playfield.step` is the longest method in the
  program. It collects what happened, makes all of its writes at the end, and returns
  an `Outcome` the App applies. Nothing in the language makes this shorter; a game
  loop is a game loop.
- **A retiring row is evaluated once with no record.** When a shot's record is
  removed, its view's constraints run once more with `:@` null before the view goes;
  a method that dereferenced the record threw there, and the throw left the view
  stranded, throwing every frame. The per-record methods now take `Foe?`/`Shot?` and
  answer neutrally for a missing record. A minimal program did not reproduce it, so
  the exact trigger is not pinned down; it looks like a runtime gap worth raising.
- **Testing timers headless.** The verify harness virtualizes page timers (a period
  `Time`, `afterDelay`); they advance only through `drive.wait`. `declare-look --wait`
  advances them once per wait, so a period `Time` fires once. The check scripts wait
  in 50–60 ms steps.
- **The App can't read its own provided theme.** `provided()` walks up and never reaches
  the App itself, so the App's flash color reads `app.palette.web` directly.
- **No per-record Node.** Models can't be replicated (guide 14), so the per-foe rules
  are `Playfield` methods that take the record as an argument.

The memory leak noted for rapidly replaced records was not seen: the runs here
(up to 80 s of play, five levels) did not stall, and the design keeps writes to events.

## Phase 3: the arcade's feature set

Added with the same approach (positions from records and the clock; records
written only on events):

- **Rate yourself.** `choose` mode: the levels unlocked so far
  (`choices`, a derived dataset over the `starts` table, up to the furthest level
  reached), a strip of `ChoiceColumn`s in a `SimpleLayout` slid by a `Spring`
  (`choiceShown` → `choice`), each column the level, a drawn `TubeIcon` in its
  color set, and the bonus; a ten-second `Animator` (`started = { mode == "choose" }`)
  whose `onStop` starts the game; the countdown sound from `trackChanges` on
  `secondsLeft`. The start bonus is paid when the first level is cleared.
- **The fall through the stars.** `warp` mode at the start of every level:
  `stars` is a fixed derived dataset (built from a pure `hash`); each `StarView`'s
  place is a function of `t`, so nothing is written while they stream. The new
  tube arrives on the `arriving` Animator, whose end begins play.
- **Nymphs.** The wave is laid at the far end as `nymphs` records in the arcade's
  bands of sixteen, each `due` on the nymphs' own clock (`risen`), which runs only
  while there is room in the tube; a `NymphView` drifts out toward its lane as it
  comes due, and `Playfield.step` surfaces it as the kind the arcade's rules choose
  then (`chooseKind`: each kind's least and most at once, seven in the tube, the
  tankers' cargo counted, the lane's spike deciding between tanker and spiker).
- **Sixteen tubes; color sets every sixteen levels** (blue, red, yellow, cyan,
  the unseen tube, green), as six theme records; `paletteFor(level)` picks one.
  The unseen tube is just a theme whose `web` is black.
- **Tanker cargo** (flippers, pulsars, fuseballs by wave), drawn inside the tanker;
  **fuseball points** (250/500/750 by depth) as a `PointsPop`, picked with
  `classFor` beside `Burst`; **a global pulse** (pulsars pulse together, kill in
  their lane, and stop short of the rim); **random second superzap**; **bonus
  life every 20,000** (up to six); **high-score table** (`best`, top five);
  **attract demo** (a `pilot` Time steering; one life; no sound).
- **Sound** (`sound.declare`): twelve `Clip`s (`Audio`, in memory) on eight
  voices; `cue(name)` cuts the voice and plays. Muted while paused or with M;
  a new life hushes voices 1–4; nothing cues in the attract mode or the demo.
