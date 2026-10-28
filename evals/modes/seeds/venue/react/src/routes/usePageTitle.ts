import { useCallback, useEffect, useRef } from 'react'

let firstPage = true

/**
 * Names the page in the tab, and on arriving from another page moves focus to
 * its heading (once it exists) so keyboard and screen-reader users start at the
 * top of what's new. Returns a ref for that heading.
 */
export function usePageTitle<T extends HTMLElement>(title: string) {
  useEffect(() => {
    document.title = `${title} — The Venue`
  }, [title])

  const done = useRef(false)
  return useCallback((el: T | null) => {
    if (!el || done.current) return
    done.current = true
    if (firstPage) {
      // A fresh load already starts at the top; leave focus to the browser.
      firstPage = false
      return
    }
    el.focus({ preventScroll: true })
  }, [])
}
