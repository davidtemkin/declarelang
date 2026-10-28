# The nearest whole program

`apps/tracker/tracker.declare`

Its parts, by line. Read the ones your plan needs (Read with offset and limit), not the whole file.

```
apps/tracker/tracker.declare — 1508 lines. Read a part by its lines (Read with offset and limit, or sed -n 'A,Bp').
       1–40  the header — An issue tracker fast enough to triage a six-figure backlog:
      49–55  schema Issue
      58–62  schema Line — One line of the list:
     70–207  class Issues — the issues
      84–89    labelNames: string
      91–97    assignees() — the people who actually hold work:
    108–124    closedPerDay()
    128–151    workloadOf()
    153–166    save() — an edited copy of a record comes back whole
    168–182    setEach() — one field across many records; a label is added, not replaced
    184–190    stamp() — every write bumps updated; a status write also moves closedAt
    192–198    removeEach() — removes the records and hands back what restore needs to put them back
    200–207    restore()
    213–222  theme Tracker — the tracker's own tokens, provided over the house preset in either mode:
    229–240  class StatusIcon — small pieces: the tracker's icon vocabulary
    243–254  class PrioIcon
    257–271  class Avatar
    262–271    cap: TextLabel
    273–283  class Tag — a label pill:
    278–283    cap: Text
    286–315  class Chip — a status filter chip:
    309–315    n: Text
    320–345  class ListRow — A list row is one of two things:
    348–376  class GroupRow — the group header — a status, its count, and the chevron that collapses the group; a click collapses instead…
    352–376    hdrRow: View
    380–460  class IssueRow — the issue row — one calm line:
    391–423    line: View — the row's one line, the top 44px whatever height the row springs to:
    433–444    card: EditorCard — the open-in-place editor, below the row's own line while the height spring makes room.
    448–460    onClick() — An issue row keeps TableRow's selection protocol and adds the context menu.
    463–468  class PersonIcon — a person's avatar as a menu icon:
    470–478  class Roll — a rolling number — the rail's working unit:
    482–519  class RailStat — one rail statistic:
    505–511    track: View
    512–519    num: Roll
    521–526  class RailCaption — a rail section's caption
    528–536  class PerfLine — one line of the rail's performance panel:
    540–556  class DropButton — a button that opens a menu:
    558–567  class KeyHint — one line of the rail's keyboard legend:
    569–582  class EditTag — an editable label tag for the detail panel — the list Tag plus a remove ×
    574–582    x2: Control
    588–658  class EditorCard — the in-place editor:
    596–658    col: View
    661–666  class Facet — one editable field in the editor card, outlined:
   669–1507  App
    697–702    prioColor()
    708–715    issues: Issues — the issues
    717–727    adopt()
    729–753    regenerate()
    760–780    timeIngest()
    819–859    project()
    867–877    stepHit()
    879–891    enterHit()
    896–911    takeSelection() — the list hands back whatever rows were picked; group headers are not issues
    926–933    openDetail()
    935–945    newIssue()
    948–957    revealOpen() — once the card has sprung open (the row's height Spring lands), bring the open row into view
    958–966    draftDiffers()
    968–980    commitDraft()
    982–989    setDraftField()
   998–1003    performDelete()
  1005–1012    undoDelete()
  1014–1024    bulkSet()
  1030–1038    facetItems()
  1040–1045    addLabelMenu: Menu
  1047–1062    bulkMenu: Menu
  1064–1074    ctx: ContextMenu — a row's context menu acts on the selection, after taking the row into it
  1082–1089    sortMenu: Menu
  1097–1103    labelMenu: Menu
  1107–1117    shortcuts: Shortcuts — ⌘K or "/" reach the search field from anywhere — "/" is a plain key, so it stands down while a field is tak…
  1119–1134    keys: Keys
  1142–1198    bar: View — the bar — brand · search · scale · appearance
  1205–1270    tools: View — The tools row is two clusters, filters left and actions right, in a wrapping flow:
  1273–1477    body: View — the body — the issues and the rail, in what the bar, the toolbar
  1479–1489    foot: View — the footer: the quiet ledger line, how many and how many shown
  1497–1507    entry: View — the entry screen:
```
