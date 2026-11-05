import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { api, ApiError } from '../api/client'
import type { SlideContent } from '../api/types'
import { Presenter } from '../present/Presenter'
import { SlideView } from '../slide/SlideView'
import { Illustration } from '../ui/Illustration'
import { Button } from '../ui/controls'
import { takeLaunch } from '../ui/launch'
import { LogoMark } from '../ui/Wordmark'
import { ConflictBanner } from './chrome/ConflictBanner'
import { Toolbar } from './chrome/Toolbar'
import { TopBar } from './chrome/TopBar'
import { Stage } from './canvas/Stage'
import { SyncContext, useCommands } from './commands'
import { Inspector } from './inspector/Inspector'
import { SlideList } from './slides/SlideList'
import { createEditorStore, EditorStoreContext, useEditor, useEditorStore } from './store'
import { SyncEngine } from './sync'
import { openDeckKey, type OpenDeck } from './openDeck'
import { useShortcuts } from './useShortcuts'
import styles from './EditorPage.module.css'

export function EditorPage() {
  const { deckId = '' } = useParams()
  const location = useLocation()
  const isNew = !!(location.state as { isNew?: boolean } | null)?.isNew
  const [launch] = useState(() => takeLaunch(deckId))

  const query = useQuery({
    queryKey: openDeckKey(deckId),
    queryFn: async ({ signal }): Promise<OpenDeck> => {
      const [deck, slides] = await Promise.all([api.getDeck(deckId, signal), api.listSlides(deckId, signal)])
      return { deck, slides }
    },
    // The editor takes over from here; a cached copy would be stale the next time it opens.
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (count, error) => !(error instanceof ApiError && error.code === 'not_found') && count < 2,
  })

  let body: ReactNode
  if (query.isPending) body = <EditorSkeleton thumbnail={launch?.thumbnail ?? null} />
  else if (query.isError) body = <EditorProblem error={query.error} retry={() => void query.refetch()} />
  else body = <Editor key={deckId} open={query.data} isNew={isNew} />

  const r = launch?.rect
  const initial = r
    ? { clipPath: `inset(${r.top}px ${window.innerWidth - r.right}px ${window.innerHeight - r.bottom}px ${r.left}px round 14px)` }
    : { opacity: 0 }

  return (
    <motion.div
      className={styles.page}
      initial={initial}
      animate={{ clipPath: 'inset(0px 0px 0px 0px round 0px)', opacity: 1 }}
      transition={{ duration: r ? 0.42 : 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      {body}
    </motion.div>
  )
}

function Editor({ open, isNew }: { open: OpenDeck; isNew: boolean }) {
  const queryClient = useQueryClient()
  const [store] = useState(() =>
    createEditorStore({
      deckId: open.deck.id,
      title: open.deck.title,
      doc: {
        order: open.slides.map((s) => s.id),
        slides: Object.fromEntries(open.slides.map((s) => [s.id, { background: s.background, elements: s.elements }])),
      },
    }),
  )
  const [sync] = useState(() => new SyncEngine(store, open.deck, open.slides))

  useEffect(() => {
    sync.start()
    return () => {
      // Leaving the editor: anything unsaved is still saved, and the list is refreshed once it is.
      void sync.close().then(() => queryClient.invalidateQueries({ queryKey: ['decks'] }))
    }
  }, [sync, queryClient])

  return (
    <EditorStoreContext.Provider value={store}>
      <SyncContext.Provider value={sync}>
        <EditorLayout isNew={isNew} />
      </SyncContext.Provider>
    </EditorStoreContext.Provider>
  )
}

function EditorLayout({ isNew }: { isNew: boolean }) {
  const store = useEditorStore()
  const commands = useCommands()
  const presenting = useEditor((s) => s.presenting)
  const title = useEditor((s) => s.title)
  useShortcuts(store, commands)

  useEffect(() => {
    document.title = `${title} · Presentify`
    return () => {
      document.title = 'Presentify'
    }
  }, [title])

  return (
    <div className={styles.editor}>
      <TopBar focusTitle={isNew} />
      <div className={styles.body}>
        <motion.div className={styles.panel} initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.28, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}>
          <SlideList />
        </motion.div>
        <main className={styles.stageArea}>
          <Toolbar />
          <ConflictBanner />
          <Stage />
        </main>
        <motion.div className={styles.panel} initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.28, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}>
          <Inspector />
        </motion.div>
      </div>
      {presenting ? <Presenter /> : null}
    </div>
  )
}

function EditorSkeleton({ thumbnail }: { thumbnail: SlideContent | null }) {
  return (
    <div className={styles.editor} aria-busy="true" aria-label="Opening presentation">
      <div className={styles.skeletonBar}>
        <LogoMark size={26} />
        <span className={styles.shimmer} style={{ width: 220, height: 18 }} />
      </div>
      <div className={styles.body}>
        <div className={styles.skeletonSide}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={styles.shimmer} style={{ width: '100%', aspectRatio: '16 / 9', animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
        <div className={styles.skeletonStage}>
          <div className={styles.skeletonSlide}>{thumbnail ? <SlideView content={thumbnail} /> : <span className={styles.shimmer} style={{ position: 'absolute', inset: 0 }} />}</div>
        </div>
        <div className={styles.skeletonInspector} />
      </div>
    </div>
  )
}

function EditorProblem({ error, retry }: { error: Error; retry: () => void }) {
  const missing = error instanceof ApiError && error.code === 'not_found'
  return (
    <div className={styles.problem}>
      <Illustration kind={missing ? 'missing' : 'offline'} />
      <h1>{missing ? 'This presentation isn’t here' : 'Can’t reach the Presentify service'}</h1>
      <p>
        {missing
          ? 'It may have been deleted, or the link may be wrong.'
          : 'Presentify keeps presentations in a local service, and it isn’t answering right now. Check that it’s running, then try again.'}
      </p>
      <div className={styles.problemActions}>
        {missing ? null : (
          <Button variant="primary" onClick={retry}>
            Try again
          </Button>
        )}
        <Link to="/" className={styles.problemLink}>
          Back to all presentations
        </Link>
      </div>
    </div>
  )
}
