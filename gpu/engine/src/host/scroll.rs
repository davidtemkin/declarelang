//! The scroll process (as LayerTree.swift's): a wheel over a scroller is the host's, the
//! offset moves here, the frame shows it, and the runtime hears the fact afterwards. With it,
//! the overlay scrollbar and the touch session's offsets (its physics is the platform's), and
//! scroll layers: a scroller's content kept in tiles, so a scroll moves textures.
//!
//! A scroller whose content a layer can keep (nothing that reads what is beneath it — frost,
//! blends, masks — and no filters, 3D or video) draws its content once into tiles: bands 512
//! device pixels tall across its width (or 512-pixel squares when it scrolls across), in its
//! content's own space at the scale it is seen at. A frame places the tiles it needs at whole
//! device pixels under the scroller's clip; a tile is drawn again only when what is in it
//! changes, or the first time it is needed. Pinned children (ignoreScroll) and those that
//! escape the clip are drawn as before. A layer inside a layer is not made: the inner scroller
//! is drawn into the outer one's tiles. A new scale or tile size is a new set of tiles.

use std::collections::HashMap;

use super::geom::*;
use super::ct;
use super::{Glide, Host, ScrollLayer, Tile, LayerCache, MEDIA_KEY};
use crate::Engine;

/// How long (ms) a scroller stays a layer after it last moved.
const LAYER_REST: f64 = 1000.0;
/// A wheel notch's glide: an ease-out over 160 ms, near the browser's own for a mouse wheel.
const WHEEL_GLIDE_MS: f64 = 160.0;
const WHEEL_GLIDE: [f64; 4] = [0.2, 0.6, 0.35, 1.0];

/// A scrollbar's geometry along its axis (bar_geom).
pub(crate) struct Bar { start: f64, len: f64, thumb: f64, pos: f64, ext: f64, view: f64 }

/// The overlay scrollbar under a mouse (the Mac's, as Chromium's cocoa_scroll_bar and
/// native_theme_mac measure it): a THIN thumb INSET from the edge; under the pointer a THICK
/// thumb on a TRACK-wide band; the track's ends END in, the thumb at least MIN long; whole until
/// DELAY ms after the pane last moved, then fading over FADE.
const BAR_THIN: f64 = 6.0;
const BAR_THICK: f64 = 10.0;
const BAR_TRACK: f64 = 16.0;
const BAR_INSET: f64 = 3.0;
const BAR_END: f64 = 2.0;
const BAR_MIN: f64 = 18.0;
const BAR_DELAY: f64 = 500.0;
const BAR_FADE: f64 = 240.0;
/// Under a finger, iOS's indicator (as Flutter's CupertinoScrollbar measures it): THIN, MARGIN
/// from the edge, at least MIN long, whole until DELAY then fading over FADE; held still HOLD ms
/// it takes the finger and grows to HELD, and dragging scrubs.
const TOUCH_THIN: f64 = 3.0;
const TOUCH_HELD: f64 = 8.0;
const TOUCH_MARGIN: f64 = 3.0;
const TOUCH_MIN: f64 = 36.0;
const TOUCH_DELAY: f64 = 1200.0;
const TOUCH_FADE: f64 = 250.0;
const TOUCH_HOLD: f64 = 100.0;

impl Host {
    /// The range may have shrunk under the offset: re-clamp, and say so.
    pub(crate) fn clamp_scroll(&mut self, id: u32) {
        let (vw, vh) = self.viewport(id);
        let (ey, ex) = (self.extent_y(id), self.extent_x(id));
        let n = self.nm(id);
        let y = jmin(jmax(0.0, ey - vh), jmax(0.0, n.scroll_y));
        let x = jmin(jmax(0.0, ex - vw), jmax(0.0, n.scroll_x));
        if y != n.scroll_y || x != n.scroll_x { n.scroll_y = y; n.scroll_x = x; self.fact(id); }
    }

    /// A wheel at a page point: 1 when an `onWheel` view nearest under it hears the stream
    /// (the runtime delivers it), 2 when a scroller took it here (followed by the scrollers
    /// that own it, whose quiet timers the platform restarts), 0 when nothing did.
    pub(crate) fn wheel(&mut self, x: f64, y: f64, dx: f64, dy: f64, pinch: bool, notch: bool) -> Vec<f64> {
        let Some(root) = self.root else { return vec![0.0] };
        let Some(t) = self.wheel_walk(root, &I, x, y) else { return vec![0.0] };
        if self.nd(t).wants_wheel { return vec![1.0]; }
        if pinch { return vec![0.0]; }                       // a pinch is nobody's scroll
        let take = |h: &Host, vertical: bool| -> Option<u32> {
            let mut m = Some(t);
            while let Some(i) = m {
                if h.page_root(i) { break; }               // the page's own scroll is the browser's
                let (vw, vh) = h.viewport(i);
                let n = h.nd(i);
                if vertical && n.scrolls && h.extent_y(i) > vh + 0.5 { return Some(i); }
                if !vertical && (n.scrolls_x || (Some(i) == h.root && n.scrolls)) && h.extent_x(i) > vw + 0.5 { return Some(i); }
                m = n.parent;
            }
            None
        };
        let mut owners: Vec<u32> = Vec::new();
        if dy != 0.0 { if let Some(n) = take(self, true) { self.step(n, true, dy, notch); owners.push(n); } }   // contained: owned even at its limit
        if dx != 0.0 { if let Some(n) = take(self, false) { self.step(n, false, dx, notch); if !owners.contains(&n) { owners.push(n); } } }
        // a browser's wheel has no phases: `userScrolling` rises with the first delta and settles
        // 120 ms after the last (the Mac host's rule for a plain wheel; the timer is the platform's)
        for &n in &owners {
            if !self.nd(n).scrolling_live { self.nm(n).scrolling_live = true; self.fact(n); }
            self.nm(n).quiet = true;
        }
        if owners.is_empty() { return vec![0.0]; }
        let mut out = vec![2.0];
        out.extend(owners.iter().map(|&n| n as f64));
        out
    }
    /// A step moves the pane at once, or — a wheel's notch — glides there, a further notch
    /// adding to where the glide is going.
    fn step(&mut self, id: u32, vertical: bool, d: f64, notch: bool) {
        let (vw, vh) = self.viewport(id);
        let lim = if vertical { jmax(0.0, self.extent_y(id) - vh) } else { jmax(0.0, self.extent_x(id) - vw) };
        let n = self.nm(id);
        let now = if vertical { n.scroll_y } else { n.scroll_x };
        let going = if notch { n.glide.iter().find(|g| g.y == vertical && g.wheel).map(|g| g.to) } else { None };
        let next = jmin(lim, jmax(0.0, going.unwrap_or(now) + d));
        n.glide.retain(|g| g.y != vertical);
        if notch {
            if next != now {
                n.glide.push(Glide { y: vertical, from: now, to: next, start: crate::now(), ms: WHEEL_GLIDE_MS, b: WHEEL_GLIDE, wheel: true });
                if !self.gliding.contains(&id) { self.gliding.push(id); }
                self.wants.tick = true;
            }
        } else if next != now {
            if vertical { n.scroll_y = next; } else { n.scroll_x = next; }
            self.moved(id);
        }
    }
    /// A wheel's stream went quiet (120 ms after its last delta).
    pub(crate) fn quiet(&mut self, id: u32) {
        let Some(n) = self.nodes.get_mut(&id) else { return };
        n.quiet = false;
        if n.glide.is_empty() && n.scrolling_live { n.scrolling_live = false; self.fact(id); }
    }
    fn wheel_walk(&self, id: u32, parent: &M, px: f64, py: f64) -> Option<u32> {
        let n = self.nd(id);
        if !n.visible || n.opacity <= 0.0 { return None; }
        let m = mul(parent, &self.local(id));
        let (lx, ly) = unmap(&m, px, py);
        let in_box = lx >= 0.0 && ly >= 0.0 && lx < n.w && ly < n.h;
        let scroller = n.scrolls || n.scrolls_x;
        if (n.box_clip || scroller) && !in_box && Some(id) != self.root { return None; }
        let inner = if n.scroll_x != 0.0 || n.scroll_y != 0.0 { mul(&m, &translate(-n.scroll_x, -n.scroll_y)) } else { m };
        let kids = self.order(id);
        for pass in [true, false] {
            for &k in kids.iter().rev() {
                let kn = self.nd(k);
                if kn.ignore_clip != pass { continue; }
                if let Some(h) = self.wheel_walk(k, if kn.ignore_scroll { &m } else { &inner }, px, py) { return Some(h); }
            }
        }
        if n.wants_wheel && in_box { return Some(id); }
        if scroller && (in_box || Some(id) == self.root) { Some(id) } else { None }
    }

    // ── the overlay scrollbar, the fallback where the platform does not scroll for us (an
    // inner pane): hidden at rest, a thin thumb while the pane moves, fading a beat after;
    // under the pointer a thicker thumb on a track, held while dragged; a press on a hidden bar
    // is the program's. Under a finger, iOS's indicator: thinner, held to scrub. ──

    /// A bar's geometry along its axis: the track's start and length, the thumb's place and
    /// length, the content's extent and the viewport's.
    fn bar_geom(&self, id: u32, vertical: bool) -> Option<Bar> {
        let n = self.nd(id);
        if self.page_root(id) || if vertical { !n.scrolls } else { !n.scrolls_x } { return None; }
        let (vw, vh) = self.viewport(id);
        let (ext, view) = if vertical { (self.extent_y(id), vh) } else { (self.extent_x(id), vw) };
        if ext <= view + 1.0 { return None; }
        let other = if vertical { n.scrolls_x && self.extent_x(id) > vw + 1.0 } else { n.scrolls && self.extent_y(id) > vh + 1.0 };
        let touch = n.bar_touch;
        let start = if touch { TOUCH_MARGIN } else { BAR_END };
        let corner = if !other { 0.0 } else if touch { TOUCH_MARGIN + TOUCH_HELD } else { BAR_TRACK };
        let len = view - 2.0 * start - corner;
        let thumb = jmin(len, jmax(if touch { TOUCH_MIN } else { BAR_MIN }, view / ext * len));
        let (off, max) = (if vertical { n.scroll_y } else { n.scroll_x }, ext - view);
        let pos = start + if max > 0.0 { off / max * (len - thumb) } else { 0.0 };
        Some(Bar { start, len, thumb, pos, ext, view })
    }
    /// How much of a pane's bar shows now: whole while held or under the pointer, else whole
    /// until the delay after the pane last moved, then fading to nothing.
    fn bar_alpha(&self, id: u32, now: f64) -> f64 {
        let n = self.nd(id);
        if n.bar_held || (n.bar_wide && self.bar_hover == Some(id)) { return 1.0; }
        let (delay, fade) = if n.bar_touch { (TOUCH_DELAY, TOUCH_FADE) } else { (BAR_DELAY, BAR_FADE) };
        let e = now - n.bar_seen;
        if e < delay { 1.0 } else { jmax(0.0, 1.0 - (e - delay) / fade) }
    }
    /// Whether the pane's bar sits on dark content (the nearest solid fill up from it, or the
    /// page's): a light thumb then, as the platform's.
    fn bar_on_dark(&self, id: u32) -> bool {
        let mut k = Some(id);
        let mut c = self.page.unwrap_or(0xffff_ffff);
        while let Some(i) = k {
            let n = self.nd(i);
            if let Some(f) = n.fill.filter(|f| f & 255 >= 128) { c = f; break; }
            k = n.parent;
        }
        let (r, g, b) = (((c >> 24) & 255) as f64, ((c >> 16) & 255) as f64, ((c >> 8) & 255) as f64);
        (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0 < 0.5
    }
    /// The pane's bars as rounded rects in its own viewport space: rect, corner, colour.
    fn bar_rects(&self, id: u32) -> Vec<([f64; 4], f64, u32)> {
        let a = self.bar_alpha(id, crate::now());
        if a <= 0.0 { return Vec::new(); }
        let n = self.nd(id);
        let (vw, vh) = self.viewport(id);
        let dark = self.bar_on_dark(id);
        let fade = |c: u32| (c & !255) | (((c & 255) as f64) * a).round() as u32;
        let mut out = Vec::new();
        for vertical in [true, false] {
            let Some(g) = self.bar_geom(id, vertical) else { continue };
            let cross = if vertical { vw } else { vh };
            let along = |c0: f64, t: f64, p: f64, l: f64| if vertical { [c0, p, t, l] } else { [p, c0, l, t] };
            if n.bar_touch {
                let t = if n.bar_held { TOUCH_HELD } else { TOUCH_THIN };
                out.push((along(cross - TOUCH_MARGIN - t, t, g.pos, g.thumb), t / 2.0, fade(if dark { 0xffff_ff80 } else { 0x0000_0059 })));
                continue;
            }
            if n.bar_wide {
                let c0 = cross - BAR_TRACK;
                out.push((along(c0, BAR_TRACK, 0.0, g.view), 0.0, fade(if dark { 0xcccc_cc26 } else { 0xf8f8_f8c4 })));
                out.push((along(c0, 1.0, 0.0, g.view), 0.0, fade(if dark { 0xe5e5_e533 } else { 0xdfdf_dff9 })));
            }
            let t = if n.bar_wide { BAR_THICK } else { BAR_THIN };
            out.push((along(cross - BAR_INSET - t, t, g.pos, g.thumb), t / 2.0, fade(if dark { 0xffff_ff80 } else { 0x0000_0080 })));
        }
        out
    }
    pub(crate) fn paint_bar(&mut self, id: u32, m: &M) {
        for (r, rad, c) in self.bar_rects(id) {
            self.cmd.op(0, m); self.cmd.n4(r[0], r[1], r[2], r[3]); self.cmd.n4(rad, rad, rad, rad); self.cmd.num(c as f64);
        }
    }
    /// A pane moved: its bars show, and fade from now (`touch`: moved by a finger).
    pub(crate) fn bar_shows(&mut self, id: u32, touch: bool) {
        let Some(n) = self.nodes.get_mut(&id) else { return };
        n.bar_seen = crate::now();
        n.bar_touch = touch;
        if !self.fading.contains(&id) { self.fading.push(id); }
        self.wants.tick = true;
    }
    /// The bars on the animation frames: those fading redraw, and a finger held on an
    /// indicator takes it. True while any is left.
    fn tick_bars(&mut self, now: f64) -> bool {
        let fading = std::mem::take(&mut self.fading);
        let mut left = Vec::new();
        for id in fading {
            if !self.nodes.contains_key(&id) { continue; }
            let a = self.bar_alpha(id, now);
            if a != self.nd(id).bar_drawn { self.nm(id).bar_drawn = a; self.change(id); self.dirty = true; }
            if a > 0.0 { left.push(id); }
        }
        self.fading = left;
        if let Some((n, m, vertical, t0, _, _, along)) = self.bar_press {
            if now - t0 >= TOUCH_HOLD {
                self.bar_press = None;
                if let Some(g) = self.nodes.get(&n).and_then(|_| self.bar_geom(n, vertical)) {
                    let grab = jmin(g.thumb, jmax(0.0, along - g.pos));
                    self.bar_drag = Some((n, m, grab, vertical));
                    self.nm(n).bar_held = true; self.fact(n); self.change(n); self.dirty = true;
                }
            }
        }
        !self.fading.is_empty() || self.bar_press.is_some()
    }
    /// The innermost pane whose showing bar's band (its last BAR_TRACK px on an axis it
    /// scrolls) is under a page point, with the pane's transform and the bar's axis.
    fn bar_at(&self, x: f64, y: f64) -> Option<(u32, M, bool)> {
        fn walk(h: &Host, id: u32, parent: &M, x: f64, y: f64, now: f64) -> Option<(u32, M, bool)> {
            let n = h.nd(id);
            if !n.visible { return None; }
            let m = mul(parent, &h.local(id));
            let (lx, ly) = unmap(&m, x, y);
            let (vw, vh) = h.viewport(id);
            let in_box = lx >= 0.0 && ly >= 0.0 && lx < vw && ly < vh;
            if (n.scrolls || n.scrolls_x) && !in_box && Some(id) != h.root { return None; }
            let inner = if n.scroll_x != 0.0 || n.scroll_y != 0.0 { mul(&m, &translate(-n.scroll_x, -n.scroll_y)) } else { m };
            for &k in h.order(id).iter().rev() {
                if let Some(r) = walk(h, k, if h.nd(k).ignore_scroll { &m } else { &inner }, x, y, now) { return Some(r); }
            }
            if !in_box || h.bar_alpha(id, now) <= 0.0 { return None; }
            if lx >= vw - BAR_TRACK && h.bar_geom(id, true).is_some() { return Some((id, m, true)); }
            if ly >= vh - BAR_TRACK && h.bar_geom(id, false).is_some() { return Some((id, m, false)); }
            None
        }
        walk(self, self.root?, &I, x, y, crate::now())
    }
    fn widen(&mut self, id: Option<u32>, on: bool) {
        let Some(id) = id else { return };
        let Some(n) = self.nodes.get_mut(&id) else { return };
        if n.bar_wide == on { return; }
        n.bar_wide = on; self.change(id); self.dirty = true;
        // leaving it, the bar fades from now
        if !on { self.bar_shows(id, false); }
    }
    fn scrub(&mut self, id: u32, vertical: bool, thumb_at: f64) {
        let Some(g) = self.bar_geom(id, vertical) else { return };
        let span = g.len - g.thumb;
        let frac = if span > 0.0 { jmin(1.0, jmax(0.0, (thumb_at - g.start) / span)) } else { 0.0 };
        let next = frac * (g.ext - g.view);
        let n = self.nm(id);
        if (if vertical { n.scroll_y } else { n.scroll_x }) == next { return; }
        if vertical { n.scroll_y = next; } else { n.scroll_x = next; }
        n.glide.retain(|gl| gl.y != vertical);
        let touch = n.bar_touch;
        self.moved(id);
        self.bar_shows(id, touch);
    }
    /// Whether a bar is being dragged (the touch session stands down while a finger scrubs).
    pub(crate) fn bar_scrubbing(&self) -> bool { self.bar_drag.is_some() }
    /// A pointer event, before the program hears it: true when the bar took it (the program
    /// does not hear a press on the bar, nor the drag it starts).
    pub(crate) fn bar_pointer(&mut self, kind: &str, x: f64, y: f64, pointer: &str) -> bool {
        if let Some((n, m, grab, vertical)) = self.bar_drag {
            if !self.nodes.contains_key(&n) { self.bar_drag = None; return true; }
            let (lx, ly) = unmap(&m, x, y);
            if kind == "pointermove" { self.scrub(n, vertical, if vertical { ly } else { lx } - grab); return true; }
            if kind == "pointerup" || kind == "pointercancel" {
                self.bar_drag = None;
                self.nm(n).bar_held = false; self.fact(n); self.change(n); self.dirty = true;
                let touch = self.nd(n).bar_touch;
                if Some(n) != self.bar_hover { self.widen(Some(n), false); }
                self.bar_shows(n, touch);
            }
            return true;
        }
        if pointer == "touch" {
            // a finger held still on a showing indicator takes it (tick_bars); moving first, it scrolls
            match kind {
                "pointerdown" => if let Some((n, m, vertical)) = self.bar_at(x, y).filter(|b| self.nd(b.0).bar_touch) {
                    let (lx, ly) = unmap(&m, x, y);
                    let along = if vertical { ly } else { lx };
                    if let Some(g) = self.bar_geom(n, vertical).filter(|g| along >= g.pos - 10.0 && along <= g.pos + g.thumb + 10.0) {
                        let _ = g;
                        self.bar_press = Some((n, m, vertical, crate::now(), x, y, along));
                        self.wants.tick = true;
                    }
                },
                "pointermove" => if let Some(p) = self.bar_press { if (x - p.4).abs() + (y - p.5).abs() > 8.0 { self.bar_press = None; } },
                _ => self.bar_press = None,
            }
            return false;
        }
        if kind == "pointermove" {
            let f = self.bar_at(x, y).map(|b| b.0);
            if f != self.bar_hover { let was = self.bar_hover; self.bar_hover = f; self.widen(was, false); self.widen(f, true); }
            return false;
        }
        if kind == "pointerout" { let was = self.bar_hover; self.bar_hover = None; self.widen(was, false); return false; }
        if kind != "pointerdown" { return false; }
        let Some((n, m, vertical)) = self.bar_at(x, y) else { return false };
        let g = self.bar_geom(n, vertical).unwrap();
        let (lx, ly) = unmap(&m, x, y);
        let (along, across) = if vertical { (ly, lx) } else { (lx, ly) };
        let (vw, vh) = self.viewport(n);
        // the claim is the painted bar: the track when wide, else the thumb's own strip
        let band = if self.nd(n).bar_wide { BAR_TRACK } else { BAR_INSET + BAR_THIN + 2.0 };
        if across < (if vertical { vw } else { vh }) - band { return false; }
        let mut grab = along - g.pos;
        if grab < 0.0 || grab > g.thumb { self.scrub(n, vertical, along - g.thumb / 2.0); grab = g.thumb / 2.0; }
        self.bar_drag = Some((n, m, grab, vertical));
        self.nm(n).bar_held = true; self.fact(n);
        self.bar_hover = Some(n);
        self.widen(Some(n), true);
        true
    }

    // ── touch: the platform's scroll session (drag, momentum, rubber band) over the pane
    // under an unclaimed finger; here only its offsets. The fact stays clamped; the rubber
    // band is only what is shown. ──

    /// The innermost pane under a page point with somewhere to scroll (-1: none).
    pub(crate) fn pane_at(&self, x: f64, y: f64) -> Option<u32> {
        fn walk(h: &Host, id: u32, parent: &M, x: f64, y: f64) -> Option<u32> {
            let n = h.nd(id);
            if !n.visible { return None; }
            let m = mul(parent, &h.local(id));
            let (lx, ly) = unmap(&m, x, y);
            let (vw, vh) = h.viewport(id);
            let in_box = lx >= 0.0 && ly >= 0.0 && lx < vw && ly < vh;
            if (n.box_clip || n.scrolls || n.scrolls_x) && !in_box && Some(id) != h.root { return None; }
            let inner = if n.scroll_x != 0.0 || n.scroll_y != 0.0 { mul(&m, &translate(-n.scroll_x, -n.scroll_y)) } else { m };
            for &k in h.order(id).iter().rev() {
                if let Some(r) = walk(h, k, if h.nd(k).ignore_scroll { &m } else { &inner }, x, y) { return Some(r); }
            }
            let can = (n.scrolls && h.extent_y(id) > vh + 0.5) || (n.scrolls_x && h.extent_x(id) > vw + 0.5);
            if can && !h.page_root(id) && (in_box || Some(id) == h.root) { Some(id) } else { None }
        }
        walk(self, self.root?, &I, x, y)
    }
    /// What a touch session needs of a pane: viewport w h, content w h (its viewport's on an
    /// axis it does not scroll), offset x y.
    pub(crate) fn scroll_info(&self, id: u32) -> Vec<f64> {
        let Some(n) = self.nodes.get(&id) else { return Vec::new() };
        let (vw, vh) = self.viewport(id);
        vec![vw, vh, if n.scrolls_x { self.extent_x(id) } else { vw }, if n.scrolls { self.extent_y(id) } else { vh }, n.scroll_x, n.scroll_y]
    }
    /// A touch session began on a pane: its glides stop.
    pub(crate) fn touch_start(&mut self, id: u32) { if let Some(n) = self.nodes.get_mut(&id) { n.glide.clear(); } }
    /// A touch session's drag started: the pane is scrolling.
    pub(crate) fn touch_live(&mut self, id: u32) { if let Some(n) = self.nodes.get_mut(&id) { n.scrolling_live = true; self.fact(id); } }
    /// A touch session's state: the content offset and the overscroll shown past it.
    pub(crate) fn touch_apply(&mut self, id: u32, ox: f64, oy: f64, over_x: f64, over_y: f64) {
        if !self.nodes.contains_key(&id) { return; }
        let (vw, vh) = self.viewport(id);
        let (ey, ex) = (self.extent_y(id), self.extent_x(id));
        let n = self.nm(id);
        let mut moved = false;
        if n.scrolls {
            n.vis_y = Some(oy - over_y);
            let y = jmin(jmax(0.0, ey - vh), jmax(0.0, oy));
            if y != n.scroll_y { n.scroll_y = y; moved = true; }
        }
        if n.scrolls_x {
            n.vis_x = Some(ox - over_x);
            let x = jmin(jmax(0.0, ex - vw), jmax(0.0, ox));
            if x != n.scroll_x { n.scroll_x = x; moved = true; }
        }
        if moved { self.fact(id); self.bar_shows(id, true); }
        self.change(id); self.dirty = true;
    }
    /// A touch session ended (its momentum and spring done).
    pub(crate) fn touch_end(&mut self, id: u32) {
        let Some(n) = self.nodes.get_mut(&id) else { return };
        n.vis_y = None; n.vis_x = None; n.scrolling_live = false;
        self.fact(id); self.change(id);
    }

    /// Glides — a request's own tween — step on the animation frames: true while any is left.
    pub(crate) fn tick_glides(&mut self) -> bool {
        let now = crate::now();
        let gliding = std::mem::take(&mut self.gliding);
        let mut left = Vec::new();
        for id in gliding {
            if !self.nodes.contains_key(&id) { continue; }
            let glides = std::mem::take(&mut self.nm(id).glide);
            for g in &glides {
                let p = jmin(1.0, (now - g.start) / g.ms);
                let v = g.from + (g.to - g.from) * bezier_at(&g.b, p);
                let n = self.nm(id);
                if g.y && v != n.scroll_y { n.scroll_y = v; self.moved(id); }
                else if !g.y && v != n.scroll_x { n.scroll_x = v; self.moved(id); }
            }
            let n = self.nm(id);
            n.glide = glides.into_iter().filter(|g| now - g.start < g.ms).collect();
            if n.glide.is_empty() {
                if !n.quiet && n.scrolling_live { n.scrolling_live = false; self.fact(id); }
            } else { left.push(id); }
        }
        self.gliding = left;
        let bars = self.tick_bars(now);
        !self.gliding.is_empty() || bars
    }

    // ── scroll layers ──────────────────────────────────────────────────────────

    /// The scroller's own viewport box on the screen.
    pub(crate) fn view_box(&self, id: u32, m: &M) -> Rect { let (vw, vh) = self.viewport(id); aabb(m, 0.0, 0.0, vw, vh) }

    /// The nearest scroller layer whose tiles hold `id` (None: it is drawn to the screen).
    pub(crate) fn layer_of(&self, id: u32) -> Option<u32> {
        let (mut k, mut p) = (id, self.nd(id).parent);
        while let Some(pi) = p {
            let pn = self.nd(pi);
            let kn = self.nd(k);
            if pn.layer.as_ref().is_some_and(|l| l.used) && !kn.ignore_scroll && !kn.ignore_clip { return Some(pi); }
            k = pi; p = pn.parent;
        }
        None
    }
    pub(crate) fn invalidate(&mut self, l: u32, r: &Rect) {
        let ly = self.nm(l).layer.as_mut().unwrap();
        let (w, h) = (ly.w, ly.h);
        for (&(tx, ty), t) in ly.tiles.iter_mut() {
            if !t.ok { continue; }
            // the part of the tile it meets, two pixels out for antialiasing, on whole pixels
            let (ox, oy) = (tx as f64 * w, ty as f64 * h);
            let x0 = jmax(0.0, (r.x0 - ox - 2.0).floor());
            let y0 = jmax(0.0, (r.y0 - oy - 2.0).floor());
            let x1 = jmin(w, (r.x1 - ox + 2.0).ceil());
            let y1 = jmin(h, (r.y1 - oy + 2.0).ceil());
            if x1 <= x0 || y1 <= y0 { continue; }
            t.dirty = Some(match t.dirty { None => Rect { x0, y0, x1, y1 }, Some(d) => Rect { x0: jmin(d.x0, x0), y0: jmin(d.y0, y0), x1: jmax(d.x1, x1), y1: jmax(d.y1, y1) } });
        }
    }
    pub(crate) fn drop_layer(&mut self, e: &mut Engine, id: u32) {
        let Some(mut ly) = self.nm(id).layer.take() else { return };
        Self::drop_tiles(e, &mut ly);
    }
    /// A layer's textures go (it is not drawn through for now).
    fn drop_tiles(e: &mut Engine, ly: &mut ScrollLayer) {
        for t in ly.tiles.values() { e.tile_drop(t.id); }
        ly.tiles.clear();
        if let Some(c) = ly.cache.take() { e.cache_drop(c.below); e.cache_drop(c.above); }
    }
    /// Before the damage: a change inside a layer redoes the tiles under it (where it was and
    /// where it is), and shows on the screen as a change of the layer's box.
    pub(crate) fn layer_changes(&mut self) {
        let changed = self.changed.clone();
        for n in changed {
            if !self.nodes.contains_key(&n) { continue; }
            let Some(l) = self.layer_of(n) else { continue };
            self.changed_set.remove(&n);
            self.changed.retain(|&k| k != n);
            self.change(l);
            if let Some(p) = self.nd(n).painted { self.invalidate(l, &p); }
            if let Some(now) = self.content_bounds(l, n) { self.invalidate(l, &now); }
            // what came in may be something a layer cannot keep
            if !self.keepable(n) { self.nm(l).layer.as_mut().unwrap().eligible = false; }
        }
    }
    /// Where `id` now draws in layer L's content-device space.
    fn content_bounds(&self, l: u32, id: u32) -> Option<Rect> {
        let ly = self.nd(l).layer.as_ref().unwrap();
        let mut chain = Vec::new();
        let mut k = Some(id);
        while let Some(i) = k { if i == l { break; } chain.push(i); k = self.nd(i).parent; }
        chain.reverse();
        let mut m: M = [ly.k, 0.0, 0.0, ly.k, ly.fx, ly.fy];
        for &k in &chain {
            let kn = self.nd(k);
            if !kn.visible || kn.opacity <= 0.0 { return None; }
            m = mul(&m, &self.local(k));
            if k != id && (kn.scroll_x != 0.0 || kn.scroll_y != 0.0) { m = mul(&m, &translate(-kn.scroll_x, -kn.scroll_y)); }
        }
        self.subtree_bounds(id, &m)
    }
    /// Can a layer keep this subtree: nothing in it reads what is beneath it or needs its own pass.
    fn keepable(&self, id: u32) -> bool {
        let n = self.nd(id);
        if n.backdrop.is_some() || n.filters.is_some() || n.three || n.mask.is_some() || n.blend != 0.0 { return false; }
        if let Some(i) = n.image { if (MEDIA_KEY..MEDIA_KEY + 0x100_0000).contains(&i) { return false; } }
        n.children.iter().all(|&c| self.keepable(c))
    }
    /// Draw `id`'s content through its layer this frame, or not.
    pub(crate) fn layer_for(&mut self, e: &mut Engine, id: u32, m: &M) -> bool {
        if let Some(l) = self.nm(id).layer.as_mut() { l.used = false; }
        let n = self.nd(id);
        if !self.flags.layers || !(n.scrolls || n.scrolls_x) || self.in_layer_tile > 0 || self.in_layer.is_some() || self.in_flat.is_some() { return false; }
        // a scroller at rest is drawn with the frame: a layer costs a pass of its own, and pays
        // only while it moves
        let (sx, sy, now) = (n.vis_x.unwrap_or(n.scroll_x), n.vis_y.unwrap_or(n.scroll_y), crate::now());
        let n = self.nm(id);
        if sx != n.seen_x || sy != n.seen_y { n.seen_x = sx; n.seen_y = sy; n.scrolled_at = now; }
        if now - n.scrolled_at > LAYER_REST { self.drop_layer(e, id); return false; }
        if m[1].abs() > 1e-9 || m[2].abs() > 1e-9 || m[0] <= 0.0 || (m[0] - m[3]).abs() > 1e-9 { self.drop_layer(e, id); return false; }
        // the tiles are laid on the frame outside the Vello scene, cut only by a rectangle: no
        // ancestor (nor the scroller) may fade, blend, mask or shape them, or round the clip
        let mut a = Some(id);
        while let Some(i) = a {
            let an = self.nd(i);
            if an.opacity < 1.0 || an.blend != 0.0 || an.mask.is_some() || an.shaped || an.filters.is_some() || an.three
                || (self.clips_kids(i) && an.radii.iter().any(|&r| r > 0.0)) { self.drop_layer(e, id); return false; }
            a = an.parent;
        }
        let k = m[0];
        let (vw, vh) = self.viewport(id);
        let n = self.nd(id);
        let w = if n.scrolls_x { 512.0 } else { jmin(4096.0, ((vw * k) / 64.0).ceil() * 64.0) };
        let h = if n.scrolls { 512.0 } else { jmin(4096.0, ((vh * k) / 64.0).ceil() * 64.0) };
        let (fx, fy) = (m[4] - m[4].floor(), m[5] - m[5].floor());
        let fresh = match &n.layer { None => true, Some(ly) => ly.k != k || ly.w != w || ly.h != h || (ly.fx - fx).abs() > 1e-3 || (ly.fy - fy).abs() > 1e-3 };
        if fresh {
            self.drop_layer(e, id);
            self.nm(id).layer = Some(ScrollLayer { k, w, h, fx, fy, tiles: HashMap::default(), eligible: false, checked: -1, used: false, cache: None });
        }
        let keep_gen = self.keep_gen;
        if !self.nd(id).layer.as_ref().unwrap().eligible {
            // it may be now, if anything that decides it has changed since it was last looked at
            if self.nd(id).layer.as_ref().unwrap().checked == keep_gen { return false; }
            let eligible = self.nd(id).children.iter().all(|&c| { let cn = self.nd(c); cn.ignore_scroll || cn.ignore_clip || self.keepable(c) });
            let ly = self.nm(id).layer.as_mut().unwrap();
            ly.checked = keep_gen;
            ly.eligible = eligible;
            if !eligible { Self::drop_tiles(e, ly); return false; }
            for t in ly.tiles.values_mut() { t.ok = false; }
        }
        self.nm(id).layer.as_mut().unwrap().used = true;
        true
    }
    /// Draw `id`'s scrolling content from its tiles, making the ones not kept.
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn paint_layer(&mut self, e: &mut Engine, id: u32, m: &M, within: &Rect, pixelated: bool, sx: f64, sy: f64) {
        // what is below goes onto the frame, then the tiles over it, under the scroller's clip
        self.cut(e);
        if Some(id) == self.only && self.in_frame_cmd {
            // a frame about this layer alone: what lies under it is kept, and (in frame) what over it
            let ids = match &self.nd(id).layer.as_ref().unwrap().cache { Some(c) => (c.below, c.above), None => { let v = (self.layer_ids, self.layer_ids + 1); self.layer_ids += 2; v } };
            let region = self.frame_clip;
            self.nm(id).layer.as_mut().unwrap().cache = Some(LayerCache { region, below: ids.0, above: ids.1, m: *m, within: *within, pixelated });
            e.frame_keep(ids.0);
            self.above_for = Some(id); self.cuts_after = 0;           // counted until the frame's last cut
        }
        self.lay_tiles(e, id, m, within, pixelated, sx, sy);
    }

    /// The layer this frame's changes all belong to: its own scroll (nothing else of it
    /// changed), and changes inside its content. None when anything else changed.
    pub(crate) fn only_layer(&self) -> Option<u32> {
        if !self.lost.is_empty() || self.changed.is_empty() { return None; }
        let mut l: Option<u32> = None;
        for &n in &self.changed {
            if !self.nodes.contains_key(&n) { return None; }
            let nn = self.nd(n);
            let here = if nn.layer.as_ref().is_some_and(|x| x.used) && !self.touched.contains(&n) { Some(n) } else { self.layer_of(n) };
            match here { None => return None, Some(h) => { if l.is_some_and(|x| x != h) { return None; } l = Some(h); } }
        }
        l
    }

    /// A layer's scrollbar, as paint_bar draws it, by the compositor over the frame.
    pub(crate) fn composite_bar(&mut self, e: &mut Engine, id: u32, m: &M, clip: &Rect) {
        let k = m[0];
        let b = intersect(clip, &self.view_box(id, m));
        let f = |v: f64| v as f32;
        for (r, rad, c) in self.bar_rects(id) {
            let (x0, y0, x1, y1) = (m[4] + r[0] * k, m[5] + r[1] * k, m[4] + (r[0] + r[2]) * k, m[5] + (r[1] + r[3]) * k);
            e.frame_rrect(f(x0), f(y0), f(x1), f(y1), f(rad * k), c, f(b.x0), f(b.y0), f(b.x1), f(b.y1));
        }
    }

    /// The tiles a frame needs, made where not kept, laid over the frame.
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn lay_tiles(&mut self, e: &mut Engine, id: u32, m: &M, within: &Rect, pixelated: bool, sx: f64, sy: f64) {
        let (k, w, h, lfx, lfy) = { let ly = self.nd(id).layer.as_ref().unwrap(); (ly.k, ly.w, ly.h, ly.fx, ly.fy) };
        // where content-device (0, 0) lands on the screen, on a whole pixel
        let ox = m[4].floor() - jround(sx * k);
        let oy = m[5].floor() - jround(sy * k);
        let vis = intersect(within, &self.view_box(id, m));
        if vis.x1 <= vis.x0 || vis.y1 <= vis.y0 { return; }
        let (tx0, tx1) = (((vis.x0 - ox) / w).floor() as i64, ((vis.x1 - 1.0 - ox) / w).floor() as i64);
        let (ty0, ty1) = (((vis.y0 - oy) / h).floor() as i64, ((vis.y1 - 1.0 - oy) / h).floor() as i64);
        let kids: Vec<u32> = self.stacked(id).into_iter().filter(|&c| { let cn = self.nd(c); !cn.ignore_scroll && !cn.ignore_clip }).collect();
        let cm: M = [k, 0.0, 0.0, k, lfx, lfy];
        let mut need: Vec<(u32, f64, f64)> = Vec::new();
        for ty in ty0..=ty1 {
            for tx in tx0..=tx1 {
                let key = (tx, ty);
                if !self.nd(id).layer.as_ref().unwrap().tiles.contains_key(&key) {
                    let tid = self.layer_ids; self.layer_ids += 1;
                    self.nm(id).layer.as_mut().unwrap().tiles.insert(key, Tile { id: tid, ok: false, dirty: None });
                }
                let (tid, ok, dirty) = { let t = &self.nd(id).layer.as_ref().unwrap().tiles[&key]; (t.id, t.ok, t.dirty) };
                let (ax, ay) = (tx as f64 * w, ty as f64 * h);
                if let (true, Some(d)) = (ok, dirty) {
                    self.tile_mut(id, key).dirty = None;
                    if (d.x1 - d.x0) * (d.y1 - d.y0) < (w * h) / 2.0 {
                        let area = Rect { x0: ax + d.x0, y0: ay + d.y0, x1: ax + d.x1, y1: ay + d.y1 };
                        let sub = self.sub_paint(e, &kids, &cm, &area, pixelated);
                        let done = match e.tile_patch(tid, sub.view(), ax, ay, d.x0 as u32, d.y0 as u32, (d.x1 - d.x0) as u32, (d.y1 - d.y0) as u32) {
                            Ok(b) => b,
                            Err(err) => { crate::log(&format!("[gpu] tile: {err:?}")); false }
                        };
                        if done { self.count(ct::PATCHES); } else { self.tile_mut(id, key).ok = false; }
                    } else { self.tile_mut(id, key).ok = false; }
                }
                if !self.tile_mut(id, key).ok {
                    self.tile_mut(id, key).dirty = None;
                    let area = Rect { x0: ax, y0: ay, x1: ax + w, y1: ay + h };
                    let sub = self.sub_paint(e, &kids, &cm, &area, pixelated);
                    if let Err(err) = e.tile(tid, sub.view(), area.x0, area.y0, w as u32, h as u32) { crate::log(&format!("[gpu] tile: {err:?}")); continue; }
                    self.tile_mut(id, key).ok = true;
                    self.count(ct::TILES);
                }
                need.push((tid, ox + tx as f64 * w, oy + ty as f64 * h));
            }
        }
        for (tid, x, y) in need { e.frame_tile(tid, x as f32, y as f32, w as f32, h as f32, vis.x0 as f32, vis.y0 as f32, vis.x1 as f32, vis.y1 as f32); }
        // tiles far from the view go (a long list keeps only what it has shown lately)
        let ly = self.nm(id).layer.as_mut().unwrap();
        if ly.tiles.len() > 48 {
            let (cx, cy) = ((tx0 + tx1) as f64 / 2.0, (ty0 + ty1) as f64 / 2.0);
            let far: Vec<(i64, i64)> = ly.tiles.keys().copied().filter(|&(tx, ty)| (ty as f64 - cy).abs() + (tx as f64 - cx).abs() > 12.0).collect();
            for key in far { if let Some(t) = ly.tiles.remove(&key) { e.tile_drop(t.id); } }
        }
        self.drew(vis);
    }
    fn tile_mut(&mut self, id: u32, key: (i64, i64)) -> &mut Tile { self.nm(id).layer.as_mut().unwrap().tiles.get_mut(&key).unwrap() }
}
