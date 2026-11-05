import type { StoreApi } from 'zustand/vanilla'
import { api, ApiError } from '../api/client'
import type { Deck, Slide, SlideContent } from '../api/types'
import { insertSlide, removeSlide, sameContent, type DocState } from './doc'
import type { EditorState } from './store'

/** How long after the last edit a save starts. The brief allows two seconds; this leaves room for the write. */
const SAVE_DELAY_MS = 700
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000]
const POLL_MS = 4000

interface RemoteSlide {
  serverId: string
  version: number
  /** The content the service holds, as far as we know. */
  saved: SlideContent
}

type Operation =
  | { kind: 'create'; key: string }
  | { kind: 'put'; key: string }
  | { kind: 'delete'; key: string }
  | { kind: 'patch' }

/**
 * Keeps the service in step with the editor. It watches the store, works out what differs from what
 * the service last confirmed, and sends one request at a time until nothing does. Nothing is ever
 * dropped: a write that fails stays different from what was confirmed, so it is simply tried again.
 *
 * It also looks for changes made elsewhere: a slide saved in another window becomes a conflict for
 * the person to settle, and slides added, removed or reordered elsewhere are merged in.
 */
export class SyncEngine {
  private readonly store: StoreApi<EditorState>
  private readonly deckId: string
  private remote = new Map<string, RemoteSlide>()
  private deck: { version: number; title: string; slideOrder: string[] }
  private timer: ReturnType<typeof setTimeout> | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private running = false
  private failures = 0
  private stopped = false
  private unsubscribe: (() => void) | null = null
  private polling = false
  private patchRefused = false
  private closing = false

  constructor(store: StoreApi<EditorState>, deck: Deck, slides: Slide[]) {
    this.store = store
    this.deckId = deck.id
    this.deck = { version: deck.version, title: deck.title, slideOrder: deck.slideOrder }
    for (const slide of slides) {
      this.remote.set(slide.id, { serverId: slide.id, version: slide.version, saved: contentOf(slide) })
    }
  }

  start() {
    this.stopped = false
    this.closing = false
    this.unsubscribe = this.store.subscribe((state, previous) => {
      if (state.doc !== previous.doc || state.title !== previous.title) this.schedule()
      if (state.currentSlide !== previous.currentSlide) void this.poll()
    })
    this.pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.poll()
    }, POLL_MS)
    window.addEventListener('focus', this.onFocus)
    window.addEventListener('online', this.onOnline)
    window.addEventListener('beforeunload', this.onBeforeUnload)
  }

  stop() {
    this.stopped = true
    this.unsubscribe?.()
    if (this.timer) clearTimeout(this.timer)
    if (this.pollTimer) clearInterval(this.pollTimer)
    window.removeEventListener('focus', this.onFocus)
    window.removeEventListener('online', this.onOnline)
    window.removeEventListener('beforeunload', this.onBeforeUnload)
  }

  /**
   * Called when the presentation is closed. It stops watching for changes but keeps trying to save
   * what is still unsaved, however long that takes, and only then lets go. Resolves once saved.
   */
  close(): Promise<void> {
    this.closing = true
    this.unsubscribe?.()
    this.unsubscribe = null
    if (this.pollTimer) clearInterval(this.pollTimer)
    window.removeEventListener('focus', this.onFocus)
    return new Promise((resolve) => {
      this.onClosed = resolve
      void this.saveNow()
    })
  }

  private onClosed: (() => void) | null = null

  /** Saves now (Command-S), and resolves once everything that can be saved has been. */
  async saveNow(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.failures = 0
    await this.flush()
  }

  /** Whether anything here has not yet reached the service. */
  hasUnsavedWork(): boolean {
    return this.nextOperation(true) !== null || this.running
  }

  /** Settles a conflict on one slide: take the copy saved elsewhere, or keep this one and save it over that. */
  resolveConflict(key: string, choice: 'theirs' | 'mine') {
    const state = this.store.getState()
    const theirs = state.conflicts[key]
    const record = this.remote.get(key)
    if (!theirs) return
    if (record) {
      record.version = theirs.version
      record.saved = contentOf(theirs)
    }
    if (choice === 'theirs') state.actions.takeTheirs(key)
    state.actions.setConflict(key, null)
    this.schedule(0)
  }

  /** Server id → editor key, for slides we know. */
  private keyForServerId(serverId: string): string | undefined {
    for (const [key, record] of this.remote) if (record.serverId === serverId) return key
    return undefined
  }

  private schedule(delay = SAVE_DELAY_MS) {
    if (this.stopped) return
    this.updateStatus()
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, delay)
  }

  private updateStatus() {
    const { actions } = this.store.getState()
    if (this.failures > 0) actions.setSaveState('offline')
    else if (this.running || this.timer || this.nextOperation(true)) actions.setSaveState('saving')
    else actions.setSaveState('saved')
  }

  /**
   * The next request to send, in an order the service accepts: new slides first (so a deck is
   * never left empty), then content, then removals, then the order and title.
   */
  private nextOperation(includeConflicted = false): Operation | null {
    const { doc, title, conflicts } = this.store.getState()
    for (const key of doc.order) if (!this.remote.has(key)) return { kind: 'create', key }
    for (const key of doc.order) {
      const record = this.remote.get(key)!
      if ((includeConflicted || !conflicts[key]) && !sameContent(doc.slides[key], record.saved)) return { kind: 'put', key }
    }
    for (const key of this.remote.keys()) if (!doc.slides[key]) return { kind: 'delete', key }
    const order = doc.order.map((k) => this.remote.get(k)!.serverId)
    if (title !== this.deck.title || !sameList(order, this.deck.slideOrder)) return { kind: 'patch' }
    return null
  }

  private async flush() {
    if (this.running || this.stopped) return
    this.running = true
    this.updateStatus()
    try {
      for (let op = this.nextOperation(); op && !this.stopped; op = this.nextOperation()) {
        await this.perform(op)
        this.failures = 0
      }
    } catch (error) {
      if (error instanceof ApiError && !error.isRetryable) console.error('Presentify could not save:', error)
      this.failures += 1
      const delay = RETRY_DELAYS_MS[Math.min(this.failures - 1, RETRY_DELAYS_MS.length - 1)]
      this.running = false
      this.schedule(delay)
      return
    }
    this.running = false
    this.updateStatus()
    if (this.closing && !this.nextOperation(true)) {
      this.stop()
      this.onClosed?.()
    }
  }

  private async perform(op: Operation) {
    const { doc, title } = this.store.getState()
    switch (op.kind) {
      case 'create': {
        const content = doc.slides[op.key]
        const index = doc.order.indexOf(op.key)
        const before = doc.order.slice(0, index).reverse().find((k) => this.remote.has(k))
        const after = before ? this.remote.get(before)!.serverId : null
        const result = await api.createSlide(this.deckId, {
          after,
          background: content.background,
          elements: content.elements,
        })
        this.remote.set(op.key, { serverId: result.slide.id, version: result.slide.version, saved: contentOf(result.slide) })
        this.adoptDeck(result.deck)
        return
      }
      case 'put': {
        const record = this.remote.get(op.key)!
        const content = doc.slides[op.key]
        try {
          const saved = await api.putSlide(record.serverId, record.version, content)
          record.version = saved.version
          record.saved = content
        } catch (error) {
          if (!(error instanceof ApiError)) throw error
          if (error.code === 'conflict') {
            const current = (error.current as Slide | undefined) ?? (await api.getSlide(record.serverId))
            this.store.getState().actions.setConflict(op.key, current)
          } else if (error.code === 'not_found') {
            // Deleted elsewhere while it was being edited here: it is made again, so no work is lost.
            this.remote.delete(op.key)
          } else {
            throw error
          }
        }
        return
      }
      case 'delete': {
        const record = this.remote.get(op.key)!
        try {
          const result = await api.deleteSlide(record.serverId)
          this.adoptDeck(result.deck)
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== 'not_found') throw error
        }
        this.remote.delete(op.key)
        return
      }
      case 'patch': {
        const order = doc.order.map((k) => this.remote.get(k)!.serverId)
        try {
          const deck = await api.patchDeck(this.deckId, {
            version: this.deck.version,
            ...(title !== this.deck.title ? { title } : {}),
            ...(!sameList(order, this.deck.slideOrder) ? { slideOrder: order } : {}),
          })
          this.adoptDeck(deck)
          this.patchRefused = false
        } catch (error) {
          if (error instanceof ApiError && error.code === 'conflict') {
            // The deck moved on elsewhere. Merge its slides in; the next pass sends our order again.
            await this.mergeDeck((error.current as Deck | undefined) ?? (await api.getDeck(this.deckId)), true)
          } else if (error instanceof ApiError && error.code === 'invalid' && !this.patchRefused) {
            // The order named slides the deck no longer has (or lacked new ones): learn what it has, once.
            this.patchRefused = true
            await this.mergeDeck(await api.getDeck(this.deckId), true)
          } else {
            throw error
          }
        }
        return
      }
    }
  }

  private adoptDeck(deck: Deck) {
    this.deck = { version: deck.version, title: deck.title, slideOrder: deck.slideOrder }
  }

  /**
   * Brings in what changed in the deck elsewhere: slides added there appear here, slides removed
   * there go (unless they hold unsaved work here), and the order and title follow theirs unless
   * they were changed here too.
   */
  private async mergeDeck(theirs: Deck, keepOurOrder = false) {
    const state = this.store.getState()
    const ourOrderPending = !sameList(
      state.doc.order.filter((k) => this.remote.has(k)).map((k) => this.remote.get(k)!.serverId),
      this.deck.slideOrder,
    )
    const ourTitlePending = state.title !== this.deck.title

    const added = theirs.slideOrder.filter((id) => this.keyForServerId(id) === undefined)
    const removed = [...this.remote.entries()].filter(([, r]) => !theirs.slideOrder.includes(r.serverId))
    const fetched = await Promise.all(added.map((id) => api.getSlide(id)))

    for (const slide of fetched) {
      this.remote.set(slide.id, { serverId: slide.id, version: slide.version, saved: contentOf(slide) })
    }
    const goneKeys: string[] = []
    for (const [key, record] of removed) {
      this.remote.delete(key)
      const local = this.store.getState().doc.slides[key]
      // Unsaved work on a slide removed elsewhere is kept: it will be saved as a new slide.
      if (!local || sameContent(local, record.saved)) goneKeys.push(key)
    }

    const position = (doc: DocState, serverId: string) => {
      const index = theirs.slideOrder.indexOf(serverId)
      const before = theirs.slideOrder.slice(0, index).reverse().map((id) => this.keyForServerId(id)).find((k) => k && doc.slides[k])
      return before ?? null
    }
    if (fetched.length || goneKeys.length) {
      state.actions.rebase((doc) => {
        let next = doc
        for (const key of goneKeys) next = removeSlide(next, key)
        for (const slide of fetched) {
          if (next.slides[slide.id]) continue
          const after = position(next, slide.id)
          next = insertSlide(next, slide.id, contentOf(slide), after)
          if (after === null) next = { ...next, order: [slide.id, ...next.order.filter((k) => k !== slide.id)] }
        }
        return next
      })
    }

    if (!keepOurOrder && !ourOrderPending) {
      // Follow their order; slides only we have keep their place after the slide they follow.
      const doc = this.store.getState().doc
      const theirKeys = theirs.slideOrder.map((id) => this.keyForServerId(id)).filter((k): k is string => !!k && !!doc.slides[k])
      const order = [...theirKeys]
      doc.order.forEach((key, i) => {
        if (theirKeys.includes(key)) return
        const prev = doc.order[i - 1]
        order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, key)
      })
      if (!sameList(order, doc.order)) this.store.setState({ doc: { ...doc, order } })
    }

    if (!ourTitlePending && theirs.title !== state.title) state.actions.rename(theirs.title)
    this.adoptDeck(theirs)
  }

  /** Looks for changes made elsewhere. Never runs alongside a save, so the two can't cross. */
  private async poll() {
    if (this.polling || this.running || this.stopped) return
    this.polling = true
    try {
      const [deck, slides] = await Promise.all([api.getDeck(this.deckId), api.listSlides(this.deckId)])
      if (this.running || this.stopped) return
      if (deck.version !== this.deck.version) await this.mergeDeck(deck)
      const { actions, conflicts } = this.store.getState()
      for (const slide of slides) {
        const key = this.keyForServerId(slide.id)
        const record = key ? this.remote.get(key) : undefined
        if (!key || !record || slide.version <= record.version) continue
        if (sameContent(contentOf(slide), record.saved)) {
          record.version = slide.version
        } else if (conflicts[key]?.version !== slide.version) {
          actions.setConflict(key, slide)
        }
      }
      if (this.failures > 0) {
        // The service is back: try the waiting saves now rather than at the next retry.
        this.failures = 0
        this.schedule(0)
      }
    } catch {
      // An unreachable service shows in the save status once there is something to save.
    } finally {
      this.polling = false
    }
  }

  private onFocus = () => void this.poll()
  private onOnline = () => this.schedule(0)
  private onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (this.hasUnsavedWork()) event.preventDefault()
  }
}

function contentOf(slide: Slide): SlideContent {
  return { background: slide.background, elements: slide.elements }
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}
