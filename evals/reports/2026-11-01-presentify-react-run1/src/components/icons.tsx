/**
 * Presentify's icon set: drawn on a 20-point grid with a 1.6-point stroke and round joins,
 * so every icon has the same weight as the wordmark and the selection handles.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

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
      aria-hidden
      focusable={false}
      {...rest}
    >
      {children}
    </svg>
  );
}

const make = (paths: React.ReactNode) => (props: IconProps) => <Icon {...props}>{paths}</Icon>;

export const SelectIcon = make(<path d="M5 3.5 15 9.2l-4.4 1.2-2.1 4.3z" />);
export const RectIcon = make(<rect x="3.5" y="5" width="13" height="10" rx="1.5" />);
export const EllipseIcon = make(<ellipse cx="10" cy="10" rx="6.5" ry="5.5" />);
export const LineIcon = make(<path d="M4.5 15.5 15.5 4.5" />);
export const TextIcon = make(<path d="M4.5 5.5V4h11v1.5M10 4v12M7.5 16h5" />);

export const UndoIcon = make(<path d="M7.5 5 4 8.5 7.5 12M4.5 8.5h7a4 4 0 0 1 0 8H9" />);
export const RedoIcon = make(<path d="M12.5 5 16 8.5 12.5 12M15.5 8.5h-7a4 4 0 0 0 0 8H11" />);
export const PlayIcon = make(<path d="M6.5 4.5v11l9-5.5z" fill="currentColor" />);
export const PlusIcon = make(<path d="M10 4.5v11M4.5 10h11" />);
export const DuplicateIcon = make(
  <>
    <rect x="7" y="7" width="9" height="9" rx="1.8" />
    <path d="M13 4.5H5.8A1.3 1.3 0 0 0 4.5 5.8V13" />
  </>,
);
export const TrashIcon = make(<path d="M4 6h12M8 6V4.5h4V6M5.5 6l.7 9.6a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4l.7-9.6" />);
export const MoreIcon = make(
  <g fill="currentColor" stroke="none">
    <circle cx="5" cy="10" r="1.4" />
    <circle cx="10" cy="10" r="1.4" />
    <circle cx="15" cy="10" r="1.4" />
  </g>,
);
export const ChevronDownIcon = make(<path d="m6 8 4 4 4-4" />);
export const ChevronLeftIcon = make(<path d="m12 5-5 5 5 5" />);
export const CheckIcon = make(<path d="m4.5 10.5 3.5 3.5 7.5-8" />);
export const CloseIcon = make(<path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />);
export const PencilIcon = make(<path d="m12.5 4.5 3 3-8.5 8.5H4v-3zM11 6l3 3" />);
export const GridIcon = make(
  <>
    <rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.2" />
    <rect x="11" y="3.5" width="5.5" height="5.5" rx="1.2" />
    <rect x="3.5" y="11" width="5.5" height="5.5" rx="1.2" />
    <rect x="11" y="11" width="5.5" height="5.5" rx="1.2" />
  </>,
);
export const CloudCheckIcon = make(
  <path d="M6 15.5h8a3.5 3.5 0 0 0 .4-7A4.8 4.8 0 0 0 5.2 9 3.3 3.3 0 0 0 6 15.5zM8 11.5l1.5 1.5 3-3" />,
);
export const CloudOffIcon = make(
  <path d="M6 15.5h8a3.5 3.5 0 0 0 1.6-.4M17.4 12.6A3.5 3.5 0 0 0 14.4 8.5a4.8 4.8 0 0 0-6.2-3.2M5.4 8.6A3.3 3.3 0 0 0 6 15.5M3.5 3.5l13 13" />,
);
export const WarningIcon = make(<path d="M10 3.5 2.8 16h14.4zM10 8.5v3.5M10 14.2v.1" />);

export const AlignLeftIcon = make(<path d="M4 3.5v13M7 6.5h8M7 13.5h5" />);
export const AlignCenterIcon = make(<path d="M10 3.5v13M5.5 6.5h9M7 13.5h6" />);
export const AlignRightIcon = make(<path d="M16 3.5v13M5 6.5h8M8 13.5h5" />);
export const AlignTopIcon = make(<path d="M3.5 4h13M6.5 7v8M13.5 7v5" />);
export const AlignMiddleIcon = make(<path d="M3.5 10h13M6.5 5.5v9M13.5 7v6" />);
export const AlignBottomIcon = make(<path d="M3.5 16h13M6.5 5v8M13.5 8v5" />);
export const DistributeHIcon = make(
  <>
    <path d="M3.5 3.5v13M16.5 3.5v13" />
    <rect x="8" y="6" width="4" height="8" rx="1" />
  </>,
);
export const DistributeVIcon = make(
  <>
    <path d="M3.5 3.5h13M3.5 16.5h13" />
    <rect x="6" y="8" width="8" height="4" rx="1" />
  </>,
);

export const GroupIcon = make(
  <>
    <path d="M3.5 6V3.5H6M14 3.5h2.5V6M16.5 14v2.5H14M6 16.5H3.5V14" />
    <rect x="6.5" y="6.5" width="4.5" height="4.5" rx="1" />
    <rect x="9.5" y="9.5" width="4" height="4" rx="2" />
  </>,
);
export const UngroupIcon = make(
  <>
    <rect x="3.5" y="3.5" width="6" height="6" rx="1.2" />
    <rect x="10.5" y="10.5" width="6" height="6" rx="3" />
  </>,
);
export const BringForwardIcon = make(
  <>
    <rect x="3.5" y="7.5" width="9" height="9" rx="1.5" strokeDasharray="2 2" />
    <rect x="7.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor" fillOpacity={0.25} />
  </>,
);
export const SendBackwardIcon = make(
  <>
    <rect x="7.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor" fillOpacity={0.25} />
    <rect x="3.5" y="7.5" width="9" height="9" rx="1.5" fill="var(--icon-knockout, #232428)" />
  </>,
);
export const LinkIcon = make(
  <path d="M8.5 11.5 11.5 8.5M9 6l1.2-1.2a3 3 0 0 1 4.2 4.2L13.2 10.2M11 14l-1.2 1.2a3 3 0 0 1-4.2-4.2L6.8 9.8" />,
);
export const CornerIcon = make(<path d="M4 16V10a6 6 0 0 1 6-6h6" />);
export const SlideIcon = make(<rect x="2.5" y="5" width="15" height="10" rx="1.8" />);
export const NoneIcon = make(<path d="M5 15 15 5" />);

export const ItalicIcon = make(<path d="M8.5 4.5h6M5.5 15.5h6M11.5 4.5l-3 11" />);
export const BoldIcon = make(<path d="M6 4.5h4.8a2.8 2.8 0 0 1 0 5.5H6zM6 10h5.5a2.8 2.8 0 0 1 0 5.5H6z" strokeWidth={2} />);
export const TextLeftIcon = make(<path d="M4 5.5h12M4 8.5h8M4 11.5h12M4 14.5h8" />);
export const TextCenterIcon = make(<path d="M4 5.5h12M6 8.5h8M4 11.5h12M6 14.5h8" />);
export const TextRightIcon = make(<path d="M4 5.5h12M8 8.5h8M4 11.5h12M8 14.5h8" />);

/** The Presentify mark: a slide whose corner turns into a play button. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable={false}>
      <rect x="2" y="6" width="28" height="20" rx="5" fill="var(--accent)" />
      <path d="M13 11.5v9l7.5-4.5z" fill="#fff" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <Mark size={22} />
      <span className="wordmark-text">Presentify</span>
    </span>
  );
}
