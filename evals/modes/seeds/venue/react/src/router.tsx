import { createBrowserRouter } from 'react-router'
import { AppShell } from './shell/AppShell'
import { Checkout } from './routes/Checkout'
import { Hall } from './routes/Hall'
import { NotFound } from './routes/NotFound'
import { PerformanceLayout } from './routes/PerformanceLayout'
import { Performances } from './routes/Performances'
import { Tickets } from './routes/Tickets'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Performances /> },
      {
        path: 'performances/:performanceId',
        element: <PerformanceLayout />,
        children: [
          { index: true, element: <Hall /> },
          { path: 'checkout', element: <Checkout /> },
        ],
      },
      { path: 'tickets', element: <Tickets /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
