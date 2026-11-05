import { AnimatePresence, motion } from 'motion/react'
import { CloudCheckIcon, CloudOffIcon } from '../../ui/icons'
import { Tip } from '../../ui/controls'
import { shortcutLabel } from '../../ui/shortcuts'
import { useEditor } from '../store'
import { useSync } from '../commands'
import styles from './TopBar.module.css'

/** The three things the window may say about saving, word for word. */
const SAVE_MESSAGES = {
  saved: 'All changes saved',
  saving: 'Saving…',
  offline: "Not saved: can't reach the service",
} as const

export function SaveStatus() {
  const state = useEditor((s) => s.saveState)
  const conflicts = useEditor((s) => Object.keys(s.conflicts).length)
  const sync = useSync()

  return (
    <div className={styles.saveArea}>
      <Tip label={state === 'offline' ? 'Your changes are kept here and will be saved when the service is back. Click to try now.' : `Presentify saves as you work. ${shortcutLabel('mod+s')} saves at once.`}>
        <button
          type="button"
          className={styles.saveStatus}
          data-state={state}
          onClick={() => void sync.saveNow()}
          aria-label={`${SAVE_MESSAGES[state]}. Save now`}
        >
          <span className={styles.saveIcon} aria-hidden="true">
            {state === 'saving' ? <span className={styles.spinner} /> : state === 'offline' ? <CloudOffIcon size={16} /> : <CloudCheckIcon size={16} />}
          </span>
          <span role="status" aria-live="polite" className={styles.saveText}>
            {SAVE_MESSAGES[state]}
          </span>
        </button>
      </Tip>
      <AnimatePresence>
        {conflicts > 0 ? (
          <motion.span
            className={styles.conflictChip}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
          >
            {conflicts === 1 ? '1 slide changed elsewhere' : `${conflicts} slides changed elsewhere`}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
