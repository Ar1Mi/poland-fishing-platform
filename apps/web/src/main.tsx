import './index.css';
import './shared/i18n/i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element in index.html');
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
