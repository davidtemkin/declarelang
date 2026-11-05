import { AnimatePresence, motion } from 'motion/react'
import { SlideView } from '../../slide/SlideView'
import { Button } from '../../ui/controls'
import { WarningIcon } from '../../ui/icons'
import { useSync } from '../commands'
import { useEditor } from '../store'
import styles from './ConflictBanner.module.css'

/**
 * Tells the person, in plain words, that the slide in front of them was changed in another window,
 * shows them that version, and lets them choose. Nothing of theirs is written over until they do.
 */
export function ConflictBanner() {
  const key = useEditor((s) => s.currentSlide)
  const theirs = useEditor((s) => s.conflicts[s.currentSlide])
  const index = useEditor((s) => s.doc.order.indexOf(s.currentSlide))
  const sync = useSync()

  return (
    <AnimatePresence>
      {theirs ? (
        <motion.div
          key={key}
          className={styles.banner}
          role="alertdialog"
          aria-label="This slide was changed elsewhere"
          aria-describedby="conflict-text"
          initial={{ opacity: 0, y: -16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={styles.preview} aria-hidden="true">
            <SlideView content={theirs} />
            <span className={styles.previewLabel}>Their version</span>
          </div>
          <div className={styles.body}>
            <p className={styles.heading}>
              <WarningIcon size={16} /> Slide {index + 1} was changed in another window
            </p>
            <p id="conflict-text" className={styles.text}>
              Someone saved a different version of this slide after you opened it. Your version is still here and hasn’t been saved
              over theirs. Which one do you want to keep?
            </p>
            <div className={styles.actions}>
              <Button variant="primary" onClick={() => sync.resolveConflict(key, 'theirs')}>
                Use their version
              </Button>
              <Button variant="secondary" onClick={() => sync.resolveConflict(key, 'mine')}>
                Keep mine
              </Button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
