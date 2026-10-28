import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

const AnnouncerContext = createContext<(message: string) => void>(() => {})

/** One polite live region for things that happen away from where focus is. */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState({ text: '', n: 0 })
  const announce = useCallback((text: string) => setMessage((m) => ({ text, n: m.n + 1 })), [])
  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div className="visually-hidden" role="status" aria-live="polite">
        {/* Keyed so the same sentence twice is still announced twice. */}
        <span key={message.n}>{message.text}</span>
      </div>
    </AnnouncerContext.Provider>
  )
}

export function useAnnounce() {
  return useContext(AnnouncerContext)
}
