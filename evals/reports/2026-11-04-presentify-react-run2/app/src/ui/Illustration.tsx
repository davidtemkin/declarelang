/**
 * Presentify's spot illustrations, built from the same shapes a slide is made of: rounded slides,
 * circles, lines and a spark, in the brand palette.
 */
export function Illustration({ kind, size = 220 }: { kind: 'empty' | 'offline' | 'missing'; size?: number }) {
  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 220 158" aria-hidden="true" focusable="false">
      <ellipse cx="110" cy="146" rx="78" ry="8" fill="#17151F" opacity="0.06" />
      {kind === 'empty' ? <Empty /> : kind === 'offline' ? <Offline /> : <Missing />}
    </svg>
  )
}

function Spark({ x, y, r = 6, color = '#FFC23D' }: { x: number; y: number; r?: number; color?: string }) {
  return (
    <path
      d={`M${x} ${y - r}C${x + r * 0.15} ${y - r * 0.15} ${x + r * 0.15} ${y - r * 0.15} ${x + r} ${y}C${x + r * 0.15} ${y + r * 0.15} ${x + r * 0.15} ${y + r * 0.15} ${x} ${y + r}C${x - r * 0.15} ${y + r * 0.15} ${x - r * 0.15} ${y + r * 0.15} ${x - r} ${y}C${x - r * 0.15} ${y - r * 0.15} ${x - r * 0.15} ${y - r * 0.15} ${x} ${y - r}Z`}
      fill={color}
    />
  )
}

function Empty() {
  return (
    <g>
      <g transform="rotate(-8 70 80)">
        <rect x="22" y="44" width="104" height="64" rx="10" fill="#E7E1FF" />
        <rect x="34" y="58" width="46" height="7" rx="3.5" fill="#8E7BFF" />
        <rect x="34" y="72" width="30" height="5" rx="2.5" fill="#CFC4FF" />
      </g>
      <g transform="rotate(6 140 86)">
        <rect x="84" y="40" width="118" height="74" rx="11" fill="#fff" stroke="#E2DFE9" strokeWidth="1.5" />
        <rect x="84" y="40" width="118" height="22" rx="11" fill="#5B3DF5" />
        <rect x="84" y="51" width="118" height="11" fill="#5B3DF5" />
        <circle cx="168" cy="90" r="14" fill="#FF6A4D" />
        <rect x="98" y="76" width="40" height="6" rx="3" fill="#17151F" opacity="0.8" />
        <rect x="98" y="88" width="28" height="5" rx="2.5" fill="#B4AFC0" />
        <path d="M98 102h44" stroke="#20C49A" strokeWidth="3" strokeLinecap="round" />
      </g>
      <Spark x={190} y={28} r={9} />
      <Spark x={32} y={30} r={5} color="#FF6A4D" />
      <circle cx="58" cy="128" r="4" fill="#20C49A" />
    </g>
  )
}

function Offline() {
  return (
    <g>
      <rect x="48" y="36" width="124" height="80" rx="12" fill="#fff" stroke="#E2DFE9" strokeWidth="1.5" />
      <rect x="62" y="52" width="52" height="8" rx="4" fill="#CFC4FF" />
      <rect x="62" y="68" width="34" height="6" rx="3" fill="#E5E2EC" />
      <circle cx="146" cy="88" r="14" fill="#E5E2EC" />
      <path d="M28 128c18-6 28-22 44-22s20 14 38 14 26-18 44-18 26 14 40 22" stroke="#8E7BFF" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 9" fill="none" />
      <circle cx="176" cy="40" r="20" fill="#FF6A4D" />
      <path d="M176 30v12M176 49v1" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <Spark x={36} y={44} r={6} />
    </g>
  )
}

function Missing() {
  return (
    <g>
      <g transform="rotate(-6 110 80)">
        <rect x="52" y="34" width="116" height="76" rx="12" fill="#fff" stroke="#CFCAD9" strokeWidth="2" strokeDasharray="6 6" />
      </g>
      <circle cx="110" cy="72" r="22" fill="#E7E1FF" />
      <path d="M102 64a8 8 0 1 1 11 7.4c-2 .8-3 2.2-3 4.1V78M110 85v.5" stroke="#5B3DF5" strokeWidth="4" strokeLinecap="round" fill="none" />
      <Spark x={176} y={30} r={8} />
      <circle cx="42" cy="118" r="6" fill="#FF6A4D" />
    </g>
  )
}
