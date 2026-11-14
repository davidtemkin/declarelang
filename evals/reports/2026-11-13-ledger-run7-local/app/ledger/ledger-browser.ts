// ledger-browser.ts — the one thing Ledger asks of the browser that the
// language doesn't cover: handing the person a file. Loaded with
// `script [ "ledger-browser.ts", host = browser ]`.

/** Gives the person `text` as a file named `name`, as the browser downloads one. */
export function downloadText(name: string, text: string, type: string = "text/csv"): void {
    const blob = new Blob([text], { type: type + ";charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.style.display = "none"
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
