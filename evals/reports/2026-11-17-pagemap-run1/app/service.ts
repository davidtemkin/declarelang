// Pagemap's conversation with its service: Firebase (Authentication, Realtime Database,
// Storage), as the brief's §3 describes it. This file is glue to a host library and
// nothing else: every function takes plain values and answers through a callback with
// plain JSON, which the program writes into its own attributes and datasets.
//
// The one piece of state kept here is what a window must remember about the records it
// writes — the revision each was last seen at, and the edits still in flight — because
// that is the database's bookkeeping, not anything a view shows.

import { initializeApp } from "firebase/app"
import {
    getAuth, connectAuthEmulator, onAuthStateChanged, signInWithEmailAndPassword,
    createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail, signOut,
} from "firebase/auth"
import {
    getDatabase, connectDatabaseEmulator, ref, onValue, get, update, set, remove, push,
    serverTimestamp, onDisconnect, query, limitToLast, orderByKey,
} from "firebase/database"
import {
    getStorage, connectStorageEmulator, ref as storageRef, uploadBytesResumable,
    getDownloadURL, listAll, deleteObject,
} from "firebase/storage"

const HOST = (typeof location != "undefined" && location.hostname) ? location.hostname : "127.0.0.1"

const fbApp = initializeApp({
    apiKey: "demo-key",
    projectId: "demo-pagemap",
    authDomain: "demo-pagemap.firebaseapp.com",
    databaseURL: "https://demo-pagemap-default-rtdb.firebaseio.com",
    storageBucket: "demo-pagemap.appspot.com",
})
const fbAuth = getAuth(fbApp)
connectAuthEmulator(fbAuth, "http://" + HOST + ":9099", { disableWarnings: true })
const fbDb = getDatabase(fbApp)
connectDatabaseEmulator(fbDb, HOST, 9000)
const fbStorage = getStorage(fbApp)
connectStorageEmulator(fbStorage, HOST, 9199)

// The marker a write uses for "the server's time".
const SERVER_TIME = "__server_time__"

// This window's id, for `tab` on every record it writes and its presence entry.
const TAB_ID = "w" + Math.random().toString(36).slice(2, 10)
function tabId(): string { return TAB_ID }

// ── Keys ─────────────────────────────────────────────────────────────────────

function idKey(id: string): string { return encodeURIComponent(id).replace(/\./g, "%2E") }
function emailKey(email: string): string { return email.trim().toLowerCase().replace(/\./g, ",") }

// ── Messages ─────────────────────────────────────────────────────────────────

function errCode(e: any): string { return (e && (e.code || e.message)) ? String(e.code || e.message) : String(e) }

function authMessage(code: string): string {
    if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")
        || code.includes("invalid-login-credentials"))
        return "That email and password don't match. If you've never set a password, use “Set or reset password”."
    if (code.includes("invalid-email")) return "That isn't a valid email address."
    if (code.includes("too-many-requests")) return "Too many tries. Wait a minute, then try again."
    if (code.includes("network-request-failed")) return "Pagemap can't reach its service. Check your connection, then try again."
    if (code.includes("email-already-in-use")) return "There's already an account with that email. Sign in instead."
    if (code.includes("weak-password")) return "Choose a password of at least 6 characters."
    if (code.includes("user-disabled")) return "This account has been turned off. Ask the person who runs Pagemap."
    return "Something went wrong: " + code.replace(/^auth\//, "").replace(/-/g, " ") + "."
}

function plainReason(e: any): string {
    const c = errCode(e)
    if (c.toLowerCase().includes("permission")) return "the service refused it (permission denied)"
    if (c.toLowerCase().includes("network") || c.toLowerCase().includes("disconnect")) return "no connection"
    return c.replace(/^\w+\//, "").replace(/-/g, " ")
}

// ── Authentication ───────────────────────────────────────────────────────────

type Person = { uid: string, email: string, name: string }

function watchAuth(cb: (p: Person | null) => void) {
    onAuthStateChanged(fbAuth, (u) => cb(u ? { uid: u.uid, email: u.email ?? "", name: u.displayName ?? "" } : null))
}

function authSignIn(email: string, password: string, done: (err: string) => void) {
    signInWithEmailAndPassword(fbAuth, email.trim(), password)
        .then(() => done(""), (e) => done(authMessage(errCode(e))))
}

function authSignUp(name: string, email: string, password: string, done: (err: string, uid: string) => void) {
    createUserWithEmailAndPassword(fbAuth, email.trim(), password)
        .then(async (cred) => {
            await updateProfile(cred.user, { displayName: name })
            await retry(() => set(ref(fbDb, "accounts/" + cred.user.uid),
                { name: name, email: email.trim(), created: serverTimestamp(), ws: "", bytes: 0 }))
            done("", cred.user.uid)
        }, (e) => done(authMessage(errCode(e)), ""))
        .catch((e) => done("Your account was made, but it couldn't be set up: " + plainReason(e), ""))
}

function authReset(email: string, done: (err: string) => void) {
    sendPasswordResetEmail(fbAuth, email.trim()).then(() => done(""), (e) => done(authMessage(errCode(e))))
}

function authSignOut(done: () => void) {
    signOut(fbAuth).then(() => done(), () => done())
}

// Reads refused in the moments after signing up are tried again a few times.
async function retry<T>(f: () => Promise<T>, tries = 5): Promise<T> {
    for (let i = 0; ; i++) {
        try { return await f() } catch (e) {
            if (i >= tries - 1 || !errCode(e).toLowerCase().includes("permission")) throw e
            await new Promise((r) => setTimeout(r, 250 * (i + 1)))
        }
    }
}

// ── The database, as plain values ────────────────────────────────────────────

// Replace the server-time marker, at any depth, with the real sentinel.
function withServerTime(v: any): any {
    if (v === SERVER_TIME) return serverTimestamp()
    if (v && typeof v == "object" && !Array.isArray(v)) {
        const o: any = {}
        for (const k of Object.keys(v)) o[k] = withServerTime(v[k])
        return o
    }
    return v
}

function read(path: string, done: (v: any, err: string) => void) {
    retry(() => get(ref(fbDb, path))).then((s) => done(s.val(), ""), (e) => done(null, plainReason(e)))
}

function write(updates: object, done: (err: string) => void) {
    const u: any = {}
    for (const [k, v] of Object.entries(updates)) u[k] = withServerTime(v)
    update(ref(fbDb), u).then(() => done(""), (e) => done(plainReason(e)))
}

function newPushKey(path: string): string { return push(ref(fbDb, path)).key ?? ("k" + Date.now()) }

const listeners = new Map<number, () => void>()
let nextListener = 1

// Listen to a path; `cb` hears its value (null when absent) every time it changes,
// and `fail` once if reading it is refused.
function listen(path: string, cb: (v: any) => void, fail: (err: string) => void): number {
    const id = nextListener++
    const off = onValue(ref(fbDb, path), (s) => cb(s.val()), (e) => fail(plainReason(e)))
    listeners.set(id, off)
    return id
}

// The newest `n` children of a path, oldest first.
function listenNewest(path: string, n: number, cb: (v: any) => void, fail: (err: string) => void): number {
    const id = nextListener++
    const off = onValue(query(ref(fbDb, path), orderByKey(), limitToLast(n)), (s) => {
        const out: any[] = []
        s.forEach((c) => { out.push(c.val()); return false })
        cb(out)
    }, (e) => fail(plainReason(e)))
    listeners.set(id, off)
    return id
}

function unlisten(id: number) {
    const off = listeners.get(id)
    if (off) { off(); listeners.delete(id) }
}

// The server's clock, as an offset from this device's.
let serverOffset = 0
onValue(ref(fbDb, ".info/serverTimeOffset"), (s) => { serverOffset = Number(s.val() ?? 0) })
function serverNow(): number { return Date.now() + serverOffset }

// ── Presence ─────────────────────────────────────────────────────────────────

let presencePath = ""

function presenceHere(path: string, uid: string, pages: string[]) {
    if (presencePath != path && presencePath != "") remove(ref(fbDb, presencePath)).catch(() => {})
    if (presencePath != path) onDisconnect(ref(fbDb, path)).remove().catch(() => {})
    presencePath = path
    set(ref(fbDb, path), { by: uid, pages: JSON.stringify(pages), at: serverTimestamp() }).catch(() => {})
}

function presenceGone(done: () => void) {
    if (presencePath == "") { done(); return }
    const p = presencePath
    presencePath = ""
    onDisconnect(ref(fbDb, p)).cancel().catch(() => {})
    remove(ref(fbDb, p)).then(() => done(), () => done())
}

// ── Storage ──────────────────────────────────────────────────────────────────

function uploadPdf(uid: string, assetId: string, fileUrl: string, progress: (f: number) => void,
    done: (err: string, url: string, size: number) => void) {
    fetch(fileUrl).then((r) => r.blob()).then((blob) => {
        if (blob.size >= 200 * 1024 * 1024) { done("it is 200 MB or larger", "", 0); return }
        const r = storageRef(fbStorage, "uploads/" + uid + "/" + assetId + ".pdf")
        const task = uploadBytesResumable(r, blob, { contentType: "application/pdf" })
        task.on("state_changed", (s) => progress(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
            (e) => done(plainReason(e), "", 0),
            () => getDownloadURL(r).then((url) => done("", url, blob.size), (e) => done(plainReason(e), "", 0)))
    }, (e) => done(plainReason(e), "", 0))
}

function deleteUploads(uid: string, done: (err: string) => void) {
    listAll(storageRef(fbStorage, "uploads/" + uid))
        .then((l) => Promise.all(l.items.map((i) => deleteObject(i))))
        .then(() => done(""), (e) => done(plainReason(e)))
}

// ── A flatplan, record by record (§3.3) ──────────────────────────────────────

const LISTS = ["sections", "statuses", "tags", "stories", "pages", "holding", "assets", "bookings", "stitchIns"]
const NOT_FIELDS = ["id", "revision", "updated", ...LISTS]

type Rec = { v: string, rev: number, tab: string }
type Records = Map<string, Rec>

// Sort an object's keys at every depth, so two equal values have equal text.
function canon(v: any): string {
    if (v === undefined) return "null"
    if (v === null || typeof v != "object") return JSON.stringify(v)
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]"
    return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}"
}
function sameText(a: string, b: string): boolean {
    if (a == b) return true
    try { return canon(JSON.parse(a)) == canon(JSON.parse(b)) } catch (e) { return false }
}

// A flatplan as the records it is stored as: path (under doc/) → JSON text.
function encode(doc: any): Map<string, string> {
    const out = new Map<string, string>()
    for (const k of Object.keys(doc)) {
        if (NOT_FIELDS.includes(k) || doc[k] === undefined) continue
        out.set("fields/" + k, JSON.stringify(doc[k]))
    }
    for (const l of LISTS) {
        const items: any[] = doc[l] ?? []
        out.set("lists/" + l + "/order", JSON.stringify(items.map((i) => i.id)))
        for (const it of items) out.set("lists/" + l + "/items/" + idKey(it.id), JSON.stringify(it))
    }
    return out
}

// The flatplan, assembled from its records: each list in its order record's order, with
// any item missing from the order appended after.
function assemble(id: string, recs: Records): any {
    const doc: any = { id: id }
    for (const [p, r] of recs) {
        if (!p.startsWith("fields/")) continue
        try { doc[p.slice(7)] = JSON.parse(r.v) } catch (e) { }
    }
    for (const l of LISTS) {
        const byId = new Map<string, any>()
        const prefix = "lists/" + l + "/items/"
        for (const [p, r] of recs) {
            if (!p.startsWith(prefix)) continue
            try { const it = JSON.parse(r.v); if (it && it.id != null) byId.set(String(it.id), it) } catch (e) { }
        }
        let order: string[] = []
        const o = recs.get("lists/" + l + "/order")
        if (o) { try { order = JSON.parse(o.v) ?? [] } catch (e) { } }
        const out: any[] = []
        for (const i of order) { const it = byId.get(i); if (it) { out.push(it); byId.delete(i) } }
        for (const it of byId.values()) out.push(it)
        doc[l] = out
    }
    if (doc.signatures == null) doc.signatures = { cover: [], body: [] }
    return doc
}

function flatten(raw: any): Records {
    const recs: Records = new Map()
    if (!raw) return recs
    for (const [k, r] of Object.entries<any>(raw.fields ?? {})) recs.set("fields/" + k, { v: r.v, rev: r.rev, tab: r.tab ?? "" })
    for (const [l, lv] of Object.entries<any>(raw.lists ?? {})) {
        if (lv.order) recs.set("lists/" + l + "/order", { v: lv.order.v, rev: lv.order.rev, tab: lv.order.tab ?? "" })
        for (const [k, r] of Object.entries<any>(lv.items ?? {})) recs.set("lists/" + l + "/items/" + k, { v: r.v, rev: r.rev, tab: r.tab ?? "" })
    }
    return recs
}

// The records a step changed, and what each held before and after it.
type Step = { label: string, before: Record<string, string>, after: Record<string, string> }

class DocSync {
    base: string
    wsBase: string
    fp: string
    uid: string
    stored: Records = new Map()
    pending: Map<string, Rec>[] = []
    loaded = false
    listener = 0
    onDoc: (doc: any, touched: string[], others: boolean) => void
    onFail: (err: string) => void

    constructor(ws: string, fp: string, uid: string, onDoc: (doc: any, touched: string[], others: boolean) => void,
        onFail: (err: string) => void) {
        this.wsBase = "workspaces/" + ws
        this.base = this.wsBase + "/flatplans/" + idKey(fp)
        this.fp = fp
        this.uid = uid
        this.onDoc = onDoc
        this.onFail = onFail
        this.listener = listen(this.base + "/doc", (raw) => this.arrived(raw), (err) => this.onFail(err))
    }

    close() { unlisten(this.listener) }

    // What this window shows: the stored records, with its own edits in flight laid over.
    local(): Records {
        const out: Records = new Map(this.stored)
        for (const p of this.pending) for (const [k, r] of p) {
            const s = out.get(k)
            if (!s || r.rev > s.rev) out.set(k, r)
        }
        return out
    }

    arrived(raw: any) {
        if (raw == null) { const was = this.loaded; this.loaded = false; this.onFail(was ? "gone" : "missing"); return }
        const before = this.stored
        this.stored = flatten(raw)
        // Pages another window changed, to mark them briefly.
        const touched: string[] = []
        let others = false
        if (this.loaded) {
            for (const [k, r] of this.stored) {
                const b = before.get(k)
                if (b && b.rev == r.rev) continue
                if (r.tab == TAB_ID) continue
                others = true
                if (k.startsWith("lists/pages/items/")) {
                    try { const it = JSON.parse(r.v); if (it && it.id) touched.push(it.id) } catch (e) { }
                }
            }
        }
        // Edits of ours the store has now taken are no longer in flight.
        this.pending = this.pending.filter((p) => [...p].some(([k, r]) => (this.stored.get(k)?.rev ?? 0) < r.rev))
        this.loaded = true
        this.onDoc(assemble(this.fp, this.local()), touched, others)
    }

    // Write the records whose text differs between the window's view and `next`, as one
    // update. `done(ok, conflict, reason, step)`.
    edit(label: string, next: any, activity: boolean, done: (ok: boolean, conflict: boolean, reason: string, step: Step | null) => void) {
        const cur = this.local()
        const want = encode(next)
        const changes = new Map<string, string>()
        for (const [k, v] of want) { const c = cur.get(k); if (!c || !sameText(c.v, v)) changes.set(k, v) }
        for (const [k, c] of cur) {
            if (want.has(k) || c.v == "null") continue
            if (k.startsWith("lists/") && k.includes("/items/")) changes.set(k, "null")
        }
        const step: Step = { label: label, before: {}, after: {} }
        for (const [k, v] of changes) { step.before[k] = cur.get(k)?.v ?? "null"; step.after[k] = v }
        this.send(label, changes, next.pages?.length ?? 0, indexFacts(next), activity, step, done)
    }

    // Put records back as a step had them (undo: to `before`; redo: to `after`), refused
    // when anyone has changed them since.
    replay(label: string, from: Record<string, string>, to: Record<string, string>,
        done: (ok: boolean, conflict: boolean, reason: string, step: Step | null) => void) {
        const cur = this.local()
        for (const [k, v] of Object.entries(from)) {
            const c = cur.get(k)?.v ?? "null"
            if (!sameText(c, v)) { done(false, true, "changed", null); return }
        }
        const changes = new Map<string, string>(Object.entries(to))
        const recs = new Map(cur)
        for (const [k, v] of changes) recs.set(k, { v: v, rev: 0, tab: "" })
        const doc = assemble(this.fp, recs)
        this.send(label, changes, doc.pages.length, indexFacts(doc), false, { label: label, before: from, after: to }, done)
    }

    send(label: string, changes: Map<string, string>, pages: number, facts: any, activity: boolean, step: Step,
        done: (ok: boolean, conflict: boolean, reason: string, step: Step | null) => void) {
        if (changes.size == 0) { done(true, false, "", null); return }
        const cur = this.local()
        const recs = new Map<string, Rec>()
        const u: any = {}
        for (const [k, v] of changes) {
            const r = { v: v, rev: (cur.get(k)?.rev ?? 0) + 1, tab: TAB_ID }
            recs.set(k, r)
            u[this.base + "/doc/" + k] = r
        }
        const ck = newPushKey(this.base + "/changes")
        u[this.base + "/changes/" + ck] = { by: this.uid, tab: TAB_ID, at: serverTimestamp(), label: label }
        const ix = this.wsBase + "/index/" + idKey(this.fp)
        u[ix + "/updated"] = serverTimestamp()
        u[ix + "/pages"] = pages
        u[ix + "/id"] = this.fp
        for (const [k, v] of Object.entries<any>(facts)) u[ix + "/" + k] = v
        if (activity) {
            const ak = newPushKey(this.base + "/activity")
            u[this.base + "/activity/" + ak] = { id: ak, by: this.uid, at: serverTimestamp(), text: label }
        }
        this.pending.push(recs)
        const based = new Map<string, number>()
        for (const k of changes.keys()) based.set(k, this.stored.get(k)?.rev ?? 0)
        update(ref(fbDb), u).then(() => done(true, false, "", step), (e) => {
            // Refused: the window shows the flatplan as stored, its own edits gone.
            const conflict = [...based].some(([k, rev]) => (this.stored.get(k)?.rev ?? 0) != rev)
                || errCode(e).toLowerCase().includes("permission")
            this.pending = []
            this.onDoc(assemble(this.fp, this.stored), [], false)
            done(false, conflict, plainReason(e), null)
        })
    }
}

function indexFacts(doc: any): any {
    const f: any = {}
    if (doc.name != null) f.name = doc.name
    if (doc.edition != null) f.edition = doc.edition
    if (doc.archived != null) f.archived = !!doc.archived
    return f
}

let syncs = new Map<number, DocSync>()
let nextSync = 1

function openDoc(ws: string, fp: string, uid: string, onDoc: (doc: any, touched: string[], others: boolean) => void,
    onFail: (err: string) => void): number {
    const id = nextSync++
    syncs.set(id, new DocSync(ws, fp, uid, onDoc, onFail))
    return id
}
function closeDoc(id: number) { syncs.get(id)?.close(); syncs.delete(id) }
function editDoc(id: number, label: string, next: object, activity: boolean,
    done: (ok: boolean, conflict: boolean, reason: string, step: Step | null) => void) {
    const s = syncs.get(id)
    if (!s) { done(false, false, "the flatplan isn't open", null); return }
    s.edit(label, next, activity, done)
}
function replayDoc(id: number, label: string, from: Record<string, string>, to: Record<string, string>,
    done: (ok: boolean, conflict: boolean, reason: string, step: Step | null) => void) {
    const s = syncs.get(id)
    if (!s) { done(false, false, "the flatplan isn't open", null); return }
    s.replay(label, from, to, done)
}

// A new flatplan's records, all at revision 1, with its index entry: one update.
function createDoc(ws: string, doc: any, uid: string, done: (err: string) => void) {
    const base = "workspaces/" + ws + "/flatplans/" + idKey(doc.id)
    const u: any = {}
    for (const [k, v] of encode(doc)) u[base + "/doc/" + k] = { v: v, rev: 1, tab: TAB_ID }
    u["workspaces/" + ws + "/index/" + idKey(doc.id)] = {
        id: doc.id, name: doc.name, edition: doc.edition ?? "", pages: (doc.pages ?? []).length,
        updated: serverTimestamp(), archived: !!doc.archived,
    }
    const ck = newPushKey(base + "/changes")
    u[base + "/changes/" + ck] = { by: uid, tab: TAB_ID, at: serverTimestamp(), label: "Create " + doc.name }
    update(ref(fbDb), u).then(() => done(""), (e) => done(plainReason(e)))
}

// ── Files on this device ─────────────────────────────────────────────────────

function downloadText(name: string, text: string) {
    const blob = new Blob([text], { type: name.endsWith(".csv") ? "text/csv" : "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = name
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000)
}

function readText(url: string, done: (text: string, err: string) => void) {
    fetch(url).then((r) => r.text()).then((t) => done(t, ""), (e) => done("", plainReason(e)))
}

// Each asset's PDF as a data URL, for a backup.
function pdfsAsDataUrls(urls: Record<string, string>, done: (files: Record<string, string>) => void) {
    const out: Record<string, string> = {}
    const ids = Object.keys(urls).filter((k) => urls[k])
    Promise.all(ids.map((id) => fetch(urls[id]).then((r) => r.blob()).then((b) => new Promise<void>((res) => {
        const fr = new FileReader()
        fr.onload = () => { out[id] = String(fr.result); res() }
        fr.onerror = () => res()
        fr.readAsDataURL(b)
    })).catch(() => {}))).then(() => done(out))
}

function goBack() { history.back() }
function printPage() { window.print() }
function appAddress(): string { return location.origin + location.pathname }
function reloadPage() { location.reload() }
function deviceGet(key: string): string { try { return localStorage.getItem("pagemap." + key) ?? "" } catch (e) { return "" } }
function deviceSet(key: string, v: string) { try { localStorage.setItem("pagemap." + key, v) } catch (e) { } }
