import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, ApiError } from '../api/client'
import type { DeckSummary } from '../api/types'
import { openDeckKey, type OpenDeck } from '../editor/openDeck'
import { SlideView } from '../slide/SlideView'
import { Button, IconButton } from '../ui/controls'
import { MoreIcon, PencilIcon, PlusIcon, TrashIcon, PlayIcon } from '../ui/icons'
import { Illustration } from '../ui/Illustration'
import { setLaunch } from '../ui/launch'
import { DropdownMenu } from '../ui/Menu'
import { Wordmark } from '../ui/Wordmark'
import { loadEditor } from '../editor/loadEditor'
import { decksKey, relativeTime } from './decks'
import { renameDeck } from './renameDeck'
import styles from './DeckListPage.module.css'

export function DeckListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const decks = useQuery({ queryKey: decksKey, queryFn: ({ signal }) => api.listDecks(signal) })
  const [toDelete, setToDelete] = useState<DeckSummary | null>(null)

  useEffect(() => {
    document.title = 'Presentify'
    // Fetch the editor while the person looks at the list, so opening one is instant.
    void loadEditor()
  }, [])

  const create = useMutation({
    mutationFn: () => api.createDeck('Untitled presentation'),
    onSuccess: (result) => {
      queryClient.setQueryData<OpenDeck>(openDeckKey(result.deck.id), { deck: result.deck, slides: result.slides })
      void queryClient.invalidateQueries({ queryKey: decksKey })
      navigate(`/d/${result.deck.id}`, { state: { isNew: true } })
    },
  })

  const remove = useMutation({
    mutationFn: (deck: DeckSummary) => api.deleteDeck(deck.id),
    onMutate: async (deck) => {
      await queryClient.cancelQueries({ queryKey: decksKey })
      queryClient.setQueryData<DeckSummary[]>(decksKey, (list) => list?.filter((d) => d.id !== deck.id))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: decksKey }),
  })

  const list = decks.data ?? []

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Wordmark size={30} />
        <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => create.mutate()} disabled={create.isPending}>
          New presentation
        </Button>
      </header>

      <main className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.heading}>Your presentations</h1>
          {decks.isSuccess && list.length > 0 ? (
            <p className={styles.lede}>
              {list.length === 1 ? 'One presentation' : `${list.length} presentations`}, most recently changed first.
            </p>
          ) : null}
        </div>

        {create.isError ? (
          <p className={styles.inlineError} role="alert">
            Couldn’t start a new presentation: {create.error.message} <button onClick={() => create.mutate()}>Try again</button>
          </p>
        ) : null}

        {decks.isPending ? (
          <div className={styles.grid} aria-busy="true" aria-label="Loading presentations">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={styles.cardSkeleton} style={{ animationDelay: `${i * 90}ms` }} />
            ))}
          </div>
        ) : decks.isError ? (
          <div className={styles.empty}>
            <Illustration kind="offline" />
            <h2>Can’t reach the Presentify service</h2>
            <p>Your presentations live in a local service that isn’t answering. Check that it’s running, then try again.</p>
            <Button variant="primary" onClick={() => void decks.refetch()}>
              Try again
            </Button>
          </div>
        ) : list.length === 0 ? (
          <div className={styles.empty}>
            <Illustration kind="empty" />
            <h2>Nothing here yet</h2>
            <p>Shapes, words and a little nerve: that’s all a good presentation needs. Start your first one.</p>
            <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => create.mutate()} disabled={create.isPending}>
              New presentation
            </Button>
          </div>
        ) : (
          <ul className={styles.grid} aria-label="Presentations">
            <li>
              <button type="button" className={styles.newCard} onClick={() => create.mutate()} disabled={create.isPending}>
                <span className={styles.newIcon}>
                  <PlusIcon size={22} />
                </span>
                <span className={styles.newLabel}>New presentation</span>
                <span className={styles.newHint}>Starts with one empty slide</span>
              </button>
            </li>
            <AnimatePresence initial={false}>
              {list.map((deck) => (
                <motion.li
                  key={deck.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  <DeckCard deck={deck} onDelete={() => setToDelete(deck)} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </main>

      <AlertDialog.Root open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={styles.overlay} />
          <AlertDialog.Content className={styles.dialog}>
            <AlertDialog.Title className={styles.dialogTitle}>Delete this presentation?</AlertDialog.Title>
            <AlertDialog.Description className={styles.dialogText}>
              “<span className={styles.dialogName}>{toDelete?.title}</span>” and its{' '}
              {toDelete?.slideCount === 1 ? 'slide' : `${toDelete?.slideCount ?? 0} slides`} will be deleted for good. This can’t be undone.
            </AlertDialog.Description>
            <div className={styles.dialogActions}>
              <AlertDialog.Cancel asChild>
                <Button variant="secondary">Keep it</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant="danger" icon={<TrashIcon size={16} />} onClick={() => toDelete && remove.mutate(toDelete)}>
                  Delete presentation
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  )
}

function DeckCard({ deck, onDelete }: { deck: DeckSummary; onDelete: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const thumbRef = useRef<HTMLDivElement>(null)
  const [renaming, setRenaming] = useState(false)
  const thumbnail = useQuery({
    queryKey: ['slide', deck.thumbnailSlideId, deck.updatedAt],
    queryFn: ({ signal }) => api.getSlide(deck.thumbnailSlideId, signal),
    staleTime: Infinity,
  })

  const rename = useMutation({
    mutationFn: (title: string) => renameDeck(deck.id, title),
    onMutate: (title) => {
      queryClient.setQueryData<DeckSummary[]>(decksKey, (list) => list?.map((d) => (d.id === deck.id ? { ...d, title } : d)))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: decksKey }),
  })

  const open = () => {
    if (thumbRef.current) setLaunch(deck.id, thumbRef.current, thumbnail.data ?? null)
    navigate(`/d/${deck.id}`)
  }

  return (
    <article className={styles.card}>
      <button type="button" className={styles.cardOpen} onClick={open} aria-label={`Open ${deck.title}`}>
        <div ref={thumbRef} className={styles.thumb}>
          {thumbnail.data ? <SlideView content={thumbnail.data} /> : <span className={styles.thumbLoading} />}
          <span className={styles.thumbPlay} aria-hidden="true">
            <PlayIcon size={14} /> Open
          </span>
        </div>
      </button>
      <div className={styles.footer}>
      <div className={styles.meta}>
        {renaming ? (
          <RenameField
            initial={deck.title}
            onDone={(title) => {
              setRenaming(false)
              if (title && title !== deck.title) rename.mutate(title)
            }}
          />
        ) : (
          <h3 className={styles.cardTitle} title={deck.title} onDoubleClick={() => setRenaming(true)}>
            {deck.title}
          </h3>
        )}
        <p className={styles.cardInfo}>
          <span>{relativeTime(deck.updatedAt)}</span>
          <span aria-hidden="true">·</span>
          <span>{deck.slideCount === 1 ? '1 slide' : `${deck.slideCount} slides`}</span>
        </p>
        {rename.isError ? (
          <p className={styles.cardError} role="alert">
            Couldn’t rename: {(rename.error as ApiError).message}
          </p>
        ) : null}
      </div>
      <div className={styles.cardMenu}>
        <DropdownMenu
          align="end"
          entries={[
            { label: 'Open', icon: <PlayIcon />, onSelect: open },
            { label: 'Rename', icon: <PencilIcon />, onSelect: () => setRenaming(true) },
            { kind: 'separator' },
            { label: 'Delete…', icon: <TrashIcon />, danger: true, onSelect: onDelete },
          ]}
          trigger={
            <IconButton label={`More actions for ${deck.title}`} size="sm">
              <MoreIcon size={18} />
            </IconButton>
          }
        />
      </div>
      </div>
    </article>
  )
}

function RenameField({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(initial)
  const done = useRef(false)
  const finish = (title: string | null) => {
    if (done.current) return
    done.current = true
    onDone(title)
  }
  return (
    <input
      className={styles.renameInput}
      aria-label="Presentation title"
      value={value}
      autoFocus
      maxLength={200}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.currentTarget.value)}
      onBlur={() => finish(value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(value.trim() || null)
        if (e.key === 'Escape') finish(null)
      }}
    />
  )
}
