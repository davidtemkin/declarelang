const base = 'http://127.0.0.1:8361'
const { decks } = await (await fetch(base + '/api/decks')).json()
const q = decks.find((d) => d.title === 'Quarterly review')
const first = await (await fetch(`${base}/api/slides/${(await (await fetch(`${base}/api/decks/${q.id}`)).json()).slideOrder[0]}`)).json()
console.log('copy title:', first.elements.find((e) => e.kind === 'text')?.text.content)
for (const id of ['d1', 'd2', 'd3']) {
  const deck = await (await fetch(`${base}/api/decks/${id}`)).json()
  const { slides } = await (await fetch(`${base}/api/decks/${id}/slides`)).json()
  console.log(id, 'deck v', deck.version, 'slide versions', [...new Set(slides.map((s) => s.version))])
}
for (const d of decks) if (!['d1', 'd2', 'd3'].includes(d.id)) await fetch(`${base}/api/decks/${d.id}`, { method: 'DELETE' })
console.log('left:', (await (await fetch(base + '/api/decks')).json()).decks.map((d) => d.id))
