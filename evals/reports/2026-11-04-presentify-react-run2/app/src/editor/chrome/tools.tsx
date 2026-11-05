import type { ReactNode } from 'react'
import type { Tool } from '../../model/defaults'
import { EllipseIcon, LineIcon, RectIcon, SelectIcon, TextIcon } from '../../ui/icons'

/** The drawing tools, their names and their single-key shortcuts. */
export const TOOLS: { tool: Tool; label: string; key: string; icon: ReactNode }[] = [
  { tool: 'select', label: 'Select', key: 'v', icon: <SelectIcon /> },
  { tool: 'rect', label: 'Rectangle', key: 'r', icon: <RectIcon /> },
  { tool: 'ellipse', label: 'Ellipse', key: 'o', icon: <EllipseIcon /> },
  { tool: 'line', label: 'Line', key: 'l', icon: <LineIcon /> },
  { tool: 'text', label: 'Text', key: 't', icon: <TextIcon /> },
]
