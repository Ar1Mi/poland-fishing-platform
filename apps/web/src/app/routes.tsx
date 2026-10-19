import type { RouteObject } from 'react-router';
import { HomePage } from '../features/home/pages/HomePage';
import { NotFoundPage } from '../shared/pages/NotFoundPage';
import { RouteErrorPage } from '../shared/pages/RouteErrorPage';
import { AppLayout } from './AppLayout';

// Screens are added by their feature tasks (docs/06-frontend.md → «Маршруты»).
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
