/** Stands for "the selected things differ here". */
export const MIXED = Symbol('mixed')
export type Mixed<T> = T | typeof MIXED

/** One value if every item agrees, MIXED if they don't, undefined if there are no items. */
export function agree<T>(values: T[], same: (a: T, b: T) => boolean = Object.is): Mixed<T> | undefined {
  if (values.length === 0) return undefined
  return values.every((v) => same(v, values[0])) ? values[0] : MIXED
}
