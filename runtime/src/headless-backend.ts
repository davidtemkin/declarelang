// HeadlessBackend — the no-pixels RenderBackend for executing a program
// WITHOUT a page: static extraction (design/capabilities.md §4–5), verify's
// rung-4 deterministic instantiation, and any tool that needs the settled
// tree but no rendering. Attaching to it runs everything attach always runs —
// auto-extent derives, layout install, text measurement (through the one
// measure.ts seam, injectable via provideMeasurer) — while every Surface push
// lands in a no-op, so the reactive model computes real geometry and the
// backend inks nothing.
//
// The surface implements the FULL Surface interface as typed no-ops — tsc
// keeps it complete, so a new Surface capability cannot silently miss the
// headless path (the lesson of the unit suite's hand-listed mock).

import type { InputSink, RenderBackend, RichBlock, Stretch, Surface, EditableSpec } from "./backend.js";
import type { Fill, Stroke, Shadow } from "./value.js";
import type { TextStyle } from "./measure.js";
import type { DisplayList } from "./draw.js";

class HeadlessSurface implements Surface {
  setX(_v: number): void {}
  setY(_v: number): void {}
  setWidth(_v: number): void {}
  setHeight(_v: number): void {}
  setFill(_fill: Fill): void {}
  setCornerRadius(_r: number): void {}
  setStroke(_stroke: Stroke | null): void {}
  setShadow(_shadow: Shadow | null): void {}
  setVisible(_visible: boolean): void {}
  setOpacity(_opacity: number): void {}
  setScale(_scale: number, _pivotX: number, _pivotY: number): void {}
  setClip(_pathData: string | null): void {}
  setBoxClip(_on: boolean): void {}
  setScroll(_on: boolean, _onScroll: (y: number) => void): void {}
  setScrollX(_on: boolean): void {}
  /** -1 = "this backend cannot flow native rich content" — RichText then lays
   *  its runs out as child views through the shared measurer, exactly the
   *  Canvas fallback, so a headless settle still produces real flow geometry. */
  setRichContent(_blocks: RichBlock[], _selectable: boolean, _width: number, _onResize: (height: number) => void, _onLink: (href: string) => void): number {
    return -1;
  }
  scrollIntoView(): void {}
  // Headless lays a flow out the CANVAS way (setRichContent → -1), so a heading's
  // offset is known: `within >= 0` means "located it" — there is no viewport to
  // scroll, but the anchor resolved. This is what lets extraction/tests observe the
  // reveal without a live surface.
  revealRichAnchor(_slug: string, within: number): boolean { return within >= 0; }
  setEmbed(_id: string): void {}
  setDrawing(_list: DisplayList | null): void {}
  setText(_text: string): void {}
  setTextStyle(_style: TextStyle): void {}
  setImage(_image: HTMLImageElement | null): void {}
  setImageStretch(_stretch: Stretch): void {}
  setInput(_sink: InputSink | null): void {}
  setEditable(_spec: EditableSpec | null): void {}
  activateEditable(_active: boolean): void {}
  insertChild(_child: Surface, _before: Surface | null): void {}
  destroy(): void {}
}

export class HeadlessBackend implements RenderBackend {
  createSurface(): Surface {
    return new HeadlessSurface();
  }
  /** No page to root into — the tree lives (and settles) unrooted. */
  attachRoot(_host: HTMLElement, _root: Surface): void {}
}
