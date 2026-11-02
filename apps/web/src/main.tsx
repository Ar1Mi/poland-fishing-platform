import './index.css';
import './shared/i18n/i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { restoreSession } from './shared/auth/session';

// Silent login from the refresh cookie; the header shows the account once it settles.
void restoreSession();
// The service worker that opens the app without network (ADR-0009); a new version reloads it.
registerSW({ immediate: true });

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element in index.html');
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
