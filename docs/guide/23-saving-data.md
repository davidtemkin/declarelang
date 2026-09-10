<!-- nav: Saving data -->
<!-- part: Building -->

# Work now; acknowledge the snapshot

```declare
App [ width = 340, height = 180,
    note: Dataset [ disk: Persistence [ key = "guide/note", save = "manual" ] ] {
        { "title": "Untitled" }
    },
    form: View [ x = 16, y = 16, datapath = { app.note.value },
        TextInput [ width = 300, height = 44, text <-> :title ],
        Button [ y = 56, width = 140, height = 44, label = "Save",
            onClick() { app.note.disk.commit() }
        ],
        Text [ y = 112, width = 300, wrap = true,
            text = { app.note.disk.error ? app.note.disk.error.message : app.note.disk.pending ? "Saving…" : app.note.disk.saved ? "Saved" : "Working copy" }
        ]
    ]
]
```

> **The Dataset owns your work. Persistence acknowledges a snapshot of it.**

The field edits ordinary Dataset data. The policy captures the final value after
the reactive update settles, then asks the browser to store it. You can keep editing
while that happens. An acknowledgement of an older snapshot does not overwrite
those edits or label them saved. Invalid editor drafts are not Dataset changes and
are never saved.

The example uses an explicit Save button. Omit `save = "manual"` for automatic
saving after accepted edits: a 250ms quiet period, bounded by 1000ms during continuous
editing. These are coalescing limits, not promises about storage latency. Opening a
missing document does not write its seed automatically.

## Recovery is a choice, not another editor

By default, a valid saved document is adopted at boot only if you have not edited or
requested a save while the read was pending. Otherwise `recovery` becomes `available`
and `candidate` exposes a frozen saved value separately from your working Dataset.
Set `restoreOn = "manual"` when your application must inspect version or domain
validity before accepting saved data. A Dataset schema checks structure; it does not
validate the meaning of a financial scenario, enforce an app version or migrate it.

Offer Restore to call `restore()`, or Replace to call `replace()` after the user has
chosen the working copy. An invalid saved payload remains erasable but is never
exposed as typed data. Normal `commit()` refuses while recovery remains unresolved.

## Deleting a saved copy does not delete your work

`erase()` leaves the Dataset intact and pauses autosave, including after later edits.
This prevents the next keystroke from silently recreating the deleted copy. A successful
explicit save or chosen restore/replacement resumes saving. Wait for the erase receipt
before claiming that the saved copy is gone.

## Leaving requires the right receipt

`commit()` returns a number immediately: a request ID, **not a promise of success**.
Keep that ID and a `leaving` flag in app state. In `onResult`, leave only when
`r.requestId` matches, `r.ok` is true, and leaving is still requested. Cancel clears
the flag; an already issued storage operation can still finish, but its receipt no
longer causes navigation. Keep navigation itself in the app's ordinary navigation
handler. Closing a tab is not a guaranteed final-save opportunity.

## Local storage has boundaries

Browser DOM and browser canvas share IndexedDB storage, scoped to origin, the
entry-program URL (without query or fragment), host namespace and policy key.
Moving the program can change its identity; embedders can provide a stable app ID
through host options. Policy configuration is latched for one owner lifetime;
changing it fails closed rather than silently switching documents.

Another tab can change the same document. The default revision check refuses a
stale write as `conflict`; use `reload()` to inspect the newer candidate before
choosing. Retry handles retryable terminal failures, not conflict or an uncertain
`stalled` transaction. A stalled operation remains pending until its outcome is known.

Portable JSON payloads are limited to 8 MiB. There is no cloud sync, encryption,
indexed collection, migration or retention guarantee. Browser clearing, eviction,
private profiles and quota restrictions still apply. Hosts without a provider,
including the current native host, report `unsupported`; there is no silent
in-memory success fallback. Keep sensitive data and backup requirements in your
application's storage decision.

See [Persistence](declare-docs:Persistence) for command, recovery and error contracts.
