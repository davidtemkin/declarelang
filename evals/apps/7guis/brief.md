# 7GUIs: a brief

7GUIs is a benchmark for GUI programming: seven small tasks, each chosen for a challenge
that GUI toolkits and languages handle very differently. Implementations exist in many
frameworks, so they can be compared. Build all seven, to the definitions below.

They are one program: a window with a way to move between the seven tasks, each shown
in full. Keep each task's code apart from the others' (its own file or its own unit), the
way the published implementations do, so each can be read on its own.

This is a desktop program: a mouse and a keyboard. Each task should look and work like a
small, well-made desktop tool, with the controls named for what they do.

---

## 1. Counter

A read-only field showing a count, and a button "Count". The count starts at 0, and each
press of the button adds one.

*Challenge: the basic ideas of a language or toolkit.*

## 2. Temperature Converter

Two text fields, Celsius and Fahrenheit, both empty at the start. Typing a valid number
in either one updates the other at once; typing something that is not a number leaves
the other unchanged. C = (F − 32) × 5/9 and F = C × 9/5 + 32.

*Challenge: bidirectional data flow, and the user's text as input.*

## 3. Flight Booker

A choice of "one-way flight" or "return flight", two date fields (start and return), and a
button "Book".
- The return date can be edited only for a return flight.
- For a return flight, a return date strictly before the start date disables Book.
- A date field that holds something that isn't a valid date is marked (red) and disables
  Book; the format is the program's to choose and to show.
- Book says what was booked: "You have booked a one-way flight on 14.11.2026", or the
  return-flight equivalent with both dates.
- At the start: one-way flight, both fields holding the same date, the return date not
  editable.

*Challenge: constraints between controls and within one.*

## 4. Timer

A gauge showing the elapsed time e, a label showing e in seconds (one decimal), a slider
for the duration d, and a button "Reset".
- Moving the slider changes d at once, while it is dragged, and the gauge follows.
- The timer runs while e < d; when e reaches d it stops, with the gauge full.
- If d is raised above e, the timer runs again until it reaches the new d.
- Reset sets e to zero.

*Challenge: time, and user and timer acting on the same state at once.*

## 5. CRUD

A filter field "Filter prefix", fields "Name" and "Surname", a list of people, and buttons
"Create", "Update" and "Delete".
- The list shows the people as "Surname, Name". At most one is selected at a time.
- Typing in the filter shows only people whose surname starts with it, as it is typed.
- Create adds a person from Name and Surname. Update replaces the selected person with them.
  Delete removes the selected person. Update and Delete are enabled only while someone is
  selected.
- The filter sits above the list, the fields and the buttons below or beside it; the list
  takes the room that is left.
- It starts with three people: Hans Emil, Max Mustermann, Roman Tisch.

*Challenge: keeping domain and presentation apart, mutation, and a layout of some substance.*

## 6. Circle Drawer

"Undo" and "Redo" above a canvas.
- Clicking an empty spot draws an unfilled circle of a fixed diameter, centred there.
- The circle nearest the pointer that contains it is selected, and filled grey; with none
  under the pointer, none is selected.
- Right-clicking the selected circle offers "Adjust diameter…", which opens a small window
  with a slider that changes its diameter as it moves.
- Closing that window makes the new diameter one step in the history.
- Undo takes back the last step (a circle drawn, or a diameter adjusted); Redo puts it back,
  until a new step is made.

*Challenge: undo and redo, drawing, and an interaction spread across several steps.*

## 7. Cells

A spreadsheet: rows 0 to 99, columns A to Z, scrollable both ways.
- Double-clicking a cell edits its formula; when the edit ends, the formula is evaluated
  and the cell shows its value.
- A formula is a number, a piece of text, or `=` followed by an expression: numbers, cell
  references (`A1`), ranges (`A1:B5`) inside functions, `+ - * /`, parentheses, and the
  functions `SUM` and `PROD` over a range or a list. A formula that can't be evaluated shows
  an error in its cell.
- When a cell changes, the cells that depend on it are recomputed, and theirs in turn —
  only those, not every cell.
- Build the spreadsheet as a widget of your own, not from a ready-made spreadsheet or grid
  component, and keep the formula language and evaluation apart from the interface.

*Challenge: change propagation, and building a widget of real substance.*

---

## Delivering it

Write it idiomatically, following the platform's established best practices, as code that
other people will read and maintain. Use the ecosystem's established libraries where one
fits, as a maintainer would expect — except where a task says not to.

Check your work in the browser.

The tasks are 7GUIs' (Eugen Kiss, https://eugenkiss.github.io/7guis/); this brief restates
them, filling in what the originals leave open.
