import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../../api/types'
import { EllipseIcon, LineIcon, RectIcon, TextIcon } from '../../ui/icons'
import type { StageLayout } from './useStageLayout'
import styles from './Stage.module.css'

/** Shown on an empty slide only, never saved: a gentle nudge toward the tools. */
export function EmptySlideHint({ layout, dark }: { layout: StageLayout; dark: boolean }) {
  return (
    <div
      className={styles.emptyHint}
      data-dark={dark ? '' : undefined}
      style={{
        left: layout.originX,
        top: layout.originY,
        width: SLIDE_WIDTH * layout.scale,
        height: SLIDE_HEIGHT * layout.scale,
      }}
    >
      <div className={styles.emptyHintInner}>
        <div className={styles.emptyHintIcons} aria-hidden="true">
          <RectIcon size={22} />
          <EllipseIcon size={22} />
          <LineIcon size={22} />
          <TextIcon size={22} />
        </div>
        <p className={styles.emptyHintTitle}>A blank slide</p>
        <p className={styles.emptyHintText}>Pick a shape or Text in the toolbar, then drag on the slide.</p>
      </div>
    </div>
  )
}
