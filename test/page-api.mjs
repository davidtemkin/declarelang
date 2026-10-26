// test/page-api.mjs — the members browser/declare-boot.d.ts declares for each
// page-side interface, read with the TypeScript parser (page-api.test,
// embed.test and island.test hold the real handles to them).
import { readFileSync } from "node:fs";
import ts from "typescript";

export const PAGE_API_FILE = "browser/declare-boot.d.ts";
export const pageApiSource = ts.createSourceFile(PAGE_API_FILE, readFileSync(new URL("../" + PAGE_API_FILE, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const iface = (n) => pageApiSource.statements.find((s) => ts.isInterfaceDeclaration(s) && s.name.text === n);
/** The member names an interface in the page API declares. */
export const membersOf = (n) => iface(n).members.filter((m) => m.name && ts.isIdentifier(m.name)).map((m) => m.name.text);
