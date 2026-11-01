/**
 * Keeps the service in step with the editor's working document.
 *
 * There is no Save button: shortly after the last edit the engine compares the document
 * with what the service last confirmed and sends the difference: new slides, changed
 * slides, deleted slides, and the deck's title and order. A write that fails because the
 * service can't be reached stays pending and is tried again; nothing is dropped.
 *
 * A write refused because someone else saved first is never forced through. The slide is
 * held back and the person is asked whose version to keep. The current slide is also
 * checked when it is opened, when the window regains focus and every few seconds, so a
 * colleague's edit is noticed before the person builds on top of it.
 */
import { api, ApiError, type SlideContent } from '../api/client';
import type { Deck, Slide } from '../model/types';
import { type Backup, readBackup, writeBackup } from './backup';
import { type Doc, insertSlide, newLocalSlideId, removeSlide, type SlideDoc, updateSlide } from './doc';
import { editor, type EditorState, type SlideConflict, useEditor } from './store';

const SAVE_DELAY_MS = 900;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];
const POLL_MS = 5000;
const BACKUP_DELAY_MS = 300;

interface ServerSlide {
  version: number;
  /** What the service holds, as the local slide object it was saved from or loaded into. */
  saved: SlideDoc;
}

function sameContent(a: SlideDoc, b: SlideDoc): boolean {
  if (a === b) return true;
  return a.background === b.background && JSON.stringify(a.elements) === JSON.stringify(b.elements);
}

function toSlideDoc(slide: Slide, localId = slide.id): SlideDoc {
  return { id: localId, background: slide.background, elements: slide.elements };
}

function content(slide: SlideDoc): SlideContent {
  return { background: slide.background, elements: slide.elements };
}

export interface LoadedDeck {
  deck: Deck;
  slides: Slide[];
}

export async function loadDeck(deckId: string): Promise<LoadedDeck> {
  const [deck, slides] = await Promise.all([api.getDeck(deckId), api.listSlides(deckId)]);
  return { deck, slides };
}

export class DeckSync {
  private readonly deckId: string;
  private deck: Deck;
  /** Service slide id → what the service holds. */
  private readonly server = new Map<string, ServerSlide>();
  /** Local slide id → service slide id, once the slide exists there. */
  private readonly serverIdOf = new Map<string, string>();
  /** The title as last confirmed by the service. */
  private savedTitle: string;
  /** The latest document. Kept here too so a last save can finish after the editor closes. */
  private doc: Doc;
  /** Slides held back until the person resolves a conflict. */
  private readonly held = new Set<string>();
  private deckConflict = false;

  private timer: ReturnType<typeof setTimeout> | undefined;
  private backupTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly pollTimer: ReturnType<typeof setInterval>;
  private running: Promise<void> | null = null;
  private again = false;
  private failures = 0;
  /** Detached from the editor: finishing a last save, or gone. */
  private detached = false;
  private readonly unsubscribe: () => void;

  constructor({ deck, slides }: LoadedDeck) {
    this.deckId = deck.id;
    this.deck = deck;
    this.savedTitle = deck.title;
    this.doc = {
      title: deck.title,
      order: slides.map((s) => s.id),
      slides: Object.fromEntries(slides.map((s) => [s.id, toSlideDoc(s)])),
    };
    for (const s of slides) {
      this.server.set(s.id, { version: s.version, saved: this.doc.slides[s.id] });
      this.serverIdOf.set(s.id, s.id);
    }
    const restored = this.restoreBackup(slides);
    editor.reset(deck.id, this.doc);
    for (const [localId, conflict] of restored.conflicts) this.setConflict(localId, conflict);

    this.unsubscribe = useEditor.subscribe((state, prev) => {
      if (!state.doc) return;
      if (state.doc !== prev.doc) {
        this.doc = state.doc;
        this.schedule();
      }
      if (state.currentSlideId !== prev.currentSlideId) void this.checkSlide(state.currentSlideId);
    });
    window.addEventListener('focus', this.onFocus);
    window.addEventListener('online', this.onFocus);
    window.addEventListener('beforeunload', this.onBeforeUnload);
    this.pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.checkSlide(useEditor.getState().currentSlideId);
    }, POLL_MS);
    if (restored.any) this.schedule(0);
  }

  // ------------------------------------------------------------ local backup

  /** Put back work left unsaved last time. Slides changed on the service since become conflicts. */
  private restoreBackup(slides: Slide[]) {
    const conflicts = new Map<string, SlideConflict>();
    const backup = readBackup(this.deckId);
    if (!backup) return { any: false, conflicts };
    const byId = new Map(slides.map((s) => [s.id, s]));
    let doc = this.doc;
    for (const [sid, saved] of Object.entries(backup.slides)) {
      const current = byId.get(sid);
      if (!current) continue;
      doc = updateSlide(doc, sid, (slide) => ({ ...slide, background: saved.background, elements: saved.elements }));
      if (current.version !== saved.baseVersion) conflicts.set(sid, { kind: 'changed', theirs: current });
    }
    for (const added of backup.newSlides) {
      const after = added.after && doc.slides[added.after] ? added.after : null;
      doc = insertSlide(doc, { id: newLocalSlideId(), background: added.background, elements: added.elements }, after);
    }
    if (backup.title) doc = { ...doc, title: backup.title };
    this.doc = doc;
    return { any: true, conflicts };
  }

  /** Keep a copy of everything not yet on the service; clear it once everything is. */
  private persistBackup() {
    clearTimeout(this.backupTimer);
    this.backupTimer = setTimeout(() => {
      const doc = this.doc;
      const backup: Backup = { slides: {}, newSlides: [] };
      if (doc.title !== this.savedTitle) backup.title = doc.title;
      doc.order.forEach((localId, i) => {
        const slide = doc.slides[localId];
        const sid = this.serverIdOf.get(localId);
        const known = sid ? this.server.get(sid) : undefined;
        if (!sid || !known) {
          const prev = i > 0 ? (this.serverIdOf.get(doc.order[i - 1]) ?? null) : null;
          backup.newSlides.push({ after: prev, background: slide.background, elements: slide.elements });
        } else if (!sameContent(known.saved, slide)) {
          backup.slides[sid] = { baseVersion: known.version, background: slide.background, elements: slide.elements };
        }
      });
      const empty = !backup.title && !backup.newSlides.length && !Object.keys(backup.slides).length;
      writeBackup(this.deckId, empty ? null : backup);
    }, BACKUP_DELAY_MS);
  }

  /**
   * Stop following the editor. With `flush`, pending work is still sent first; the
   * returned promise settles when it has been (or when it can't be, for now).
   */
  async detach({ flush }: { flush: boolean }): Promise<void> {
    if (this.detached) return;
    this.detached = true;
    clearTimeout(this.timer);
    clearInterval(this.pollTimer);
    this.unsubscribe();
    window.removeEventListener('focus', this.onFocus);
    window.removeEventListener('online', this.onFocus);
    if (flush && this.hasSendableWork()) {
      await this.running;
      try {
        await this.sendAll();
        this.persistBackup();
      } catch {
        // The service is out of reach; the page-leave warning stays up so nothing is lost silently.
        return;
      }
    }
    window.removeEventListener('beforeunload', this.onBeforeUnload);
  }

  /** Save now (Command-S). */
  saveNow() {
    clearTimeout(this.timer);
    this.failures = 0;
    void this.flush();
  }

  // ------------------------------------------------------------ conflict resolution

  /** Replace the person's copy of the slide with the one on the service. */
  useTheirs(localId: string) {
    const conflict = useEditor.getState().conflicts[localId];
    if (conflict?.kind !== 'changed') return;
    const theirs = toSlideDoc(conflict.theirs, localId);
    this.server.set(conflict.theirs.id, { version: conflict.theirs.version, saved: theirs });
    editor.replaceSlideFromService(localId, (doc) => updateSlide(doc, localId, () => theirs));
    this.clearConflict(localId);
  }

  /** Keep the person's copy, writing it over the one on the service. */
  keepMine(localId: string) {
    const conflict = useEditor.getState().conflicts[localId];
    if (!conflict) return;
    if (conflict.kind === 'changed') {
      // Take their version number so the next save goes through.
      this.server.set(conflict.theirs.id, { version: conflict.theirs.version, saved: toSlideDoc(conflict.theirs, localId) });
    } else {
      // Deleted elsewhere: forget the service id so the slide is made again.
      const sid = this.serverIdOf.get(localId);
      if (sid) this.server.delete(sid);
      this.serverIdOf.delete(localId);
    }
    this.clearConflict(localId);
    this.saveNow();
  }

  /** Accept that the slide was deleted elsewhere, and remove it here too. */
  removeDeleted(localId: string) {
    const sid = this.serverIdOf.get(localId);
    if (sid) this.server.delete(sid);
    this.serverIdOf.delete(localId);
    const { order } = this.doc;
    if (order.length > 1) {
      const index = order.indexOf(localId);
      const rest = order.filter((id) => id !== localId);
      editor.setCurrentSlide(rest[Math.min(index, rest.length - 1)]);
      editor.replaceSlideFromService(localId, (d) => removeSlide(d, localId));
    }
    this.clearConflict(localId);
  }

  /** Read the whole presentation again from the service, as it is now. */
  async reload() {
    await this.detach({ flush: false });
    startSync(await loadDeck(this.deckId));
  }

  private setConflict(localId: string, conflict: SlideConflict) {
    this.held.add(localId);
    this.setStore((s) => ({ conflicts: { ...s.conflicts, [localId]: conflict } }));
  }

  private clearConflict(localId: string) {
    this.held.delete(localId);
    this.setStore((s) => {
      const conflicts = { ...s.conflicts };
      delete conflicts[localId];
      return { conflicts };
    });
  }

  private setStore(update: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) {
    if (!this.detached) useEditor.setState(update);
  }

  // ------------------------------------------------------------ others' edits

  private onFocus = () => {
    void this.checkSlide(useEditor.getState().currentSlideId);
    if (useEditor.getState().saveState === 'offline') this.saveNow();
  };

  private onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (this.hasSendableWork()) event.preventDefault();
  };

  /** Has someone else saved this slide since we read it? */
  private async checkSlide(localId: string) {
    const sid = this.serverIdOf.get(localId);
    if (!sid || this.detached || this.held.has(localId) || !this.server.has(sid)) return;
    try {
      const slide = await api.getSlide(sid);
      const known = this.server.get(sid);
      if (this.detached || !known || this.held.has(localId) || slide.version <= known.version) return;
      const mine = this.doc.slides[localId];
      if (mine && sameContent(mine, toSlideDoc(slide, localId))) {
        // They made the change we have; there's nothing to choose between.
        this.server.set(sid, { version: slide.version, saved: mine });
        return;
      }
      this.setConflict(localId, { kind: 'changed', theirs: slide });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_found' && this.serverIdOf.get(localId) === sid && this.doc.slides[localId]) {
        this.setConflict(localId, { kind: 'deleted' });
      }
    }
  }

  // ------------------------------------------------------------ saving

  private desiredOrder(doc: Doc): string[] | null {
    const ids = doc.order.map((id) => this.serverIdOf.get(id));
    return ids.every((id): id is string => id !== undefined) ? ids : null;
  }

  /** Is there anything we may send? Slides waiting on a conflict don't count. */
  private hasSendableWork(): boolean {
    const doc = this.doc;
    if (doc.title !== this.savedTitle) return true;
    const order = this.desiredOrder(doc);
    if (!order) return true;
    if (!this.deckConflict && order.join() !== this.deck.slideOrder.join()) return true;
    const wanted = new Set(order);
    if ([...this.serverIdOf.values()].some((sid) => !wanted.has(sid))) return true;
    return doc.order.some((id) => {
      if (this.held.has(id)) return false;
      const server = this.server.get(this.serverIdOf.get(id)!);
      return !server || !sameContent(server.saved, doc.slides[id]);
    });
  }

  private schedule(delay = SAVE_DELAY_MS) {
    if (this.detached) return;
    this.persistBackup();
    clearTimeout(this.timer);
    if (this.hasSendableWork()) {
      if (useEditor.getState().saveState === 'saved') this.setStore({ saveState: 'saving' });
      this.timer = setTimeout(() => void this.flush(), delay);
    } else if (!this.running && useEditor.getState().saveState !== 'saved') {
      this.setStore({ saveState: 'saved' });
    }
  }

  private async flush(): Promise<void> {
    if (this.detached) return;
    if (this.running) {
      this.again = true;
      return;
    }
    // Don't send a drag halfway through; wait for it to land. Typing is saved as it goes.
    const state = useEditor.getState();
    if (state.gesture && !state.editingId) {
      this.timer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
      return;
    }
    this.setStore({ saveState: 'saving' });
    this.running = this.sendAll();
    try {
      await this.running;
      this.persistBackup();
      this.failures = 0;
      this.setStore({ saveState: this.hasSendableWork() ? 'saving' : 'saved' });
    } catch (e) {
      // Kept, and tried again. A refusal that isn't about reachability is a bug in what we
      // sent; say so to whoever maintains this, and keep trying more slowly.
      if (!(e instanceof ApiError && e.isRetryable)) console.error('Presentify: the service refused a save', e);
      const delay = RETRY_DELAYS_MS[Math.min(this.failures, RETRY_DELAYS_MS.length - 1)];
      this.failures++;
      this.setStore({ saveState: 'offline' });
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.flush(), delay);
      this.again = false;
    } finally {
      this.running = null;
      if (this.again) {
        this.again = false;
        this.schedule(0);
      }
    }
  }

  /** Send every difference between the document and the service, in a safe order. */
  private async sendAll(): Promise<void> {
    // Repeat until a pass finds nothing to do, so edits made while saving are picked up.
    for (let pass = 0; pass < 20; pass++) {
      let sent = false;

      // 1. Slides that don't exist on the service yet.
      for (let i = 0; i < this.doc.order.length; i++) {
        const localId = this.doc.order[i];
        if (this.serverIdOf.has(localId)) continue;
        const slide = this.doc.slides[localId];
        const after = i > 0 ? (this.serverIdOf.get(this.doc.order[i - 1]) ?? null) : null;
        const res = await api.createSlide(this.deckId, { after, ...content(slide) });
        this.serverIdOf.set(localId, res.slide.id);
        this.server.set(res.slide.id, { version: res.slide.version, saved: slide });
        this.deck = res.deck;
        sent = true;
      }

      // 2. Slides whose content changed.
      for (const localId of this.doc.order) {
        if (this.held.has(localId)) continue;
        const sid = this.serverIdOf.get(localId);
        const known = sid ? this.server.get(sid) : undefined;
        const slide = this.doc.slides[localId];
        if (!sid || !known || !slide || sameContent(known.saved, slide)) continue;
        try {
          const saved = await api.saveSlide(sid, { version: known.version, ...content(slide) });
          this.server.set(sid, { version: saved.version, saved: slide });
        } catch (e) {
          if (!(e instanceof ApiError)) throw e;
          if (e.code === 'conflict' && e.current) this.setConflict(localId, { kind: 'changed', theirs: e.current as Slide });
          else if (e.code === 'not_found') this.setConflict(localId, { kind: 'deleted' });
          else throw e;
        }
        sent = true;
      }

      // 3. Slides the person deleted.
      const wanted = new Set(this.doc.order);
      for (const [localId, sid] of [...this.serverIdOf]) {
        if (wanted.has(localId)) continue;
        try {
          this.deck = (await api.deleteSlide(sid)).deck;
        } catch (e) {
          if (!(e instanceof ApiError) || e.code !== 'not_found') throw e;
        }
        this.serverIdOf.delete(localId);
        this.server.delete(sid);
        sent = true;
      }

      // 4. The deck's title and slide order.
      const order = this.desiredOrder(this.doc);
      const orderChanged = !this.deckConflict && order !== null && order.join() !== this.deck.slideOrder.join();
      const title = this.doc.title;
      if (orderChanged || title !== this.savedTitle) {
        await this.saveDeck(title, orderChanged ? order! : undefined);
        sent = true;
      }

      if (!sent) return;
    }
  }

  private async saveDeck(title: string, slideOrder: string[] | undefined) {
    try {
      this.deck = await api.updateDeck(this.deckId, { version: this.deck.version, title, slideOrder });
      this.savedTitle = title;
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== 'conflict') throw e;
      // Someone else changed the deck. Our title and order still apply if theirs has the same
      // slides; if slides were added or removed elsewhere, ask before touching the order.
      const theirs = (e.current as Deck | undefined) ?? (await api.getDeck(this.deckId));
      this.deck = theirs;
      const sameSlides =
        slideOrder === undefined ||
        (theirs.slideOrder.length === slideOrder.length && slideOrder.every((id) => theirs.slideOrder.includes(id)));
      if (!sameSlides) {
        this.deckConflict = true;
        this.setStore({ deckConflict: true });
      }
      this.deck = await api.updateDeck(this.deckId, { version: theirs.version, title, slideOrder: sameSlides ? slideOrder : undefined });
      this.savedTitle = title;
    }
  }
}

let active: DeckSync | null = null;
let closing: Promise<void> = Promise.resolve();

export function startSync(loaded: LoadedDeck): DeckSync {
  void active?.detach({ flush: false });
  active = new DeckSync(loaded);
  return active;
}

/** Stop syncing the open presentation, sending anything still unsaved first. */
export function stopSync({ flush }: { flush: boolean }) {
  if (!active) return;
  closing = active.detach({ flush });
  active = null;
}

/** Settles once the last presentation closed has finished saving. */
export function whenClosed(): Promise<void> {
  return closing;
}

export function activeSync(): DeckSync | null {
  return active;
}
