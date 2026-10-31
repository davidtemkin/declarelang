# Layout comprehension

You are learning Declare from its documentation. Read `declarelang/README.md` and
`declarelang/docs/declare.md` in full. Read no other file in `declarelang/`.
You cannot run anything; answer and write from what you have read.

## Part A — predict

Write your answers to `answers.md`, a short paragraph each.

1. A view 300 wide has `layout: SimpleLayout [ axis = y ]`. One child is a `View` with no
   size that holds a `Text [ text = "hi" ]`. How wide is that child, and why? What would you
   write to make it as wide as the column?
2. A view with no size set has `layout: SimpleLayout [ axis = y ]` and two children, each a
   `View` holding a `Text` of different length. You want both children as wide as the wider
   one. What do you write, and where?
3. In a view with `layout: SimpleLayout [ axis = x ]`, a child has `flexes = true` and
   `width = 200`. What happens?
4. A panel should be 300 wide when `app.wide` is true, and as wide as its content otherwise.
   Write the panel.
5. A view's layout is a row when `app.wide` is true and a column otherwise
   (`axis = { app.wide ? "x" : "y" }`). The first child should take whatever room is left
   along the run in both arrangements. What do you write on that child, and what must you
   not write on it?
6. A view with no width has two children: one `View [ width = 120, height = 20 ]` and one
   `View [ width = 100%, height = 20 ]`. How wide is the second child, and why?

## Part B — write

Write each as a complete program in its own file. Use whatever you need from the language.

- `frame.declare` — an App that fills its window: a 48-tall header at the top, a 32-tall
  footer at the bottom, and between them a list area that takes all the remaining space
  beside a 240-wide side panel on its right. When `app.width < 600` the side panel moves
  under the list instead, as a strip 120 tall across the full width.
- `form.declare` — an App 400 wide whose content is a column 360 wide holding a label
  above each of three text fields; every field is as wide as the column. Below them, two
  more fields sit side by side in one row and share its width equally.
- `menu.declare` — an App with a menu: a view with no size set holding five items, each a
  view with a short text label of a different length. Every item is as wide as the widest
  label; nothing in the menu states a width.
