import type { Pos } from "./pos.js";

export type Severity = "blocking" | "degraded" | "info";

export type S13Ref =
  | "animation-choreography" | "resources-and-fonts" | "slots-placement"
  | "modules" | "constraint-timing" | "imperative-data-mutation" | "dynamic-body"
  | "datapath-xpath" | "subscription-source" | "attr-change-handler"
  | "state-form" | "typed-method" | "state-when-sugar" | "mixins" | "unknown-tag";

export interface Gap {
  kind: string;
  severity: Severity;
  s13Ref: S13Ref;
  pos: Pos;
  note: string;
}

export interface GapSink { add(g: Gap): void; readonly gaps: Gap[] }
export function makeSink(): GapSink {
  const gaps: Gap[] = [];
  return { gaps, add(g) { gaps.push(g); } };
}
