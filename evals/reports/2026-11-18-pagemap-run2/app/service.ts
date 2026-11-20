// Pagemap's service: the Firebase emulator suite, reached through the Firebase
// JavaScript SDK. This file is glue to a host library and nothing else: it
// signs people in, reads and writes the tree §3 of the brief describes, and
// renders PDF pages. What a flatplan *means* (folios, spreads, the rules every
// edit keeps) is the Declare side's, in model.declare.
//
// Everything that answers later returns a promise or takes a callback; the
// Declare handler that calls it writes the answer into an attribute.

import { initializeApp } from "firebase/app"
import {
    getAuth, connectAuthEmulator, onAuthStateChanged, signInWithEmailAndPassword,
    createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, updateProfile,
} from "firebase/auth"
import {
    getDatabase, connectDatabaseEmulator, ref, onValue, get, update, set, remove, push,
    serverTimestamp, onDisconnect, query, orderByChild, limitToLast, increment,
} from "firebase/database"
import { getStorage, connectStorageEmulator, ref as sref, uploadBytesResumable, getDownloadURL, listAll, deleteObject } from "firebase/storage"

// ── Connection ─────────────────────────────────────────────────────────────

const HOST = typeof location != "undefined" && location.hostname ? location.hostname : "127.0.0.1"
const fbApp = initializeApp({
    apiKey: "demo-key",
    projectId: "demo-pagemap",
    authDomain: "demo-pagemap.firebaseapp.com",
    databaseURL: "https://demo-pagemap-default-rtdb.firebaseio.com",
    storageBucket: "demo-pagemap.appspot.com",
})
const auth = getAuth(fbApp)
connectAuthEmulator(auth, "http://" + HOST + ":9099", { disableWarnings: true })
const db = getDatabase(fbApp)
connectDatabaseEmulator(db, HOST, 9000)
const storage = getStorage(fbApp)
connectStorageEmulator(storage, HOST, 9199)

/** This window's id: every record it writes carries it. */
const TAB = "w" + Math.random().toString(36).slice(2, 10)
function tabId(): string { return TAB }

/** The build this window runs. A development build ignores `release/build`. */
const BUILD = "dev"
function buildId(): string { return BUILD }

// ── Small pure helpers ─────────────────────────────────────────────────────

function newId(prefix: string): string {
    return prefix + Math.random().toString(36).slice(2, 9)
}
function emailKey(email: string): string { return email.trim().toLowerCase().split(".").join(",") }
function idKey(id: string): string { return encodeURIComponent(id).split(".").join("%2E") }
function initialsOf(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join("").toUpperCase()
}
const TINTS = ["#80a7ff", "#c2f04c", "#ff9f80", "#f5c542", "#7fdcc4", "#d59cf5", "#ff80b5"]
function tintFor(seed: string): string {
    let h = 0
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
    return TINTS[h % TINTS.length]
}

/** "just now", "5 min ago", "1 hour ago", "3 hours ago", "yesterday", "12 Oct". */
function timeAgo(at: number, now: number): string {
    const s = Math.max(0, (now - at) / 1000)
    if (s < 60) return "just now"
    const m = Math.floor(s / 60)
    if (m < 60) return m + " min ago"
    const h = Math.floor(m / 60)
    if (h < 24) return h + (h == 1 ? " hour ago" : " hours ago")
    if (h < 48) return "yesterday"
    const d = new Date(at)
    return d.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]
}

function dateLabel(at: number): string {
    if (!at) return ""
    const d = new Date(at)
    return d.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()] + " " + d.getFullYear()
}

let offset = 0
onValue(ref(db, ".info/serverTimeOffset"), (s) => { offset = Number(s.val() ?? 0) })
function serverNow(): number { return Date.now() + offset }

/** What a service failure says, in Pagemap's words. */
function authMessage(e: any): string {
    const code = String(e?.code ?? "")
    if (code == "auth/invalid-credential" || code == "auth/wrong-password" || code == "auth/user-not-found" || code == "auth/invalid-login-credentials")
        return "That email and password don't match. If you've never set a password, use “Set or reset password”."
    if (code == "auth/invalid-email") return "That isn't a valid email address."
    if (code == "auth/too-many-requests") return "Too many tries. Wait a minute, then try again."
    if (code == "auth/network-request-failed") return "There's no connection to Pagemap's service. Check your connection and try again."
    if (code == "auth/email-already-in-use") return "There's already an account with that email. Sign in instead."
    if (code == "auth/weak-password") return "Choose a password of at least 6 characters."
    if (code == "auth/user-disabled") return "This account has been turned off. Ask the person who runs Pagemap."
    if (String(e?.message ?? "").includes("PERMISSION_DENIED") || code == "PERMISSION_DENIED") return "The service refused it (permission denied)."
    return String(e?.message ?? e ?? "Something went wrong.")
}

// ── Accounts ───────────────────────────────────────────────────────────────

interface Person { uid: string; email: string; name: string }

function watchAuth(each: (p: Person | null) => void): void {
    onAuthStateChanged(auth, (u) => {
        each(u ? { uid: u.uid, email: u.email ?? "", name: u.displayName ?? "" } : null)
    })
}

function signInWith(email: string, password: string): Promise<void> {
    return signInWithEmailAndPassword(auth, email.trim(), password).then(() => undefined)
}

/** Clears an account (F-ADMIN-04): its workspace if it founded it (with every
 *  view-only link of its flatplans), else its membership; its uploads; then
 *  its own records. The sign-in stays. */
async function clearAccount(uid: string): Promise<void> {
    const acc = await readPath("accounts/" + uid)
    const ws = acc?.ws ?? ""
    if (ws != "") {
        const info = await readPath("workspaces/" + ws + "/info").catch(() => null)
        if (info != null && info.owner == uid) {
            const index = await readPath("workspaces/" + ws + "/index").catch(() => null)
            const out: Record<string, any> = {}
            for (const k of Object.keys(index ?? {})) out["links/" + k] = null
            out["workspaces/" + ws] = null
            await update(ref(db), out)
        } else {
            await remove(ref(db, "workspaces/" + ws + "/members/" + uid))
        }
    }
    await clearUploads(uid)
    await update(ref(db), {
        ["users/" + uid]: null, ["accounts/" + uid + "/ws"]: "", ["accounts/" + uid + "/wsName"]: "",
        ["accounts/" + uid + "/bytes"]: 0, ["accounts/" + uid + "/cleared"]: serverTimestamp(),
    })
}

function signUpWith(name: string, email: string, password: string): Promise<string> {
    return createUserWithEmailAndPassword(auth, email.trim(), password).then(async (cred) => {
        await updateProfile(cred.user, { displayName: name.trim() })
        await retry(() => set(ref(db, "accounts/" + cred.user.uid), {
            name: name.trim(), email: email.trim().toLowerCase(), created: serverTimestamp(), ws: "", bytes: 0,
        }))
        return cred.user.uid
    })
}

function resetPassword(email: string): Promise<void> { return sendPasswordResetEmail(auth, email.trim()) }

function signOutNow(): Promise<void> {
    stopPresence()
    return signOut(auth)
}

/** Reads refused in the moments after signing up are tried again a few times. */
async function retry<T>(f: () => Promise<T>, times = 5): Promise<T> {
    let last: any = null
    for (let i = 0; i < times; i++) {
        try { return await f() } catch (e: any) {
            last = e
            if (!String(e?.message ?? e).toLowerCase().includes("permission")) throw e
            await new Promise((r) => setTimeout(r, 300 * (i + 1)))
        }
    }
    throw last
}

async function readPath(path: string): Promise<any> {
    const s = await retry(() => get(ref(db, path)))
    return s.val()
}

interface Resolved { ws: string; role: string; refused: string; founded: boolean }

/** §3.5: blocked, an existing workspace, an invitation, or founding one. */
async function resolveAccount(p: Person, magazine: string, firstName: string,
        starter: (ws: string, uid: string, publication: string) => any): Promise<Resolved> {
    const blocked = await readPath("blocked/" + p.uid).catch(() => null)
    if (blocked === true) return { ws: "", role: "", refused: "This account has been turned off. Ask the person who runs Pagemap.", founded: false }
    const u = await readPath("users/" + p.uid).catch(() => null)
    if (u && u.ws) {
        const m = await readPath("workspaces/" + u.ws + "/members/" + p.uid).catch(() => null)
        if (!m) return { ws: "", role: "", refused: "You're no longer a member of that workspace.", founded: false }
        return { ws: u.ws, role: m.role, refused: "", founded: false }
    }
    const key = emailKey(p.email)
    const inv = await readPath("invites/" + key).catch(() => null)
    const name = p.name || p.email.split("@")[0]
    if (inv && inv.ws) {
        const member = { name: name, email: p.email.toLowerCase(), initials: initialsOf(name), color: tintFor(p.uid), role: inv.role }
        await update(ref(db), {
            ["workspaces/" + inv.ws + "/members/" + p.uid]: member,
            ["users/" + p.uid]: { ws: inv.ws },
        })
        const info = await readPath("workspaces/" + inv.ws + "/info").catch(() => null)
        await update(ref(db, "accounts/" + p.uid), { ws: inv.ws, wsName: info?.name ?? "" })
        await remove(ref(db, "invites/" + key))
        return { ws: inv.ws, role: inv.role, refused: "", founded: false }
    }
    const mag = magazine.trim() != "" ? magazine.trim() : (firstName || name) + "'s Magazine"
    const ws = "ws-" + Math.random().toString(36).slice(2, 10).padEnd(8, "x").slice(0, 8)
    const fp = starter(ws, p.uid, mag)
    await update(ref(db), {
        ["workspaces/" + ws + "/info"]: { name: mag, owner: p.uid, home: fp.id, created: serverTimestamp() },
        ["workspaces/" + ws + "/members/" + p.uid]: { name: name, email: p.email.toLowerCase(), initials: initialsOf(name), color: tintFor(p.uid), role: "admin" },
        ["users/" + p.uid]: { ws: ws },
        ["accounts/" + p.uid + "/ws"]: ws,
        ["accounts/" + p.uid + "/wsName"]: mag,
    })
    await createFlatplan(ws, p.uid, fp)
    return { ws: ws, role: "admin", refused: "", founded: true }
}

// ── The workspace ──────────────────────────────────────────────────────────

const stops: Record<string, () => void> = {}
function stop(name: string) { if (stops[name]) { stops[name](); delete stops[name] } }

/** Follows one place in the tree, replacing whatever followed under `name`. */
function watch(name: string, path: string, each: (v: any) => void, failed?: (msg: string) => void): void {
    stop(name)
    if (path == "") return
    stops[name] = onValue(ref(db, path), (s) => each(s.val()), (e) => { if (failed) failed(authMessage(e)) })
}

/** The newest `n` children of a place, by a field, oldest first. */
function watchNewest(name: string, path: string, field: string, n: number, each: (rows: any[]) => void): void {
    stop(name)
    if (path == "") return
    stops[name] = onValue(query(ref(db, path), orderByChild(field), limitToLast(n)), (s) => {
        const rows: any[] = []
        s.forEach((c) => { rows.push({ ...c.val(), key: c.key }) })
        each(rows)
    }, () => each([]))
}

function unwatch(name: string): void { stop(name) }

function writeMany(updates: Record<string, any>): Promise<void> {
    const out: Record<string, any> = {}
    for (const k of Object.keys(updates)) out[k] = updates[k] === "__now__" ? serverTimestamp() : updates[k]
    return update(ref(db), out)
}
function removeAt(path: string): Promise<void> { return remove(ref(db, path)) }
function pushKey(path: string): string { return push(ref(db, path)).key ?? newId("k") }

// ── A flatplan, record by record (§3.3) ────────────────────────────────────

const FIELDS = ["name", "edition", "publication", "trimW", "trimH", "facing", "numbering", "firstFolio", "notes", "archived", "signatures"]
const LISTS = ["sections", "statuses", "tags", "stories", "pages", "holding", "assets", "bookings", "stitchIns"]

interface Rec { v: string; rev: number; tab: string }

/** What this window last saw of the open flatplan's records, by path under doc/. */
let base = ""
let recs: Record<string, Rec> = {}

const DEFAULTS: Record<string, any> = {
    name: "", edition: "", publication: "", trimW: 9, trimH: 12, facing: true, numbering: "plain", firstFolio: 1,
    notes: "", archived: false, signatures: { cover: [], body: [] },
}

function assemble(doc: any, id: string): any {
    const fp: any = { id: id, ...JSON.parse(JSON.stringify(DEFAULTS)) }
    const fields = doc?.fields ?? {}
    for (const f of Object.keys(fields)) { if (f != "id") { try { fp[f] = JSON.parse(fields[f].v) } catch { } } }
    const lists = doc?.lists ?? {}
    for (const l of LISTS) {
        const L = lists[l] ?? {}
        let order: string[] = []
        try { order = JSON.parse(L.order?.v ?? "[]") ?? [] } catch { }
        const items: Record<string, any> = {}
        const all = L.items ?? {}
        for (const k of Object.keys(all)) {
            try { const v = JSON.parse(all[k].v); if (v != null) items[v.id ?? decodeURIComponent(k)] = v } catch { }
        }
        const out: any[] = []
        const seen = new Set<string>()
        for (const oid of order) if (items[oid] && !seen.has(oid)) { out.push(items[oid]); seen.add(oid) }
        for (const k of Object.keys(items)) if (!seen.has(k)) { out.push(items[k]); seen.add(k) }
        fp[l] = out
    }
    return fp
}

function flatten(doc: any): Record<string, Rec> {
    const out: Record<string, Rec> = {}
    const fields = doc?.fields ?? {}
    for (const f of Object.keys(fields)) out["fields/" + f] = fields[f]
    const lists = doc?.lists ?? {}
    for (const l of Object.keys(lists)) {
        if (lists[l].order) out["lists/" + l + "/order"] = lists[l].order
        const items = lists[l].items ?? {}
        for (const k of Object.keys(items)) out["lists/" + l + "/items/" + k] = items[k]
    }
    return out
}

/** The records a flatplan is stored as: path under doc/ → JSON text. */
function recordsOf(fp: any): Record<string, string> {
    const out: Record<string, string> = {}
    for (const f of FIELDS) if (fp[f] !== undefined) out["fields/" + f] = JSON.stringify(fp[f])
    for (const l of LISTS) {
        const list: any[] = fp[l] ?? []
        out["lists/" + l + "/order"] = JSON.stringify(list.map((x) => x.id))
        for (const x of list) out["lists/" + l + "/items/" + idKey(x.id)] = JSON.stringify(x)
    }
    return out
}

interface Opened { fp: any; byOther: boolean; touched: string[] }

/** Listens to one flatplan's records; each arrival is the assembled flatplan,
 *  whether another window wrote it, and the page ids it touched. */
function openFlatplan(ws: string, id: string, each: (o: Opened) => void, failed: (msg: string) => void): void {
    stop("doc")
    base = ""
    recs = {}
    if (ws == "" || id == "") return
    const path = "workspaces/" + ws + "/flatplans/" + idKey(id) + "/doc"
    stops["doc"] = onValue(ref(db, path), (s) => {
        const doc = s.val()
        if (doc == null) { failed("That flatplan isn't in this workspace."); return }
        const next = flatten(doc)
        let byOther = false
        const touched: string[] = []
        if (base == path) {
            for (const k of Object.keys(next)) {
                const was = recs[k]
                if (!was || was.rev != next[k].rev) {
                    if (next[k].tab != TAB) byOther = true
                    const m = /^lists\/(pages|holding)\/items\/(.+)$/.exec(k)
                    if (m && next[k].tab != TAB) touched.push(decodeURIComponent(m[2]))
                }
            }
        }
        base = path
        recs = next
        each({ fp: assemble(doc, id), byOther: byOther, touched: touched })
    }, (e) => failed(String(e?.message ?? "").includes("ermission") ? "That flatplan isn't in this workspace." : authMessage(e)))
}

function closeFlatplan(): void { stop("doc"); base = ""; recs = {} }

interface Step { label: string; before: Record<string, string>; after: Record<string, string>; revs: Record<string, number> }
interface Sent { ok: boolean; conflict: boolean; error: string; step: Step | null }

/** One edit: every record that differs from what is stored, each a revision
 *  up, with the change log, the index entry and the activity, in one update. */
function commitEdit(ws: string, id: string, uid: string, next: any, label: string, activity: boolean): Promise<Sent> {
    const want = recordsOf(next)
    const before: Record<string, string> = {}
    const after: Record<string, string> = {}
    for (const k of Object.keys(want)) {
        const had = recs[k]
        if (!had || had.v != want[k]) { before[k] = had ? had.v : "null"; after[k] = want[k] }
    }
    // A list entry no longer present is written as null.
    for (const k of Object.keys(recs)) {
        if (/^lists\/.+\/items\//.test(k) && want[k] === undefined && recs[k].v != "null") { before[k] = recs[k].v; after[k] = "null" }
    }
    return sendRecords(ws, id, uid, after, before, label, (next.pages ?? []).length, activity)
}

/** Writes the given records (Undo and Redo write a step's own records back). */
function sendRecords(ws: string, id: string, uid: string, after: Record<string, string>, before: Record<string, string>,
        label: string, pages: number, activity: boolean): Promise<Sent> {
    const keys = Object.keys(after)
    if (keys.length == 0) return Promise.resolve({ ok: true, conflict: false, error: "", step: null })
    const root = "workspaces/" + ws + "/flatplans/" + idKey(id)
    const out: Record<string, any> = {}
    const revs: Record<string, number> = {}
    for (const k of keys) {
        const rev = (recs[k]?.rev ?? 0) + 1
        out[root + "/doc/" + k] = { v: after[k], rev: rev, tab: TAB }
        revs[k] = rev
    }
    const ck = push(ref(db, root + "/changes")).key
    out[root + "/changes/" + ck] = { by: uid, tab: TAB, at: serverTimestamp(), label: label }
    out["workspaces/" + ws + "/index/" + idKey(id) + "/updated"] = serverTimestamp()
    out["workspaces/" + ws + "/index/" + idKey(id) + "/pages"] = pages
    if (activity) {
        const ak = push(ref(db, root + "/activity")).key
        out[root + "/activity/" + ak] = { id: ak, by: uid, at: serverTimestamp(), text: label }
    }
    const step: Step = { label: label, before: before, after: after, revs: revs }
    return update(ref(db), out).then(
        () => ({ ok: true, conflict: false, error: "", step: step }),
        (e) => {
            const msg = String(e?.message ?? e)
            const denied = msg.toLowerCase().includes("permission")
            return { ok: false, conflict: denied, error: denied ? "Someone else changed the flatplan at the same time." : msg, step: null }
        })
}

/** Whether a step's records are still as it left them (nobody changed them since). */
function stepIntact(step: Step): boolean {
    return Object.keys(step.revs).every((k) => (recs[k]?.rev ?? 0) == step.revs[k])
}

function undoStep(ws: string, id: string, uid: string, step: Step, pages: number): Promise<Sent> {
    return sendRecords(ws, id, uid, step.before, step.after, "Undo " + step.label, pages, false)
}
function redoStep(ws: string, id: string, uid: string, step: Step, pages: number): Promise<Sent> {
    return sendRecords(ws, id, uid, step.after, step.before, step.label, pages, false)
}

/** Creates a flatplan: every record at revision 1, and its index entry. */
function createFlatplan(ws: string, uid: string, fp: any): Promise<void> {
    const root = "workspaces/" + ws + "/flatplans/" + idKey(fp.id)
    const out: Record<string, any> = {}
    const all = recordsOf(fp)
    for (const k of Object.keys(all)) out[root + "/doc/" + k] = { v: all[k], rev: 1, tab: TAB }
    out["workspaces/" + ws + "/index/" + idKey(fp.id)] = {
        id: fp.id, name: fp.name, edition: fp.edition, pages: fp.pages.length, updated: serverTimestamp(), archived: false,
    }
    return update(ref(db), out)
}

/** Renaming and archiving keep the list entry in step. */
function updateIndex(ws: string, id: string, fields: Record<string, any>): Promise<void> {
    const out: Record<string, any> = {}
    for (const k of Object.keys(fields)) out["workspaces/" + ws + "/index/" + idKey(id) + "/" + k] = fields[k]
    return update(ref(db), out)
}

// ── View-only links ────────────────────────────────────────────────────────

function linkWorkspace(id: string): Promise<string> {
    return get(ref(db, "links/" + idKey(id))).then((s) => (s.val()?.ws ?? "") as string, () => "")
}
function turnOnLink(ws: string, id: string): Promise<void> {
    return update(ref(db), {
        ["workspaces/" + ws + "/flatplans/" + idKey(id) + "/viewable"]: true,
        ["links/" + idKey(id)]: { ws: ws },
    })
}

// ── Presence (§3.4) ────────────────────────────────────────────────────────

let hereRoot = ""
let hereBy = ""
let herePages = "[]"
let hereTimer: any = null

function startPresence(ws: string, id: string, uid: string): void {
    stopPresence()
    if (ws == "" || id == "" || uid == "") return
    hereRoot = "workspaces/" + ws + "/flatplans/" + idKey(id) + "/here/" + TAB
    hereBy = uid
    onDisconnect(ref(db, hereRoot)).remove().catch(() => { })
    writePresence()
    hereTimer = setInterval(writePresence, 30000)
}
function writePresence(): void {
    if (hereRoot == "") return
    set(ref(db, hereRoot), { by: hereBy, pages: herePages, at: serverTimestamp() }).catch(() => { })
}
function presencePages(ids: string[]): void {
    const next = JSON.stringify(ids)
    if (next == herePages) return
    herePages = next
    writePresence()
}
function stopPresence(): void {
    if (hereTimer) clearInterval(hereTimer)
    hereTimer = null
    if (hereRoot != "") { remove(ref(db, hereRoot)).catch(() => { }); onDisconnect(ref(db, hereRoot)).cancel().catch(() => { }) }
    hereRoot = ""
}

// ── Storage: uploads ───────────────────────────────────────────────────────

function uploadPdf(uid: string, assetId: string, fileUrl: string, progress: (f: number) => void): Promise<string> {
    return fetch(fileUrl).then((r) => r.blob()).then((blob) => new Promise<string>((resolve, reject) => {
        if (blob.size >= 200 * 1024 * 1024) { reject(new Error("The file is over 200 MB.")); return }
        const task = uploadBytesResumable(sref(storage, "uploads/" + uid + "/" + assetId + ".pdf"), blob, { contentType: "application/pdf" })
        task.on("state_changed",
            (s) => progress(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
            (e) => reject(e),
            () => {
                getDownloadURL(task.snapshot.ref).then((url) => {
                    set(ref(db, "accounts/" + uid + "/bytes"), increment(blob.size)).catch(() => { })
                    resolve(url)
                }, reject)
            })
    }))
}

function clearUploads(uid: string): Promise<void> {
    return listAll(sref(storage, "uploads/" + uid)).then((l) => Promise.all(l.items.map((i) => deleteObject(i))).then(() => undefined), () => undefined)
}

// ── PDFs: counted and rendered in the browser, kept on the device ──────────

let pdfjs: any = null
function loadPdfjs(): Promise<any> {
    if (pdfjs) return Promise.resolve(pdfjs)
    const here = new URL("pdfjs/", (globalThis as any).location?.href ?? "http://127.0.0.1/")
    const url = new URL("pdf.min.mjs", here).href
    return import(/* @vite-ignore */ url).then((m: any) => {
        m.GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.mjs", here).href
        pdfjs = m
        return m
    })
}
const docs: Record<string, Promise<any>> = {}
function pdfDoc(url: string): Promise<any> {
    if (!docs[url]) docs[url] = loadPdfjs().then((m) => m.getDocument({ url: url }).promise)
    return docs[url]
}

function pdfPageCount(url: string): Promise<number> {
    return pdfDoc(url).then((d) => d.numPages as number)
}

function cacheGet(key: string): Promise<string> {
    return caches.open("pagemap-art").then((c) => c.match("/art/" + encodeURIComponent(key))).then((r) => r ? r.text() : "", () => "")
}
function cachePut(key: string, value: string): void {
    caches.open("pagemap-art").then((c) => c.put("/art/" + encodeURIComponent(key), new Response(value))).catch(() => { })
}

const rendered: Record<string, Promise<string>> = {}
/** A PDF page as a picture `width` wide: from the device if it was made before. */
function renderPdfPage(url: string, page: number, width: number): Promise<string> {
    const key = url + "#" + page + "@" + width
    if (!rendered[key]) rendered[key] = cacheGet(key).then((hit) => {
        if (hit != "") return hit
        return pdfDoc(url).then((d) => d.getPage(page)).then((p: any) => {
            const v1 = p.getViewport({ scale: 1 })
            const vp = p.getViewport({ scale: width / v1.width })
            const canvas = document.createElement("canvas")
            canvas.width = Math.round(vp.width)
            canvas.height = Math.round(vp.height)
            return p.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise.then(() => {
                const out = canvas.toDataURL("image/jpeg", 0.85)
                cachePut(key, out)
                return out
            })
        })
    })
    return rendered[key]
}

// ── Files ──────────────────────────────────────────────────────────────────

function readText(url: string): Promise<string> { return fetch(url).then((r) => r.text()) }

function dataUrlOf(url: string): Promise<string> {
    return fetch(url).then((r) => r.blob()).then((b) => new Promise<string>((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(String(fr.result))
        fr.onerror = () => reject(fr.error)
        fr.readAsDataURL(b)
    }))
}

/** A backup's PDFs, as data URLs by asset id. */
async function backupFiles(assets: any[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    for (const a of assets) { if (a.url) { try { out[a.id] = await dataUrlOf(a.url) } catch { } } }
    return out
}

// ── The window ─────────────────────────────────────────────────────────────

function goBack(): void { history.back() }
function windowTitle(t: string): void { document.title = t }
function appAddress(): string { return location.origin + location.pathname }
function printWindow(): void { setTimeout(() => window.print(), 400) }
function openTab(url: string): void { window.open(url, "_blank") }
function stored(key: string): string { try { return localStorage.getItem("pagemap." + key) ?? "" } catch { return "" } }
function store(key: string, v: string): void { try { localStorage.setItem("pagemap." + key, v) } catch { } }
function copyText(text: string): Promise<boolean> {
    return navigator.clipboard ? navigator.clipboard.writeText(text).then(() => true, () => false) : Promise.resolve(false)
}
function reloadPage(): void { location.reload() }
