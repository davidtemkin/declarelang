// mac-recording — a drawing's recording, as the Mac host reads it.
//
// The recording crosses to the host once per drawing as numbers
// (mac-backend.ts encodeRecording; Recording.swift reads them). This records
// every Canvas2D call, encodes it, reads it back by the format's own table, and
// holds the result to the recording's objects. The Swift side is held to its
// pixels by the draw conformance rig and the gate.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { record } from "../runtime/dist/draw.js";
import { encodeRecording } from "../runtime/dist/mac-backend.js";

const SET_KEYS = [
  "lineWidth", "lineCap", "lineJoin", "miterLimit", "lineDashOffset",
  "globalAlpha", "globalCompositeOperation",
  "shadowBlur", "shadowColor", "shadowOffsetX", "shadowOffsetY",
  "filter", "font", "textAlign", "textBaseline", "direction",
  "letterSpacing", "wordSpacing", "fontKerning",
  "imageSmoothingEnabled", "imageSmoothingQuality",
];
const NAMES = { 1: "fillStyle", 3: "strokeStyle", 7: "fillRect", 8: "strokeRect", 9: "clearRect", 10: "beginPath",
  11: "moveTo", 12: "lineTo", 13: "arc", 14: "arcTo", 15: "ellipse", 16: "rect", 17: "roundRect",
  18: "quadraticCurveTo", 19: "bezierCurveTo", 20: "closePath", 21: "fill", 22: "stroke", 23: "clip",
  24: "fillText", 25: "strokeText", 26: "drawImage", 27: "save", 28: "restore", 29: "translate",
  30: "rotate", 31: "scale", 32: "transform", 33: "setTransform", 34: "resetTransform" };
const RULES = [undefined, "nonzero", "evenodd"];

/** Read an encoded recording back into DrawOp records, by the format's table. */
function read({ nums: q, at, strs }) {
  return Array.from(at, (o) => {
    const c = q[o], a = (k) => q[o + k], n = (k, len) => Array.from(q.subarray(o + k, o + k + len));
    switch (c) {
      case 1: case 3: return { op: NAMES[c], v: strs[a(1)] };
      case 2: case 4: {
        const nc = a(2), ns = a(3 + nc);
        return { op: c === 2 ? "fillStyle" : "strokeStyle", grad: { kind: ["linear", "radial", "conic"][a(1)], coords: n(3, nc),
          stops: Array.from({ length: ns }, (_, k) => [a(4 + nc + 2 * k), strs[a(5 + nc + 2 * k)]]) } };
      }
      case 5: return { op: "set", k: SET_KEYS[a(1)], v: a(2) === 1 ? strs[a(3)] : a(2) === 2 ? a(3) !== 0 : a(3) };
      case 6: return { op: "setLineDash", segments: n(2, a(1)) };
      case 7: case 8: case 9: case 16: return { op: NAMES[c], x: a(1), y: a(2), w: a(3), h: a(4) };
      case 11: case 12: case 29: case 31: return { op: NAMES[c], x: a(1), y: a(2) };
      case 13: return { op: "arc", x: a(1), y: a(2), r: a(3), a0: a(4), a1: a(5), ccw: a(6) !== 0 };
      case 14: return { op: "arcTo", x1: a(1), y1: a(2), x2: a(3), y2: a(4), r: a(5) };
      case 15: return { op: "ellipse", x: a(1), y: a(2), rx: a(3), ry: a(4), rot: a(5), a0: a(6), a1: a(7), ccw: a(8) !== 0 };
      case 17: return { op: "roundRect", x: a(1), y: a(2), w: a(3), h: a(4), radii: a(5) === 0 ? a(7) : n(7, a(6)) };
      case 18: return { op: "quadraticCurveTo", cpx: a(1), cpy: a(2), x: a(3), y: a(4) };
      case 19: return { op: "bezierCurveTo", cp1x: a(1), cp1y: a(2), cp2x: a(3), cp2y: a(4), x: a(5), y: a(6) };
      case 21: case 23: return { op: NAMES[c], rule: RULES[a(1)] };
      case 24: case 25: return { op: NAMES[c], text: strs[a(1)], x: a(2), y: a(3), maxWidth: Number.isNaN(a(4)) ? undefined : a(4) };
      case 26: return { op: "drawImage", h: a(1), sx: a(2), sy: a(3), sw: a(4), sh: a(5), dx: a(6), dy: a(7), dw: a(8), dh: a(9) };
      case 30: return { op: "rotate", angle: a(1) };
      case 32: case 33: return { op: NAMES[c], m: n(1, 6) };
      default: return { op: NAMES[c] };
    }
  });
}

await test("every Canvas2D call crosses to the Mac host and reads back as recorded", () => {
  const list = record((d) => {
    const g = d.createRadialGradient(5, 5, 0, 5, 5, 10);
    g.addColorStop(0, "#000000"); g.addColorStop(1, "#ffffff");
    d.fillStyle = g; d.strokeStyle = "#00ff00";
    d.lineWidth = 3; d.lineCap = "round"; d.imageSmoothingEnabled = false;
    d.setLineDash([4, 2]);
    d.strokeRect(1, 2, 3, 4); d.clearRect(0, 0, 1, 1);
    d.beginPath(); d.moveTo(1, 1); d.lineTo(5, 5);
    d.arc(5, 5, 2, 0, 3, true); d.arcTo(1, 2, 3, 4, 5); d.ellipse(5, 5, 3, 2, 0.5, 0, 6, false);
    d.rect(0, 0, 2, 2); d.roundRect(0, 0, 9, 9, 3); d.roundRect(0, 0, 9, 9, [1, 2]);
    d.quadraticCurveTo(1, 2, 3, 4); d.bezierCurveTo(1, 2, 3, 4, 5, 6); d.closePath();
    d.fill("evenodd"); d.stroke(); d.clip();
    d.fillText("hi", 1, 2); d.strokeText("hi", 1, 2, 50);
    d.save(); d.translate(1, 2); d.rotate(0.5); d.scale(2, 3);
    d.transform(1, 0, 0, 1, 4, 5); d.setTransform(1, 0, 0, 1, 0, 0); d.resetTransform(); d.restore();
  });
  const enc = encodeRecording(list);
  assert.deepEqual(read(enc), list.ops);
  assert.equal(enc.strs.filter((s) => s === "hi").length, 1, "a string crosses once however often it is named");
});

await test("a NaN coordinate crosses as NaN; the host reads it as absent", () => {
  const list = record((d) => { d.fillRect(Math.sqrt(-1), 0, 10, 10); });
  const { nums, at } = encodeRecording(list);
  assert.ok(Number.isNaN(nums[at[0] + 1]));
});

summarize("mac-recording");
