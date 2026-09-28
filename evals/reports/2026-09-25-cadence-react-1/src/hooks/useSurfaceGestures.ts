// Direct manipulation for a horizontal surface: drag to push it along, pinch
// (or scroll, or trackpad-pinch) to pull it open or squeeze it shut, with a
// little momentum on release. Every movement is reported as it happens —
// nothing waits for the hand to lift.
//
// The element should carry `touch-action: pan-y`: vertical swipes stay with the
// page so it can still scroll on a phone, and horizontal drags and pinches come
// here. If the browser claims a gesture as a scroll it sends pointercancel, and
// we let go.

import { useEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion } from "./useReducedMotion";

export interface SurfaceHandlers {
  /** Move the content by dx pixels (positive = content moves right). */
  pan(dx: number): void;
  /** Scale the content by `factor` about `anchorX` (px from the element's left edge). */
  zoom(factor: number, anchorX: number): void;
  /** A tap or click that didn't become a drag. */
  tap(x: number, y: number): void;
  /** Any direct touch — lets the owner cancel its own animations. */
  grab?(): void;
}

const TAP_SLOP = 8; // px a finger may wander and still be a tap
const TAP_MS = 350;
const FRICTION = 0.94; // per 16ms frame

interface Pointer {
  x: number;
  y: number;
}

export function useSurfaceGestures(ref: RefObject<HTMLElement | null>, handlers: SurfaceHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const pointers = new Map<number, Pointer>();
    let downAt = 0, downX = 0, downY = 0, wandered = 0;
    let multi = false; // the gesture has involved two fingers at some point
    let samples: { t: number; x: number }[] = [];
    let coast = 0;

    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const pair = () => {
      const [a, b] = [...pointers.values()];
      return { mid: (a.x + b.x) / 2, dist: Math.max(24, Math.hypot(a.x - b.x, a.y - b.y)) };
    };
    const stopCoast = () => cancelAnimationFrame(coast);

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      stopCoast();
      latest.current.grab?.();
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      if (pointers.size === 1) {
        multi = false;
        downAt = e.timeStamp;
        ({ x: downX, y: downY } = local(e));
        wandered = 0;
        samples = [{ t: e.timeStamp, x: downX }];
      } else {
        multi = true;
      }
    };

    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const next = local(e);
      if (pointers.size === 1) {
        latest.current.pan(next.x - prev.x);
        pointers.set(e.pointerId, next);
        wandered = Math.max(wandered, Math.hypot(next.x - downX, next.y - downY));
        samples.push({ t: e.timeStamp, x: next.x });
        samples = samples.filter((s) => e.timeStamp - s.t < 100);
      } else if (pointers.size === 2) {
        const before = pair();
        pointers.set(e.pointerId, next);
        const after = pair();
        latest.current.pan(after.mid - before.mid);
        latest.current.zoom(after.dist / before.dist, after.mid);
      }
    };

    const coastFrom = (velocity: number) => {
      if (prefersReducedMotion() || Math.abs(velocity) < 0.25) return;
      let v = velocity, last = performance.now();
      coast = requestAnimationFrame(function step(now) {
        const dt = now - last;
        last = now;
        latest.current.pan(v * dt);
        v *= Math.pow(FRICTION, dt / 16);
        if (Math.abs(v) > 0.02) coast = requestAnimationFrame(step);
      });
    };

    const onUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size > 0) return; // still pinching with the other finger
      if (e.type === "pointercancel") return;
      const { x, y } = local(e);
      if (!multi && wandered < TAP_SLOP && e.timeStamp - downAt < TAP_MS) {
        latest.current.tap(x, y);
        return;
      }
      if (!multi && samples.length > 1) {
        const first = samples[0], last = samples[samples.length - 1];
        const dt = last.t - first.t;
        if (dt > 0 && e.timeStamp - last.t < 60) coastFrom((last.x - first.x) / dt);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopCoast();
      latest.current.grab?.();
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1;
      const dx = e.deltaX * scale, dy = e.deltaY * scale;
      const { x } = local(e);
      if (e.ctrlKey) latest.current.zoom(Math.exp(-dy * 0.01), x); // trackpad pinch
      else if (Math.abs(dx) > Math.abs(dy) || e.shiftKey) latest.current.pan(-(dx || dy));
      else latest.current.zoom(Math.exp(-dy * 0.002), x);
    };

    const onDragStart = (e: Event) => e.preventDefault();

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dragstart", onDragStart);
    return () => {
      stopCoast();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dragstart", onDragStart);
    };
  }, [ref]);
}
