import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router";
import { SignInProvider } from "./account/SignInProvider";
import { CheckoutPage } from "./checkout/CheckoutPage";
import { HallPage } from "./hall/HallPage";
import { PerformanceRoute } from "./performances/PerformanceRoute";
import { PerformancesPage } from "./performances/PerformancesPage";
import { SelectionProvider } from "./selection";
import { TicketsPage } from "./tickets/TicketsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true },
  },
});

function Shell() {
  return (
    <SignInProvider>
      <Outlet />
    </SignInProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { index: true, element: <PerformancesPage /> },
      {
        path: "performances/:performanceId",
        element: <PerformanceRoute />,
        children: [
          { index: true, element: <HallPage /> },
          { path: "checkout", element: <CheckoutPage /> },
        ],
      },
      { path: "tickets", element: <TicketsPage /> },
      { path: "*", element: <PerformancesPage /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SelectionProvider>
        <RouterProvider router={router} />
      </SelectionProvider>
    </QueryClientProvider>
  );
}
