import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Tooltip from '@radix-ui/react-tooltip'
import { MotionConfig } from 'motion/react'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { DeckListPage } from './home/DeckListPage'
import { loadEditor } from './editor/loadEditor'
import { Illustration } from './ui/Illustration'
import styles from './editor/EditorPage.module.css'

const EditorPage = lazy(() => loadEditor().then((m) => ({ default: m.EditorPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider delayDuration={450} skipDelayDuration={250}>
        <MotionConfig reducedMotion="user">
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<DeckListPage />} />
              <Route
                path="/d/:deckId"
                element={
                  <Suspense fallback={null}>
                    <EditorPage />
                  </Suspense>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </MotionConfig>
      </Tooltip.Provider>
    </QueryClientProvider>
  )
}

function NotFound() {
  return (
    <div className={styles.problem}>
      <Illustration kind="missing" />
      <h1>Nothing at this address</h1>
      <p>The page you were looking for isn’t part of Presentify.</p>
      <Link to="/" className={styles.problemLink}>
        Back to all presentations
      </Link>
    </div>
  )
}
