// service.ts — Pagemap's one door to the publication's service (Firebase: api/API.md) and to
// pdf.js. Host glue only: it signs people in, listens, stores changes as revisioned records,
// keeps this window's undo history, says who is here, uploads, and draws PDF pages. Every
// answer goes back through a callback the App hands in, which writes an attribute or a
// dataset; nothing here decides what anyone sees.

import { initializeApp } from "firebase/app"
import {
    getAuth, connectAuthEmulator, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
    sendPasswordResetEmail, signOut as fbSignOut, updateProfile, type User,
} from "firebase/auth"
import {
    getDatabase, connectDatabaseEmulator, ref, onValue, get, update, set, remove, push, serverTimestamp,
    onDisconnect, query, limitToLast, orderByKey, onChildAdded, increment, goOffline, goOnline, type Unsubscribe, type DataSnapshot,
} from "firebase/database"
import { getStorage, connectStorageEmulator, ref as sref, uploadBytesResumable, getDownloadURL, listAll, deleteObject } from "firebase/storage"
import * as pdfjs from "pdfjs-dist/build/pdf.mjs"
import * as P from "./plan.ts"

// ── Connecting ───────────────────────────────────────────────────────────────────────────────

const host = location.hostname || "127.0.0.1"
const fb = initializeApp({
    apiKey: "demo-key", projectId: "demo-pagemap", authDomain: "demo-pagemap.firebaseapp.com",
    databaseURL: "https://demo-pagemap-default-rtdb.firebaseio.com", storageBucket: "demo-pagemap.appspot.com",
})
const auth = getAuth(fb)
connectAuthEmulator(auth, "http://" + host + ":9099", { disableWarnings: true })
const db = getDatabase(fb)
connectDatabaseEmulator(db, host, 9000)
const storage = getStorage(fb)
connectStorageEmulator(storage, host, 9199)
pdfjs.GlobalWorkerOptions.workerSrc = new URL("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", pdfjsBase()).href

function pdfjsBase(): string {
    // The worker is served from beside this program; the page's own address names where that is.
    const here = location.pathname.replace(/[^/]*$/, "")
    return location.origin + (here.includes("/my-apps/pagemap/") ? here.slice(0, here.indexOf("/my-apps/pagemap/") + 17) : "/my-apps/pagemap/")
}

/** Diagnostics, for the flow scripts in tests/: drop and restore this window's connection, as a
 *  train tunnel would, so what happens to work done meanwhile can be checked. */
;(window as unknown as { __pagemapService: object }).__pagemapService = { offline: () => goOffline(db), online: () => goOnline(db) }

/** One open copy of Pagemap: a window or tab. */
export const TAB = P.newId("tab-", 10)

// ── Plain words for what went wrong ──────────────────────────────────────────────────────────

export function plainError(e: unknown): string {
    const code = String((e as { code?: string })?.code ?? "")
    const m: Record<string, string> = {
        "auth/invalid-email": "That isn't a valid email address. Check it and try again.",
        "auth/missing-email": "Enter your email address.",
        "auth/missing-password": "Enter your password.",
        "auth/invalid-credential": "That email and password don't match an account. Check them, or set a new password.",
        "auth/wrong-password": "That password isn't right. Try again, or set a new password.",
        "auth/user-not-found": "There's no account with that email. Check it, or create an account.",
        "auth/too-many-requests": "Too many tries. Wait a few minutes, then try again, or set a new password.",
        "auth/network-request-failed": "Pagemap can't reach the service. Check your connection, then try again.",
        "auth/email-already-in-use": "An account already uses that address. Sign in instead.",
        "auth/weak-password": "Choose a password of at least six characters.",
        "auth/user-disabled": "This account has been turned off. Ask the people who run Pagemap to turn it back on.",
        "PERMISSION_DENIED": "The service refused this.",
        "storage/unauthorized": "The service refused the upload.",
        "storage/canceled": "The upload was cancelled.",
        "storage/retry-limit-exceeded": "The upload couldn't reach the service. Check your connection and try again.",
    }
    if (m[code]) return m[code]
    const msg = String((e as Error)?.message ?? e)
    if (/permission.denied/i.test(msg)) return m["PERMISSION_DENIED"]
    if (/network|offline|fetch/i.test(msg)) return "Pagemap can't reach the service. Check your connection, then try again."
    return msg.replace(/^Firebase:\s*/, "").replace(/\s*\(.*\)\.?$/, "")
}

// ── Signing in ───────────────────────────────────────────────────────────────────────────────

export interface Person { uid: string; email: string; name: string }
let told: (p: Person | null) => void = () => undefined
let creating = false
export function watchAuth(cb: (p: Person | null) => void): void {
    told = cb
    // While an account is being made, its sign-in is told once its name and record exist.
    onAuthStateChanged(auth, (u: User | null) => { if (!creating) cb(u ? { uid: u.uid, email: u.email ?? "", name: u.displayName ?? (u.email ?? "").split("@")[0] } : null) })
}
export function signIn(email: string, password: string): Promise<void> {
    return signInWithEmailAndPassword(auth, email.trim(), password).then(() => undefined)
}
/** Create the sign-in and its account record. */
export function signUp(name: string, email: string, password: string): Promise<Person> {
    creating = true
    return createUserWithEmailAndPassword(auth, email.trim(), password).then(async (c) => {
        await updateProfile(c.user, { displayName: name.trim() })
        await retry(() => set(ref(db, "accounts/" + c.user.uid), { name: name.trim(), email: email.trim(), created: serverTimestamp(), ws: "", bytes: 0 }))
        const p = { uid: c.user.uid, email: c.user.email ?? email.trim(), name: name.trim() }
        creating = false
        told(p)
        return p
    }, (e) => { creating = false; throw e })
}
export function resetPassword(email: string): Promise<void> { return sendPasswordResetEmail(auth, email.trim()) }
export async function signOut(): Promise<void> {
    accountsOff?.()
    await leaveFlatplan()
    await fbSignOut(auth)
}

/** One read of a place, once the connection is up (a `get` can answer "offline" before then). */
function once(r: ReturnType<typeof ref>): Promise<DataSnapshot> {
    return new Promise((ok, fail) => { onValue(r, ok, fail, { onlyOnce: true }) })
}

/** Reads refused in the moments after an account is created are tried again a few times. */
async function retry<T>(f: () => Promise<T>, n = 5): Promise<T> {
    for (let i = 0; ; i++) {
        try { return await f() } catch (e) {
            if (i >= n || !/permission/i.test(String((e as Error)?.message ?? e))) throw e
            await new Promise((r) => setTimeout(r, 300 * (i + 1)))
        }
    }
}

export interface Resolved { ws: string; role: string; home: string; wsName: string; founded: boolean; joined: boolean }
/** What a signed-in account opens (api/API.md, "Accounts and workspaces"). */
export async function resolveAccount(p: Person, magazine: string): Promise<Resolved> {
    const blocked = (await retry(() => once(ref(db, "blocked/" + p.uid)))).val()
    if (blocked === true) throw new Error("turned-off")
    const ws: string = (await retry(() => once(ref(db, "users/" + p.uid + "/ws")))).val() ?? ""
    if (ws != "") {
        const member = (await retry(() => once(ref(db, "workspaces/" + ws + "/members/" + p.uid)))).val()
        if (!member) throw new Error("not-a-member")
        const info = (await once(ref(db, "workspaces/" + ws + "/info"))).val() ?? {}
        return { ws, role: member.role, home: info.home ?? "", wsName: info.name ?? "", founded: false, joined: false }
    }
    const inviteRef = ref(db, "invites/" + P.emailKey(p.email))
    const invite = (await retry(() => once(inviteRef))).val()
    const member = { name: p.name, email: p.email, initials: initials(p.name), color: P.MEMBER_TINTS[hash(p.uid) % P.MEMBER_TINTS.length] }
    if (invite && invite.ws) {
        await update(ref(db), {
            ["workspaces/" + invite.ws + "/members/" + p.uid]: { ...member, role: invite.role },
            ["users/" + p.uid]: { ws: invite.ws },
        })
        const info = (await retry(() => once(ref(db, "workspaces/" + invite.ws + "/info")))).val() ?? {}
        await update(ref(db, "accounts/" + p.uid), { ws: invite.ws, wsName: info.name ?? "" })
        await remove(inviteRef)
        return { ws: invite.ws, role: invite.role, home: info.home ?? "", wsName: info.name ?? "", founded: false, joined: true }
    }
    const first = p.name.trim().split(/\s+/)[0] || "My"
    const name = magazine.trim() != "" ? magazine.trim() : first + "'s Magazine"
    const newWs = "ws-" + P.newId("", 8)
    const fp = P.firstFlatplan(name, p.uid)
    await update(ref(db), {
        ["workspaces/" + newWs + "/info"]: { name, owner: p.uid, home: fp.id, created: serverTimestamp() },
        ["workspaces/" + newWs + "/members/" + p.uid]: { ...member, role: "admin" },
        ["users/" + p.uid]: { ws: newWs },
        ["accounts/" + p.uid + "/ws"]: newWs,
        ["accounts/" + p.uid + "/wsName"]: name,
    })
    await createFlatplan(newWs, fp)
    return { ws: newWs, role: "admin", home: fp.id, wsName: name, founded: true, joined: false }
}
export function initials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("")
}
function hash(s: string): number { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h }

/** While signed in: told at once if the account is turned off. */
export function watchBlocked(uid: string, cb: (blocked: boolean) => void): Unsubscribe {
    return onValue(ref(db, "blocked/" + uid), (s) => cb(s.val() === true), () => cb(false))
}

// ── The workspace ────────────────────────────────────────────────────────────────────────────

export interface Member { uid: string; name: string; email: string; initials: string; color: string; role: string }
export interface IssueEntry { id: string; name: string; edition: string; pages: number; updated: number; archived: boolean }
export function watchWorkspace(ws: string, on: { info: (i: { name: string; home: string; owner: string }) => void; members: (m: Member[]) => void; index: (i: IssueEntry[]) => void; denied: () => void }): () => void {
    const offs = [
        onValue(ref(db, "workspaces/" + ws + "/info"), (s) => on.info({ name: s.val()?.name ?? "", home: s.val()?.home ?? "", owner: s.val()?.owner ?? "" }), () => on.denied()),
        onValue(ref(db, "workspaces/" + ws + "/members"), (s) => on.members(Object.entries(s.val() ?? {}).map(([uid, m]) => ({ uid, ...(m as Omit<Member, "uid">) }))), () => undefined),
        onValue(ref(db, "workspaces/" + ws + "/index"), (s) => on.index(Object.values(s.val() ?? {}).map((e) => {
            const x = e as IssueEntry
            return { id: x.id, name: x.name ?? "", edition: x.edition ?? "", pages: x.pages ?? 0, updated: typeof x.updated == "number" ? x.updated : Date.now(), archived: x.archived === true }
        }).sort((a, b) => b.updated - a.updated)), () => undefined),
    ]
    return () => offs.forEach((f) => f())
}
/** Where a view-only link's flatplan lives, or "" when the link is off or gone. */
export async function findLink(id: string): Promise<string> {
    try { return (await once(ref(db, "links/" + P.idKey(id)))).val()?.ws ?? "" } catch { return "" }
}

// ── A flatplan, open ─────────────────────────────────────────────────────────────────────────

interface Rec { v: string; rev: number; tab: string }
interface Step { label: string; keys: string[]; before: (string | undefined)[]; after: string[]; afterRev: number[] }
export interface Comment { id: string; pageId: string; by: string; at: number; text: string }
export interface Activity { id: string; by: string; at: number; text: string }
export interface Here { tab: string; by: string; pages: string[]; at: number; mine: boolean }
export interface OpenHandlers {
    doc: (fp: P.Flatplan, byOthers: string[]) => void
    missing: (why: string) => void
    comments: (c: Comment[]) => void
    activity: (a: Activity[]) => void
    here: (h: Here[]) => void
    theirs: (by: string, label: string) => void
    viewable: (on: boolean) => void
    history: (undo: string, redo: string) => void
    status: (pending: number, connected: boolean) => void
}

let open: { ws: string; id: string; base: string; recs: Map<string, Rec>; fp: P.Flatplan | null; offs: Unsubscribe[];
    undo: Step[]; redo: Step[]; on: OpenHandlers; uid: string; pending: number; pages: string[]; beat: number } | null = null
let connected = true
let serverOffset = 0
onValue(ref(db, ".info/connected"), (s) => { connected = s.val() === true; open?.on.status(open.pending, connected) })
onValue(ref(db, ".info/serverTimeOffset"), (s) => { serverOffset = Number(s.val() ?? 0) })
export function serverNow(): number { return Date.now() + serverOffset }

function flatten(raw: unknown): Map<string, Rec> {
    const out = new Map<string, Rec>()
    const r = (raw ?? {}) as { fields?: Record<string, Rec>; lists?: Record<string, { order?: Rec; items?: Record<string, Rec> }> }
    Object.entries(r.fields ?? {}).forEach(([k, v]) => out.set("fields/" + k, v))
    Object.entries(r.lists ?? {}).forEach(([l, node]) => {
        if (node.order) out.set("lists/" + l + "/order", node.order)
        Object.entries(node.items ?? {}).forEach(([k, v]) => out.set("lists/" + l + "/items/" + k, v))
    })
    return out
}

/** Open a flatplan and keep it current. `uid` is "" for a visitor through a view-only link. */
export function openFlatplan(ws: string, id: string, uid: string, on: OpenHandlers): void {
    void leaveFlatplan()
    const base = "workspaces/" + ws + "/flatplans/" + P.idKey(id)
    const o = { ws, id, base, recs: new Map<string, Rec>(), fp: null as P.Flatplan | null, offs: [] as Unsubscribe[], undo: [] as Step[], redo: [] as Step[],
        on, uid, pending: 0, pages: [] as string[], beat: 0 }
    open = o
    on.history("", "")
    const openedAt = serverNow()
    o.offs.push(onValue(ref(db, base + "/doc"), (s: DataSnapshot) => {
        if (open !== o) return
        if (!s.exists()) { on.missing("gone"); return }
        const raw = s.val()
        const next = flatten(raw)
        const byOthers: string[] = []
        next.forEach((r, k) => { const old = o.recs.get(k); if (o.fp && r.tab != TAB && (!old || old.rev != r.rev)) byOthers.push(k) })
        o.recs = next
        o.fp = P.fromRecords(id, raw)
        on.doc(o.fp, byOthers)
    }, (e) => { if (open === o) on.missing(/permission/i.test(String(e)) ? "denied" : "error") }))
    o.offs.push(onValue(ref(db, base + "/comments"), (s) => {
        if (open !== o) return
        const list = Object.values(s.val() ?? {}) as Comment[]
        on.comments(list.map((c) => ({ ...c, at: typeof c.at == "number" ? c.at : serverNow() })).sort((a, b) => a.at - b.at))
    }, () => undefined))
    o.offs.push(onValue(query(ref(db, base + "/activity"), orderByKey(), limitToLast(200)), (s) => {
        if (open !== o) return
        const list: Activity[] = []
        s.forEach((c) => { const v = c.val(); list.push({ id: c.key ?? "", by: v.by ?? "", at: typeof v.at == "number" ? v.at : serverNow(), text: v.text ?? "" }) })
        on.activity(list.reverse())
    }, () => undefined))
    o.offs.push(onValue(ref(db, base + "/here"), (s) => {
        if (open !== o) return
        const now = serverNow()
        const list: Here[] = []
        Object.entries(s.val() ?? {}).forEach(([tab, v]) => {
            const h = v as { by: string; pages: string; at: number }
            const at = typeof h.at == "number" ? h.at : now
            if (now - at > 150000) return
            let pages: string[] = []
            try { pages = JSON.parse(h.pages ?? "[]") } catch { pages = [] }
            list.push({ tab, by: h.by, pages, at, mine: tab == TAB })
        })
        on.here(list)
    }, () => undefined))
    o.offs.push(onChildAdded(query(ref(db, base + "/changes"), orderByKey(), limitToLast(1)), (s) => {
        if (open !== o) return
        const v = s.val()
        if (v && v.tab != TAB && typeof v.at == "number" && v.at >= openedAt - 2000) on.theirs(v.by ?? "", v.label ?? "")
    }, () => undefined))
    o.offs.push(onValue(ref(db, base + "/viewable"), (s) => { if (open === o) on.viewable(s.val() === true) }, () => undefined))
    if (uid != "") {
        const hereRef = ref(db, base + "/here/" + TAB)
        void onDisconnect(hereRef).remove().catch(() => undefined)
        writeHere()
        o.beat = window.setInterval(writeHere, 30000)
    }
}
/** Seen from outside: the flatplan as it was last stored, and whether a copy is open. */
export function current(): P.Flatplan | null { return open?.fp ?? null }

function writeHere(): void {
    const o = open
    if (!o || o.uid == "") return
    set(ref(db, o.base + "/here/" + TAB), { by: o.uid, pages: JSON.stringify(o.pages), at: serverTimestamp() }).catch(() => undefined)
}
/** The pages this person is working on, for everyone else. */
export function setWorkingOn(pages: string[]): void {
    if (!open || JSON.stringify(open.pages) == JSON.stringify(pages)) return
    open.pages = pages.slice(0, 200)
    writeHere()
}
export async function leaveFlatplan(): Promise<void> {
    const o = open
    if (!o) return
    open = null
    o.offs.forEach((f) => f())
    window.clearInterval(o.beat)
    if (o.uid != "") {
        try { await onDisconnect(ref(db, o.base + "/here/" + TAB)).cancel(); await remove(ref(db, o.base + "/here/" + TAB)) } catch { /* gone already */ }
    }
}

export type CommitResult = "saved" | "conflict" | "refused" | "unchanged" | "offline"

/** Store a change: every record it touches at its next revision, the change, and the index, in one update. */
export function commit(label: string, next: P.Flatplan, kind: "change" | "undo" | "redo" = "change"): Promise<CommitResult> {
    const o = open
    if (!o || !o.fp) return Promise.resolve("refused")
    const before = P.toRecords(o.fp)
    const diff = P.diffRecords(before, P.toRecords(next))
    if (diff.size == 0) return Promise.resolve("unchanged")
    const step: Step = { label, keys: [], before: [], after: [], afterRev: [] }
    diff.forEach((v, k) => {
        step.keys.push(k); step.before.push(o.recs.get(k)?.v); step.after.push(v)
        step.afterRev.push((o.recs.get(k)?.rev ?? 0) + 1)
    })
    return write(o, step, label, kind == "change").then((r) => {
        if (r == "saved" && kind == "change") {
            o.undo.push(step); if (o.undo.length > 80) o.undo.shift()
            o.redo = []
            o.on.history(o.undo[o.undo.length - 1]?.label ?? "", "")
        }
        return r
    })
}
function write(o: NonNullable<typeof open>, step: Step, label: string, activity: boolean): Promise<CommitResult> {
    const u: Record<string, unknown> = {}
    step.keys.forEach((k, i) => {
        const rec = { v: step.after[i], rev: step.afterRev[i], tab: TAB }
        u[o.base + "/doc/" + k] = rec
        o.recs.set(k, rec)
    })
    const key = push(ref(db, o.base + "/changes")).key!
    u[o.base + "/changes/" + key] = { by: o.uid, tab: TAB, at: serverTimestamp(), label }
    if (activity) u[o.base + "/activity/" + key] = { id: key, by: o.uid, at: serverTimestamp(), text: label }
    const pages = o.fp ? countPages(o, step) : 0
    u["workspaces/" + o.ws + "/index/" + P.idKey(o.id) + "/updated"] = serverTimestamp()
    u["workspaces/" + o.ws + "/index/" + P.idKey(o.id) + "/pages"] = pages
    const nameAt = step.keys.indexOf("fields/name"), edAt = step.keys.indexOf("fields/edition"), arAt = step.keys.indexOf("fields/archived")
    if (nameAt >= 0) u["workspaces/" + o.ws + "/index/" + P.idKey(o.id) + "/name"] = JSON.parse(step.after[nameAt])
    if (edAt >= 0) u["workspaces/" + o.ws + "/index/" + P.idKey(o.id) + "/edition"] = JSON.parse(step.after[edAt])
    if (arAt >= 0) u["workspaces/" + o.ws + "/index/" + P.idKey(o.id) + "/archived"] = JSON.parse(step.after[arAt]) === true
    o.pending++
    o.on.status(o.pending, connected)
    return update(ref(db), u).then(() => "saved" as CommitResult, (e) => {
        // Refused whole: someone else wrote one of these records first, or the rules said no. The
        // service puts this copy back as it stands, and the listener above hears it.
        return (/permission/i.test(String(e)) ? "conflict" : "refused") as CommitResult
    }).finally(() => { o.pending--; o.on.status(o.pending, connected) })
}
function countPages(o: NonNullable<typeof open>, step: Step): number {
    const at = step.keys.indexOf("lists/pages/order")
    if (at >= 0) { try { return (JSON.parse(step.after[at]) as string[]).length } catch { /* fall through */ } }
    return o.fp?.pages.length ?? 0
}

/** Undo or redo this window's own change. A step someone else has since built on is dropped. */
export function undoRedo(which: "undo" | "redo"): Promise<{ result: CommitResult | "dropped" | "none"; label: string }> {
    const o = open
    if (!o) return Promise.resolve({ result: "none", label: "" })
    const stack = which == "undo" ? o.undo : o.redo
    const step = stack.pop()
    const announce = () => o.on.history(o.undo[o.undo.length - 1]?.label ?? "", o.redo[o.redo.length - 1]?.label ?? "")
    if (!step) return Promise.resolve({ result: "none", label: "" })
    const intact = step.keys.every((k, i) => { const r = o.recs.get(k); return r && r.v == step.after[i] && r.rev == step.afterRev[i] })
    if (!intact) { announce(); return Promise.resolve({ result: "dropped", label: step.label }) }
    const back: Step = { label: step.label, keys: step.keys, before: step.after, after: step.before.map((v) => v ?? "null"),
        afterRev: step.keys.map((k) => (o.recs.get(k)?.rev ?? 0) + 1) }
    return write(o, back, which == "undo" ? "Undo " + step.label : step.label, false).then((r) => {
        if (r == "saved") (which == "undo" ? o.redo : o.undo).push(back)
        announce()
        return { result: r, label: step.label }
    })
}

/** A new flatplan: every record at revision 1, and its index entry. */
export async function createFlatplan(ws: string, fp: P.Flatplan): Promise<void> {
    const base = "workspaces/" + ws + "/flatplans/" + P.idKey(fp.id)
    const u: Record<string, unknown> = {}
    P.toRecords(fp).forEach((v, k) => { u[base + "/doc/" + k] = { v, rev: 1, tab: TAB } })
    u["workspaces/" + ws + "/index/" + P.idKey(fp.id)] = { id: fp.id, name: fp.name, edition: fp.edition, pages: fp.pages.length, updated: serverTimestamp(), archived: false }
    await update(ref(db), u)
}

// ── Comments, sharing, invitations ───────────────────────────────────────────────────────────

export function addComment(pageId: string, text: string, pageName: string): Promise<void> {
    const o = open
    if (!o) return Promise.reject(new Error("No issue is open."))
    const id = "c-" + P.newId("", 10)
    const a = push(ref(db, o.base + "/activity")).key!
    return update(ref(db), {
        [o.base + "/comments/" + id]: { id, pageId, by: o.uid, at: serverTimestamp(), text },
        [o.base + "/activity/" + a]: { id: a, by: o.uid, at: serverTimestamp(), text: "Commented on " + pageName },
    })
}
export function shareLink(): Promise<void> {
    const o = open
    if (!o) return Promise.reject(new Error("No issue is open."))
    return update(ref(db), { [o.base + "/viewable"]: true, ["links/" + P.idKey(o.id)]: { ws: o.ws } })
}
export function invite(ws: string, uid: string, email: string, role: string): Promise<void> {
    return set(ref(db, "invites/" + P.emailKey(email)), { ws, role, by: uid, at: serverTimestamp() })
}

// ── Uploads and PDFs ─────────────────────────────────────────────────────────────────────────

export interface PdfFile { name: string; size: number; pages: number; url: string; bytes: ArrayBuffer }
/** Read a chosen file as a PDF, or say why it can't be. */
export async function readPdf(url: string, name: string): Promise<PdfFile> {
    const bytes = await (await fetch(url)).arrayBuffer()
    const head = new TextDecoder().decode(new Uint8Array(bytes.slice(0, 5)))
    if (head != "%PDF-") throw new Error("“" + name + "” isn't a PDF.")
    try {
        const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise
        const pages = doc.numPages
        docs.set(url, Promise.resolve(doc))
        return { name, size: bytes.byteLength, pages, url, bytes }
    } catch {
        throw new Error("“" + name + "” can't be read as a PDF: it may be damaged or protected.")
    }
}
/** Upload a PDF to Storage, saying how far it has got; resolves to its download URL. */
export function uploadPdf(uid: string, assetId: string, bytes: ArrayBuffer, progress: (f: number) => void): Promise<string> {
    if (bytes.byteLength >= 200 * 1024 * 1024) return Promise.reject(new Error("The PDF is 200 MB or more, which is more than the service takes."))
    const r = sref(storage, "uploads/" + uid + "/" + assetId + ".pdf")
    return new Promise((ok, fail) => {
        const t = uploadBytesResumable(r, new Uint8Array(bytes), { contentType: "application/pdf" })
        t.on("state_changed", (s) => progress(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0), (e) => fail(new Error(plainError(e))), () => {
            getDownloadURL(r).then(async (url) => {
                await update(ref(db, "accounts/" + uid), { bytes: increment(bytes.byteLength) }).catch(() => undefined)
                ok(url)
            }, (e) => fail(new Error(plainError(e))))
        })
    })
}

const docs = new Map<string, Promise<pdfjs.PDFDocumentProxy>>()
const pictures = new Map<string, Promise<string>>()
function pdfDoc(url: string): Promise<pdfjs.PDFDocumentProxy> {
    let d = docs.get(url)
    if (!d) { d = pdfjs.getDocument({ url }).promise; docs.set(url, d); d.catch(() => docs.delete(url)) }
    return d
}
/** A picture of one page of a PDF, drawn once and kept: a URL an Image can show. */
export function pdfPicture(url: string, page: number, width: number): Promise<string> {
    const key = url + "#" + page + "@" + width
    let p = pictures.get(key)
    if (!p) {
        p = pdfDoc(url).then(async (doc) => {
            const pg = await doc.getPage(Math.min(Math.max(1, page), doc.numPages))
            const vp0 = pg.getViewport({ scale: 1 })
            const vp = pg.getViewport({ scale: width / vp0.width })
            const canvas = document.createElement("canvas")
            canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height)
            await pg.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise
            const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.85))
            return URL.createObjectURL(blob)
        })
        pictures.set(key, p)
        p.catch(() => pictures.delete(key))
    }
    return p
}
/** The address of a page's artwork at a width, when it needs no drawing (pictures already made). */
export function artImage(images: string, page: number, width: number): string {
    return images.replace("{page}", String(page)).replace("{width}", String(width >= 400 ? 1200 : 360))
}

// ── Files people exchange ────────────────────────────────────────────────────────────────────

export async function readText(url: string): Promise<string> { return await (await fetch(url)).text() }
/** A whole backup, its PDFs included, as one JSON text. */
export async function makeBackup(fp: P.Flatplan, comments: Comment[]): Promise<string> {
    const files: Record<string, string> = {}
    for (const a of fp.assets) {
        if (!a.url) continue
        const blob = await (await fetch(a.url)).blob()
        files[a.id] = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(blob) })
    }
    return JSON.stringify({ format: "pagemap-backup", version: 1, flatplan: fp, comments, files })
}
/** Put a backup's PDFs back in Storage, under this account; the flatplan's assets point at them. */
export async function restoreFiles(uid: string, b: P.Backup, progress: (f: number) => void): Promise<P.Flatplan> {
    const fp: P.Flatplan = JSON.parse(JSON.stringify(b.flatplan))
    const ids = Object.keys(b.files ?? {})
    for (let i = 0; i < ids.length; i++) {
        const a = fp.assets.find((x) => x.id == ids[i])
        if (!a) continue
        const bytes = await (await fetch(b.files[ids[i]])).arrayBuffer()
        a.url = await uploadPdf(uid, a.id, bytes, (f) => progress((i + f) / ids.length))
    }
    return fp
}
export async function restoreComments(comments: Comment[]): Promise<void> {
    const o = open
    if (!o || !Array.isArray(comments)) return
    const u: Record<string, unknown> = {}
    comments.forEach((c) => { if (c && c.id) u[o.base + "/comments/" + c.id] = c })
    if (Object.keys(u).length > 0) await update(ref(db), u).catch(() => undefined)
}
/** The plan as a printable page: opens the browser's print, where it can also be saved as a PDF. */
export function printPlan(html: string): boolean {
    const w = window.open("", "_blank")
    if (!w) return false
    w.document.open(); w.document.write(html); w.document.close()
    w.addEventListener("load", () => setTimeout(() => w.print(), 200))
    return true
}

// ── Running Pagemap ──────────────────────────────────────────────────────────────────────────

export interface Account { uid: string; name: string; email: string; ws: string; wsName: string; bytes: number; created: number; cleared: number; blocked: boolean }
export function isSiteAdmin(uid: string): Promise<boolean> {
    return once(ref(db, "admins/" + uid)).then((s) => s.val() === true, () => false)
}
let accountsOff: (() => void) | null = null
export function watchAccounts(cb: (a: Account[]) => void): () => void {
    accountsOff?.()
    let accounts: Record<string, Omit<Account, "uid" | "blocked">> = {}, blocked: Record<string, boolean> = {}
    const emit = () => cb(Object.entries(accounts).map(([uid, a]) => ({ uid, name: a.name ?? "", email: a.email ?? "", ws: a.ws ?? "", wsName: a.wsName ?? "",
        bytes: a.bytes ?? 0, created: a.created ?? 0, cleared: a.cleared ?? 0, blocked: blocked[uid] === true })).sort((x, y) => y.created - x.created))
    const a = onValue(ref(db, "accounts"), (s) => { accounts = s.val() ?? {}; emit() }, () => undefined)
    const b = onValue(ref(db, "blocked"), (s) => { blocked = s.val() ?? {}; emit() }, () => undefined)
    accountsOff = () => { a(); b(); accountsOff = null }
    return accountsOff
}
export function setBlocked(uid: string, on: boolean): Promise<void> {
    return on ? set(ref(db, "blocked/" + uid), true) : remove(ref(db, "blocked/" + uid))
}
/** Clear an account (api/API.md): its workspace if it founded one, else its membership; its uploads. */
export async function clearAccount(uid: string): Promise<void> {
    const acct = (await once(ref(db, "accounts/" + uid))).val() ?? {}
    const ws: string = acct.ws ?? (await once(ref(db, "users/" + uid + "/ws"))).val() ?? ""
    if (ws != "") {
        const info = (await once(ref(db, "workspaces/" + ws + "/info"))).val() ?? {}
        if (info.owner == uid) {
            const index = (await once(ref(db, "workspaces/" + ws + "/index"))).val() ?? {}
            const u: Record<string, unknown> = {}
            Object.keys(index).forEach((k) => { u["links/" + k] = null })
            u["workspaces/" + ws] = null
            await update(ref(db), u)
        } else await remove(ref(db, "workspaces/" + ws + "/members/" + uid))
    }
    try {
        const files = await listAll(sref(storage, "uploads/" + uid))
        await Promise.all(files.items.map((f) => deleteObject(f)))
    } catch { /* nothing uploaded */ }
    await remove(ref(db, "users/" + uid))
    await update(ref(db, "accounts/" + uid), { ws: "", wsName: "", bytes: 0, cleared: serverTimestamp() })
}
/** The build now published; development builds ignore it. */
export function watchRelease(cb: (build: string) => void): void {
    onValue(ref(db, "release/build"), (s) => cb(String(s.val() ?? "")), () => undefined)
}
export function archive(ws: string, id: string, on: boolean): Promise<void> {
    return update(ref(db, "workspaces/" + ws + "/index/" + P.idKey(id)), { archived: on })
}

// ── Device memory ────────────────────────────────────────────────────────────────────────────

export function remembered(key: string, fallback: string): string {
    try { return localStorage.getItem("pagemap." + key) ?? fallback } catch { return fallback }
}
export function remember(key: string, value: string): void {
    try { localStorage.setItem("pagemap." + key, value) } catch { /* private window */ }
}

// ── Small host services ──────────────────────────────────────────────────────────────────────

/** Mount a frame into a DOMIsland's box, following the `src` its island provides. */
export function mountFrame(slot: string): void {
    const box = document.querySelector('[data-declare-slot="' + slot + '"]') as (HTMLElement & { __declareIsland?: { watchProvided: (n: string, cb: (v: unknown) => void) => void } }) | null
    if (!box || box.querySelector("iframe")) return
    const frame = document.createElement("iframe")
    frame.title = "PDF"
    frame.style.cssText = "border:0;width:100%;height:100%;background:#fff"
    box.appendChild(frame)
    box.__declareIsland?.watchProvided("src", (v) => { if (typeof v == "string" && v != "" && frame.src != v) frame.src = v })
}
export function copyText(t: string): void { navigator.clipboard?.writeText(t).catch(() => undefined) }
/** This page's own address, for a link that opens the same place. */
export function linkTo(loc: string): string { return location.origin + location.pathname + location.search + "#" + loc }
export function reload(): void { location.reload() }
