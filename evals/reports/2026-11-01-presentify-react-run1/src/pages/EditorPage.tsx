import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Mark } from '../components/icons';
import { Button } from '../components/ui';
import { Canvas } from '../editor/Canvas';
import { ConflictBanner } from '../editor/ConflictBanner';
import { Inspector } from '../editor/Inspector';
import { Presenter } from '../editor/Presenter';
import { SlideList } from '../editor/SlideList';
import { editor, useEditor } from '../editor/store';
import { loadDeck, startSync, stopSync } from '../editor/sync';
import { TopBar } from '../editor/TopBar';
import { useShortcuts } from '../editor/useShortcuts';
import '../editor/editor.css';

type Load = { status: 'loading' } | { status: 'ready' } | { status: 'error'; notFound: boolean };

export function EditorPage() {
  const { deckId = '' } = useParams();
  const location = useLocation();
  const isNew = (location.state as { isNew?: boolean } | null)?.isNew === true;
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const presenting = useEditor((s) => s.presenting);
  const title = useEditor((s) => s.doc?.title);

  useShortcuts();

  useEffect(() => {
    let cancelled = false;
    loadDeck(deckId)
      .then((loaded) => {
        if (cancelled) return;
        startSync(loaded);
        setLoad({ status: 'ready' });
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoad({ status: 'error', notFound: e instanceof ApiError && e.code === 'not_found' });
      });
    return () => {
      cancelled = true;
      // Anything still unsaved goes out before the editor closes.
      stopSync({ flush: true });
      editor.close();
    };
  }, [deckId, attempt]);

  useEffect(() => {
    document.title = title ? `${title} – Presentify` : 'Presentify';
  }, [title]);

  if (load.status === 'error') {
    return (
      <div className="page-message">
        <Mark size={40} />
        <h1>{load.notFound ? 'This presentation isn’t here' : 'Can’t reach the Presentify service'}</h1>
        <p>
          {load.notFound
            ? 'It may have been deleted in another window.'
            : 'Your presentations are kept by the service. Check that it’s running, then try again.'}
        </p>
        <div className="page-message-actions">
          <Link to="/" className="button button-secondary">All presentations</Link>
          {!load.notFound && (
            <Button
              variant="primary"
              onClick={() => {
                setLoad({ status: 'loading' });
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="editor">
      {load.status === 'loading' ? (
        <EditorSkeleton />
      ) : (
        <>
          <TopBar autoFocusTitle={isNew} />
          <div className="editor-body">
            <SlideList />
            <main className="editor-main">
              <ConflictBanner />
              <Canvas />
            </main>
            <Inspector />
          </div>
          {presenting && <Presenter />}
        </>
      )}
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="editor-skeleton" aria-busy="true" aria-label="Opening presentation">
      <div className="topbar">
        <div className="topbar-start">
          <Mark size={26} />
          <span className="skeleton-bar" style={{ width: 180 }} />
        </div>
      </div>
      <div className="editor-body">
        <aside className="slide-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-thumb" />
          ))}
        </aside>
        <main className="editor-main">
          <div className="skeleton-slide" />
        </main>
        <aside className="inspector" />
      </div>
    </div>
  );
}
