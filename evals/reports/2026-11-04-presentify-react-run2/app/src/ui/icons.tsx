import type { SVGProps } from 'react'

/**
 * Presentify's icon set. Drawn on a 20-point grid with a 1.6 stroke and round ends, so every icon,
 * from the tools to the smallest menu glyph, belongs to the same family.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const SelectIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 3.5 15.2 9.2l-4.6 1.3-2.3 4.3L5 3.5Z" fill="currentColor" fillOpacity={0.12} />
  </Icon>
)
export const RectIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="13" height="11" rx="2.5" fill="currentColor" fillOpacity={0.12} />
  </Icon>
)
export const EllipseIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="6.5" fill="currentColor" fillOpacity={0.12} />
  </Icon>
)
export const LineIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 15.5 15.5 4.5" />
    <circle cx="4.5" cy="15.5" r="1.3" fill="currentColor" />
    <circle cx="15.5" cy="4.5" r="1.3" fill="currentColor" />
  </Icon>
)
export const TextIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 5.5v-1.5h11v1.5M10 4v12M7.5 16h5" />
  </Icon>
)
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4.5v11M4.5 10h11" />
  </Icon>
)
export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 4.6v10.8a.6.6 0 0 0 .9.5l8.6-5.4a.6.6 0 0 0 0-1L7.4 4.1a.6.6 0 0 0-.9.5Z" fill="currentColor" stroke="none" />
  </Icon>
)
export const UndoIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 5 3.8 8.2 7 11.4" />
    <path d="M4 8.2h7.5a4.3 4.3 0 0 1 0 8.6H9" />
  </Icon>
)
export const RedoIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m13 5 3.2 3.2L13 11.4" />
    <path d="M16 8.2H8.5a4.3 4.3 0 0 0 0 8.6H11" />
  </Icon>
)
export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 4.5-5.5 5.5 5.5 5.5" />
  </Icon>
)
export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5.5 8 4.5 4.5L14.5 8" />
  </Icon>
)
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </Icon>
)
export const MoreIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5" cy="10" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="10" cy="10" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="10" r="1.2" fill="currentColor" stroke="none" />
  </Icon>
)
export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h12M8 6V4.5h4V6M5.5 6l.7 9.3a1.3 1.3 0 0 0 1.3 1.2h5a1.3 1.3 0 0 0 1.3-1.2L14.5 6" />
  </Icon>
)
export const DuplicateIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7" y="7" width="9" height="9" rx="2" />
    <path d="M13 4.5V4a.5.5 0 0 0-.5-.5H5A1.5 1.5 0 0 0 3.5 5v7.5a.5.5 0 0 0 .5.5h.5" />
  </Icon>
)
export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12.5 4.5 3 3L8 15l-3.8.8L5 12l7.5-7.5Z" />
  </Icon>
)
export const GroupIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="14" height="14" rx="2.5" strokeDasharray="2.2 2.2" />
    <rect x="6" y="6" width="5" height="5" rx="1" fill="currentColor" fillOpacity={0.15} />
    <circle cx="12.3" cy="12.3" r="2.5" fill="currentColor" fillOpacity={0.15} />
  </Icon>
)
export const UngroupIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor" fillOpacity={0.15} />
    <circle cx="13.5" cy="13.5" r="3.5" fill="currentColor" fillOpacity={0.15} />
  </Icon>
)
export const AlignLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 3v14" />
    <rect x="6" y="5" width="10" height="3.5" rx="1" />
    <rect x="6" y="11.5" width="6" height="3.5" rx="1" />
  </Icon>
)
export const AlignCenterIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3v14" />
    <rect x="4" y="5" width="12" height="3.5" rx="1" />
    <rect x="6.5" y="11.5" width="7" height="3.5" rx="1" />
  </Icon>
)
export const AlignRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16.5 3v14" />
    <rect x="4" y="5" width="10" height="3.5" rx="1" />
    <rect x="8" y="11.5" width="6" height="3.5" rx="1" />
  </Icon>
)
export const AlignTopIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 3.5h14" />
    <rect x="5" y="6" width="3.5" height="10" rx="1" />
    <rect x="11.5" y="6" width="3.5" height="6" rx="1" />
  </Icon>
)
export const AlignMiddleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 10h14" />
    <rect x="5" y="4" width="3.5" height="12" rx="1" />
    <rect x="11.5" y="6.5" width="3.5" height="7" rx="1" />
  </Icon>
)
export const AlignBottomIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 16.5h14" />
    <rect x="5" y="4" width="3.5" height="10" rx="1" />
    <rect x="11.5" y="8" width="3.5" height="6" rx="1" />
  </Icon>
)
export const DistributeHIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 3.5v13M17 3.5v13" />
    <rect x="8" y="6" width="4" height="8" rx="1" />
  </Icon>
)
export const DistributeVIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 3h13M3.5 17h13" />
    <rect x="6" y="8" width="8" height="4" rx="1" />
  </Icon>
)
export const BringFrontIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="8" width="8" height="8" rx="1.5" strokeDasharray="2 2" />
    <rect x="8" y="3.5" width="8.5" height="8.5" rx="1.5" fill="currentColor" fillOpacity={0.2} />
  </Icon>
)
export const BringForwardIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="7.5" width="9" height="9" rx="1.5" />
    <path d="M14.5 9V3.5M12 6l2.5-2.5L17 6" />
  </Icon>
)
export const SendBackwardIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
    <path d="M14.5 11v5.5M12 14l2.5 2.5L17 14" />
  </Icon>
)
export const SendBackIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="8.5" y="3.5" width="8.5" height="8.5" rx="1.5" strokeDasharray="2 2" />
    <rect x="3" y="8" width="8" height="8" rx="1.5" fill="currentColor" fillOpacity={0.2} />
  </Icon>
)
export const TextAlignLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5h12M4 8.5h8M4 12h12M4 15.5h7" />
  </Icon>
)
export const TextAlignCenterIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5h12M6 8.5h8M4 12h12M6.5 15.5h7" />
  </Icon>
)
export const TextAlignRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5h12M8 8.5h8M4 12h12M9 15.5h7" />
  </Icon>
)
export const ItalicIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8.5 4.5h6M5.5 15.5h6M11.5 4.5l-3 11" />
  </Icon>
)
export const LockRatioIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5.5" width="13" height="9" rx="1.5" />
    <path d="M7 10h6M7 10l1.6-1.6M7 10l1.6 1.6M13 10l-1.6-1.6M13 10l-1.6 1.6" />
  </Icon>
)
export const NoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="6" />
    <path d="m5.8 14.2 8.4-8.4" />
  </Icon>
)
export const CloudCheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 15.5a3.5 3.5 0 0 1-.4-7A4.6 4.6 0 0 1 14.4 8a3.8 3.8 0 0 1-.4 7.5H6Z" />
    <path d="m7.8 11.4 1.6 1.6 3-3.2" />
  </Icon>
)
export const CloudOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 15.5a3.5 3.5 0 0 1-.4-7A4.6 4.6 0 0 1 14.4 8a3.8 3.8 0 0 1-.4 7.5H6Z" />
    <path d="M10 9v3M10 14.2v.1" />
  </Icon>
)
export const WarningIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8.8 3.8a1.4 1.4 0 0 1 2.4 0l5.9 10.4a1.4 1.4 0 0 1-1.2 2.1H4.1a1.4 1.4 0 0 1-1.2-2.1L8.8 3.8Z" />
    <path d="M10 8v3.5M10 14v.1" />
  </Icon>
)
export const CopyIcon = DuplicateIcon
export const ScissorsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5.5" cy="14.5" r="2.2" />
    <circle cx="14.5" cy="14.5" r="2.2" />
    <path d="M7 13 15 3.5M13 13 5 3.5" />
  </Icon>
)
export const ClipboardIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="4" width="11" height="13" rx="2" />
    <path d="M7.5 4V3h5v1" />
  </Icon>
)
export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="5" />
    <path d="m13 13 3.5 3.5" />
  </Icon>
)
export const GridIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.2" />
    <rect x="11" y="3.5" width="5.5" height="5.5" rx="1.2" />
    <rect x="3.5" y="11" width="5.5" height="5.5" rx="1.2" />
    <rect x="11" y="11" width="5.5" height="5.5" rx="1.2" />
  </Icon>
)
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
  </Icon>
)
export const ArrowUpIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 15.5v-11M5.5 9 10 4.5 14.5 9" />
  </Icon>
)
export const ArrowDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4.5v11M5.5 11l4.5 4.5 4.5-4.5" />
  </Icon>
)
export const SlideIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="4.5" width="15" height="10" rx="2" />
    <path d="M7 17.5h6" />
  </Icon>
)
export const CornerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 16V10a6 6 0 0 1 6-6h6" />
  </Icon>
)
