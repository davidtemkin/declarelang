// A clamped Text on the DOM — `maxLines` — cut by the shared rule and laid out
// so the whole text stays in the page. Its own module so a program that never
// names `maxLines` carries none of it (declarec's slim-text-clamp).
//
// The browser's own `-webkit-line-clamp` places its ellipsis after aligning the
// whole line: under `textAlign = center` the ellipsis was half cut, under
// `right` it was gone. So the run is cut here, by measure.ts wrapLines +
// clampLines (what the canvas and the Mac show, and the layout measured), and
// laid out in three parts:
//   · the text up to the cut, which the browser wraps into exactly the kept
//     lines (the rule models its breaks, and the last line was cut to leave
//     room for the ellipsis);
//   · the ellipsis — seen, but `aria-hidden` and unselectable, so it is never
//     read or copied;
//   · the rest, visually hidden (no box, no layout) but selectable and read.
// Selecting and copying the run copies the full text; a screen reader reads it
// whole; nothing on the page draws past the clamp.

import { clampLines, transformText, wrapLines, type TextStyle } from "./measure.js";

export interface ClampRule { max: number; wrap: boolean; font: string; letterSpacing: number; transform: TextStyle["textTransform"] }

/** Fill `el` with `raw` clamped by `rule` at `width`. */
export function renderClamped(el: HTMLElement, raw: string, rule: ClampRule, width: number): void {
  const disp = transformText(raw, rule.transform);
  // cut the RAW text where the lengths agree, so CSS keeps the case transform
  // and a copy is the text as written; else the transformed text, as shown
  const src = disp.length === raw.length ? raw : disp;
  el.style.textTransform = src === raw && rule.transform !== "capitalize" ? (rule.transform ?? "none") : "none";
  const shown = src === raw && rule.transform === "capitalize" ? disp : src;
  const cut = width > 0 ? clampCut(disp, rule, width) : -1;
  el.replaceChildren();
  if (cut < 0) { el.textContent = shown; return; }
  el.append(document.createTextNode(shown.slice(0, cut)));
  const dots = document.createElement("span");
  dots.textContent = "…";
  dots.setAttribute("aria-hidden", "true");
  dots.style.userSelect = "none";
  (dots.style as CSSStyleDeclaration & { webkitUserSelect: string }).webkitUserSelect = "none";
  const rest = document.createElement("span");
  rest.textContent = shown.slice(cut);
  const rs = rest.style;
  rs.position = "absolute"; rs.width = "1px"; rs.height = "1px"; rs.overflow = "hidden";
  rs.clipPath = "inset(50%)"; rs.left = "0"; rs.top = "0";
  rs.whiteSpace = "pre";   // its leading space is part of the copy
  el.append(dots, rest);
}

/** Where the shared rule cuts `text`: the offset its kept text ends at, the
 *  ellipsis to follow it — or -1 when everything fits. The lines come from
 *  wrapLines (a break's space dropped) and the last kept one from ellipsize;
 *  each is found again in the text, in order, to turn it back into an offset. */
function clampCut(text: string, r: ClampRule, width: number): number {
  const all = r.wrap ? wrapLines(text, r.font, width, r.letterSpacing) : text.split("\n");
  const max = r.wrap ? r.max : 1;
  const kept = clampLines(all, max, r.font, width, r.letterSpacing);
  const last = kept[kept.length - 1] ?? "";
  if (!last.endsWith("…") || (kept.length === all.length && kept[kept.length - 1] === all[all.length - 1])) return -1;
  let at = 0;
  for (let i = 0; i < kept.length; i++) {
    const line = i === kept.length - 1 ? last.slice(0, -1) : kept[i];
    while (at < text.length && (text[at] === " " || text[at] === "\n") && line !== "" && text[at] !== line[0]) at++;
    const found = text.indexOf(line, at);
    if (found < 0) return -1;
    at = found + line.length;
  }
  return at;
}
