// PDFs in the browser (F-ART-01, -07, -09): count a file's pages, and draw a page as a
// picture at a given width, once — kept on this device (Cache Storage) so the next visit
// shows it without opening the PDF.

import * as pdfjs from "pdfjs-dist"
// The worker's code runs in this page (it registers itself as globalThis.pdfjsWorker), so
// the program needs no separate worker file wherever it is served from.
import "pdfjs-dist/build/pdf.worker.mjs"

const docs = new Map<string, Promise<any>>()
function loadPdf(url: string): Promise<any> {
    let p = docs.get(url)
    if (!p) { p = pdfjs.getDocument({ url: url }).promise; docs.set(url, p) }
    return p
}

function countPdfPages(url: string, done: (n: number, err: string) => void) {
    loadPdf(url).then((d) => done(d.numPages, ""), (e) => { docs.delete(url); done(0, String(e?.message ?? e)) })
}

const made = new Map<string, string>()

// A picture of one page, `width` pixels wide: a blob URL, or "" if it can't be drawn.
function pdfPicture(url: string, page: number, width: number, done: (src: string) => void) {
    const key = url + "#" + page + "@" + width
    const have = made.get(key)
    if (have) { done(have); return }
    const cacheKey = "https://pagemap.local/art/" + encodeURIComponent(key)
    const fromCache = (typeof caches != "undefined")
        ? caches.open("pagemap-art").then((c) => c.match(cacheKey)).catch(() => undefined)
        : Promise.resolve(undefined)
    fromCache.then(async (hit: Response | undefined) => {
        if (hit) { const src = URL.createObjectURL(await hit.blob()); made.set(key, src); done(src); return }
        const d = await loadPdf(url)
        const pg = await d.getPage(page)
        const v1 = pg.getViewport({ scale: 1 })
        const vp = pg.getViewport({ scale: width / v1.width })
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(vp.width)
        canvas.height = Math.round(vp.height)
        await pg.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise
        const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.85))
        if (typeof caches != "undefined") caches.open("pagemap-art").then((c) => c.put(cacheKey, new Response(blob))).catch(() => {})
        const src = URL.createObjectURL(blob)
        made.set(key, src)
        done(src)
    }).catch(() => done(""))
}

// The PDF viewer's pages: each page drawn into a container with a text layer, so its text
// can be selected. `host` is an element the viewer island hands over.
async function renderPdfInto(host: HTMLElement, url: string, scaleMode: string, start: number,
    onPage: (n: number, total: number) => void) {
    host.innerHTML = ""
    const d = await loadPdf(url)
    const total = d.numPages
    const avail = Math.max(200, host.clientWidth - 32)
    const availH = Math.max(200, host.clientHeight - 32)
    const wraps: HTMLElement[] = []
    for (let i = 1; i <= total; i++) {
        const pg = await d.getPage(i)
        const v1 = pg.getViewport({ scale: 1 })
        let scale = 1
        if (scaleMode == "width") scale = avail / v1.width
        else if (scaleMode == "fit") scale = Math.min(avail / v1.width, availH / v1.height)
        else if (scaleMode == "200") scale = 2
        const vp = pg.getViewport({ scale: scale })
        const wrap = document.createElement("div")
        wrap.style.cssText = "position:relative;margin:16px auto;box-shadow:0 2px 10px rgba(0,0,0,.25);background:#fff"
        wrap.style.width = vp.width + "px"
        wrap.style.height = vp.height + "px"
        wrap.dataset.page = String(i)
        const canvas = document.createElement("canvas")
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.round(vp.width * dpr)
        canvas.height = Math.round(vp.height * dpr)
        canvas.style.cssText = "width:100%;height:100%;display:block"
        wrap.appendChild(canvas)
        const text = document.createElement("div")
        text.className = "textLayer"
        text.style.cssText = "position:absolute;inset:0;overflow:hidden;line-height:1;opacity:1;--scale-factor:" + scale
        wrap.appendChild(text)
        host.appendChild(wrap)
        wraps.push(wrap)
        const ctx = canvas.getContext("2d")!
        ctx.scale(dpr, dpr)
        pg.render({ canvasContext: ctx, viewport: vp })
        pg.getTextContent().then((tc: any) => {
            for (const item of tc.items) {
                if (!item.str) continue
                const tx = pdfjs.Util.transform(vp.transform, item.transform)
                const span = document.createElement("span")
                const h = Math.hypot(tx[2], tx[3])
                span.textContent = item.str
                span.style.cssText = "position:absolute;white-space:pre;color:transparent;cursor:text;transform-origin:0 0;left:" + tx[4] + "px;top:" + (tx[5] - h) + "px;font-size:" + h + "px;font-family:sans-serif"
                text.appendChild(span)
            }
        }).catch(() => {})
        if (i == start) setTimeout(() => wrap.scrollIntoView({ block: "start" }), 0)
    }
    const report = () => {
        const top = host.getBoundingClientRect().top
        let cur = 1
        for (const w of wraps) if (w.getBoundingClientRect().top - top < host.clientHeight / 3) cur = Number(w.dataset.page)
        onPage(cur, total)
    }
    host.onscroll = report
    report()
}

// Mount the viewer into its island once the island's box exists.
function mountPdf(url: string, zoom: string, start: number, onPage: (n: number, total: number) => void) {
    const tryMount = (left: number) => {
        const slot = document.querySelector('[data-declare-slot="pagemap-pdf"]') as HTMLElement | null
        if (!slot || slot.clientWidth == 0) { if (left > 0) setTimeout(() => tryMount(left - 1), 60); return }
        let host = slot.querySelector(".pagemap-pdf-host") as HTMLElement | null
        if (!host) {
            host = document.createElement("div")
            host.className = "pagemap-pdf-host"
            host.style.cssText = "position:absolute;inset:0;overflow:auto;-webkit-overflow-scrolling:touch;user-select:text;-webkit-user-select:text"
            slot.appendChild(host)
        }
        renderPdfInto(host, url, zoom, start, onPage).catch(() => {})
    }
    tryMount(40)
}
