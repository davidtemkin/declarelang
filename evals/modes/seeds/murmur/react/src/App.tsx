import { useState } from 'react'
import { ThreadList } from './components/ThreadList'
import { ThreadView } from './components/ThreadView'
import { useMediaQuery } from './lib/useMediaQuery'
import { useOpenThread } from './lib/route'
import { useChat } from './state/context'
import './App.css'

export default function App() {
  const { state } = useChat()
  const openId = useOpenThread()
  const wide = useMediaQuery('(min-width: 900px)')
  const open = openId !== null && state?.threads[openId] !== undefined

  // On a phone the conversation slides away over the list. Keep showing the
  // one that is leaving until it has gone.
  const [shownId, setShownId] = useState(openId)
  if (open && shownId !== openId) setShownId(openId)
  const shown = open ? openId : wide ? null : shownId

  return (
    <div className="app" data-layout={wide ? 'wide' : 'narrow'} data-open={open}>
      <div className="app__list" inert={!wide && open}>
        <ThreadList selectedId={open ? openId : null} />
      </div>
      <main className="app__thread" inert={!wide && !open}>
        {state && shown && state.threads[shown] ? (
          <ThreadView key={shown} threadId={shown} active={open} showBack={!wide} />
        ) : (
          wide && <EmptyPane loading={!state} />
        )}
      </main>
    </div>
  )
}

function EmptyPane({ loading }: { loading: boolean }) {
  return (
    <div className="empty-pane">
      {!loading && (
        <p className="empty-pane__text">
          Choose a conversation.
          <span>New ones rise to the top as they happen.</span>
        </p>
      )}
    </div>
  )
}
