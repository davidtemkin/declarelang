// ir — the purpose-built Declare emission tree. map.ts builds this; emit.ts
// serializes it to valid Declare text. A typed tree (not string concatenation)
// so the serializer can guarantee bracket/brace balance for formatSource.
export type DValue =
  | { kind: "literal"; text: string }
  | { kind: "code"; src: string }
  | { kind: "path"; path: string; many: boolean };
export interface DAttr { name: string; value: DValue; bind?: "two" }
export interface DDecl { name: string; type: string; def: DValue | null }
export interface DMethod { name: string; params: string[]; body: string; source?: string }
export interface DNode { tag: string; name: string | null; attrs: DAttr[]; decls: DDecl[]; methods: DMethod[]; children: DNode[] }
export interface DClass { name: string; base: string; body: DNode }
export interface DProgram { classes: DClass[]; root: DNode }
