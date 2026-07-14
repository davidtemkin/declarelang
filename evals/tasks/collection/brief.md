# Task: a task list

Build a small to-do list that starts from seed data and can be edited.

## Seed data

The list starts with three tasks:

1. **Write the brief** — done
2. **Wire the harness** — not done
3. **Run the shakedown** — not done

Each task has a text label and a done/not-done flag.

## What's on screen

- A **heading** at the top showing how many tasks **remain** (are not done), e.g.
  *"2 remaining"*. This count updates live as tasks are completed or added.
- A **text field** and an **Add** button, in a row below the heading.
- The **list of tasks**, one row each, below that — each row shows the task's label.
  A done task is visually distinct from a not-done one (dimmed, struck through, or
  similar — your choice, as long as done and not-done differ).

## Behavior

- **Add:** typing a label into the field and pressing the Add button appends a new,
  not-done task with that label to the end of the list. The list and the remaining
  count both update immediately.
- **Complete:** clicking a task row toggles its done flag. Its appearance changes and
  the remaining count updates immediately.

The list is data — adding a task adds a record, completing one edits a record; the
rows on screen follow the data, you never build them by hand. Use the ambient
light/neutral palette. Exact styling is not important; the data binding, the live
count, and the two edits (add, toggle) are.
