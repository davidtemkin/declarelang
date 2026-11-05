import { motion } from 'motion/react'
import { IconButton } from '../../ui/controls'
import { useEditor, useEditorActions } from '../store'
import { TOOLS } from './tools'
import styles from './Toolbar.module.css'

/** The tools, floating over the top of the stage. The chosen one is marked by a pill that glides between them. */
export function Toolbar() {
  const current = useEditor((s) => s.tool)
  const actions = useEditorActions()
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Tools">
      {TOOLS.map(({ tool, label, key, icon }) => (
        <div key={tool} className={styles.slot}>
          {current === tool ? <motion.span layoutId="tool-pill" className={styles.pill} transition={{ type: 'spring', stiffness: 600, damping: 40 }} /> : null}
          <IconButton
            label={label}
            shortcut={key}
            size="lg"
            pressed={current === tool}
            className={styles.tool}
            onClick={() => actions.setTool(tool)}
            tipSide="bottom"
          >
            {icon}
          </IconButton>
        </div>
      ))}
    </div>
  )
}
