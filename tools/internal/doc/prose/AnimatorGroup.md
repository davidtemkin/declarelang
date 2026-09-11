Coordinates several `Animator`s as a unit, running them `sequential` (one after another,
the default) or `simultaneous` (all at once). Its own `to` / `from` / `duration` / `motion`
/ `attribute` / `relative` / `repeat` are a **default cascade** — a member that omits one
inherits the group's — so shared timing is written once, on the group.

```declare
App [ fill = #F6F8FA, textColor = #6A7883, fontSize = 13,
    card: View [ x = 20, y = 30, width = 220, height = 70, cornerRadius = 10, fill = #2E6FE0, opacity = 0,
        Text [ x = 14, y = 24, textColor = white, text = "fade in, then slide up" ],
        // one group, two steps in sequence: opacity first, then the y — shared duration, written once
        enter: AnimatorGroup [ process = sequential, duration = 350, started = true,
            Animator [ attribute = opacity, to = 1 ],
            Animator [ attribute = y, to = 20 ]
            ]
        ],
    Text [ x = 20, y = 112, text = "click to replay" ],
    onClick() { card.opacity = 0; card.y = 30; card.enter.start() }
    ]
```

## process
How the members run — `sequential` (each starts when the previous finishes) or
`simultaneous` (all together). The one control unique to a group.

## attribute
A default target slot cascaded to any member that omits its own (see `Animator.attribute`).

## to
The default destination, inherited by members that omit `to`.

## from
The default start value, inherited by members that omit `from`.

## duration
The default run time (ms), inherited by members that omit `duration` — the usual way to
give a whole group one tempo.

## motion
The default easing curve for members that omit `motion`.

## relative
The default offset-vs-absolute mode for members that omit `relative`.

## repeat
The default repeat count for members that omit `repeat`.

## started
Set true to run the whole group.

## paused
Freeze/resume the group without resetting.

## onStart
Fires once when the group begins — after its members are sequenced, not per member.

## onStop
Fires once when the **last** member finishes, so it means the whole group is done — the
place to chain the next thing.

## onRepeat
Fires at each loop of a repeating group (the outer group's repeat, not a member's).

## start()
Runs the whole group (sequencing or paralleling its members per `process`) — the imperative
equivalent of `started = true`.

## stop()
Halts the group and all its members in place. Members keep their current values; nothing
rewinds.
