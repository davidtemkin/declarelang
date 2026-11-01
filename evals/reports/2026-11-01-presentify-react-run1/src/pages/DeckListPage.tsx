/**
 * The person's presentations: each with its title, when it last changed, and its first
 * slide. Open, start, rename, delete (after asking).
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { SlideView } from '../components/SlideView';
import { Mark, MoreIcon, PencilIcon, PlusIcon, TrashIcon, Wordmark } from '../components/icons';
import { Button, Dialog, DialogClose, IconButton, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../components/ui';
import { whenClosed } from '../editor/sync';
import type { DeckSummary, Slide } from '../model/types';
import './deck-list.css';

type Load = { status: 'loading' } | { status: 'ready'; decks: DeckSummary[] } | { status: 'error' };

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const absolute = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function whenChanged(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'Just now';
  if (abs < 3600) return capitalize(relative.format(Math.round(seconds / 60), 'minute'));
  if (abs < 86400) return capitalize(relative.format(Math.round(seconds / 3600), 'hour'));
  if (abs < 86400 * 7) return capitalize(relative.format(Math.round(seconds / 86400), 'day'));
  return absolute.format(new Date(iso));
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function DeckListPage() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<DeckSummary | null>(null);
  const [deleting, setDeleting] = useState<DeckSummary | null>(null);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      await whenClosed();
      setLoad({ status: 'ready', decks: await api.listDecks() });
    } catch {
      setLoad((prev) => (prev.status === 'ready' ? prev : { status: 'error' }));
    }
  }, []);

  useEffect(() => {
    document.title = 'Presentify';
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const { deck } = await api.createDeck('Untitled presentation');
      navigate(`/p/${deck.id}`, { state: { isNew: true } });
    } catch (e) {
      setCreateError(e instanceof ApiError && e.code !== 'network' ? e.message : "Can't reach the Presentify service. Try again in a moment.");
      setCreating(false);
    }
  };

  const decks = load.status === 'ready' ? load.decks : [];

  return (
    <div className="deck-list-page">
      <header className="deck-list-header">
        <Wordmark />
        <Button variant="primary" onClick={create} disabled={creating}>
          <PlusIcon size={16} /> New presentation
        </Button>
      </header>

      <main className="deck-list-main">
        <h1 className="deck-list-title">Presentations</h1>
        {createError && (
          <p className="inline-error" role="alert">
            {createError}
          </p>
        )}

        {load.status === 'loading' && (
          <ul className="deck-grid" aria-busy="true" aria-label="Loading presentations">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="deck-card is-skeleton">
                <div className="deck-thumb" />
                <div className="deck-meta">
                  <span className="skeleton-bar" style={{ width: '70%' }} />
                  <span className="skeleton-bar" style={{ width: '40%' }} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {load.status === 'error' && (
          <div className="page-message">
            <Mark size={40} />
            <h2>Can’t reach the Presentify service</h2>
            <p>Your presentations are kept by the service. Check that it’s running, then try again.</p>
            <Button variant="primary" onClick={() => { setLoad({ status: 'loading' }); void refresh(); }}>Try again</Button>
          </div>
        )}

        {load.status === 'ready' && decks.length === 0 && (
          <div className="page-message deck-empty">
            <div className="deck-empty-art" aria-hidden>
              <span />
              <span />
              <span />
            </div>
            <h2>No presentations yet</h2>
            <p>Start one, and it opens ready for its first slide.</p>
            <Button variant="primary" onClick={create} disabled={creating}>
              <PlusIcon size={16} /> New presentation
            </Button>
          </div>
        )}

        {load.status === 'ready' && decks.length > 0 && (
          <ul className="deck-grid">
            <li>
              <button type="button" className="deck-card deck-new" onClick={create} disabled={creating}>
                <span className="deck-thumb deck-new-thumb">
                  <PlusIcon size={28} />
                </span>
                <span className="deck-meta">
                  <span className="deck-title">New presentation</span>
                  <span className="deck-sub">Starts with one empty slide</span>
                </span>
              </button>
            </li>
            {decks.map((deck) => (
              <DeckCard
                key={deck.id}
                deck={deck}
                onOpen={() => navigate(`/p/${deck.id}`)}
                onRename={() => setRenaming(deck)}
                onDelete={() => setDeleting(deck)}
              />
            ))}
          </ul>
        )}
      </main>

      {/* Keyed by deck, so each opening starts fresh. */}
      <RenameDialog key={`rename-${renaming?.id}`} deck={renaming} onClose={() => setRenaming(null)} onDone={refresh} />
      <DeleteDialog key={`delete-${deleting?.id}`} deck={deleting} onClose={() => setDeleting(null)} onDone={refresh} />
    </div>
  );
}

const thumbnailCache = new Map<string, Slide>();

function DeckCard({ deck, onOpen, onRename, onDelete }: { deck: DeckSummary; onOpen: () => void; onRename: () => void; onDelete: () => void }) {
  const [slide, setSlide] = useState<Slide | null>(() => thumbnailCache.get(deck.thumbnailSlideId) ?? null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSlide(deck.thumbnailSlideId)
      .then((s) => {
        thumbnailCache.set(s.id, s);
        if (!cancelled) setSlide(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [deck.thumbnailSlideId, deck.updatedAt]);

  const slides = `${deck.slideCount} ${deck.slideCount === 1 ? 'slide' : 'slides'}`;

  return (
    <li className="deck-card">
      <button type="button" className="deck-open" onClick={onOpen} aria-label={`Open ${deck.title}`}>
        <span className="deck-thumb">
          {slide ? <SlideView background={slide.background} elements={slide.elements} /> : <span className="deck-thumb-loading" />}
        </span>
      </button>
      <div className="deck-meta">
        <span className="deck-title" title={deck.title}>
          {deck.title}
        </span>
        <span className="deck-sub" title={absolute.format(new Date(deck.updatedAt))}>
          {whenChanged(deck.updatedAt)} · {slides}
        </span>
      </div>
      <Menu>
        <MenuTrigger asChild>
          <IconButton label={`More for ${deck.title}`} className="deck-more">
            <MoreIcon size={18} />
          </IconButton>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem onSelect={onOpen}>Open</MenuItem>
          <MenuItem icon={<PencilIcon size={16} />} onSelect={onRename}>Rename…</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<TrashIcon size={16} />} danger onSelect={onDelete}>Delete…</MenuItem>
        </MenuContent>
      </Menu>
    </li>
  );
}

function RenameDialog({ deck, onClose, onDone }: { deck: DeckSummary | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [title, setTitle] = useState(deck?.title ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!deck) return;
    const next = title.trim() || 'Untitled presentation';
    setBusy(true);
    try {
      // The list doesn't carry the deck's version; read it, then rename.
      const current = await api.getDeck(deck.id);
      await api.updateDeck(deck.id, { version: current.version, title: next });
      await onDone();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError && e.code !== 'network' ? e.message : "Can't reach the Presentify service. Try again in a moment.");
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={deck !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Rename presentation"
      footer={
        <>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <Button variant="primary" disabled={busy} onClick={submit}>
            Rename
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="text-field">
          <span>Title</span>
          <input autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
        </label>
        {error && <p className="inline-error" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}

function DeleteDialog({ deck, onClose, onDone }: { deck: DeckSummary | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!deck) return;
    setBusy(true);
    try {
      await api.deleteDeck(deck.id);
      await onDone();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_found') {
        await onDone();
        onClose();
        return;
      }
      setError("Can't reach the Presentify service, so nothing was deleted. Try again in a moment.");
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={deck !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Delete this presentation?"
      description={
        <>
          <strong className="dialog-deck-name">{deck?.title}</strong> and{' '}
          {deck?.slideCount === 1 ? 'its one slide' : `all ${deck?.slideCount} of its slides`} will be deleted. This can’t be undone.
        </>
      }
      footer={
        <>
          <DialogClose asChild>
            <Button autoFocus>Cancel</Button>
          </DialogClose>
          <Button variant="danger" disabled={busy} onClick={confirm}>
            Delete presentation
          </Button>
        </>
      }
    >
      {error && <p className="inline-error" role="alert">{error}</p>}
    </Dialog>
  );
}
