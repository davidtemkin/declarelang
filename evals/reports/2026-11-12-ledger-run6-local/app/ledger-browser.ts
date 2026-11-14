// The one thing Ledger asks of the browser itself: saving a file the person
// downloads (the CSV export).

function downloadText(name: string, text: string, type: string): void {
    const blob = new Blob([text], { type: type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}
