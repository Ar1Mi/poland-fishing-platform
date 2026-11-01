import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Same origin as in production, where Caddy proxies /api (docs/08-testing-and-infra.md).
    // `vite preview` uses it too; the Playwright run points it at its own API.
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Playwright scenarios (pnpm e2e).
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
