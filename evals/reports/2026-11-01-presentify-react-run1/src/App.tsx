import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, useParams } from 'react-router-dom';
import { TooltipProvider } from './components/ui';
import { DeckListPage } from './pages/DeckListPage';

// The editor is most of the code; the list of presentations shouldn't wait for it.
const EditorPage = lazy(() => import('./pages/EditorPage').then((m) => ({ default: m.EditorPage })));

/** A fresh editor for each presentation, so nothing carries over from the last one. */
function EditorRoute() {
  const { deckId } = useParams();
  return (
    <Suspense fallback={null}>
      <EditorPage key={deckId} />
    </Suspense>
  );
}

const router = createBrowserRouter([
  { path: '/', element: <DeckListPage /> },
  { path: '/p/:deckId', element: <EditorRoute /> },
  { path: '*', element: <DeckListPage /> },
]);

export function App() {
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  );
}
