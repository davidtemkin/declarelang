/** Joins class names, skipping the ones that don't apply. */
export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ')
