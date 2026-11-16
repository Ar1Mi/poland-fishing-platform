/// <reference types="vite/client" />

// Build-time variables of the web app (docs/08-testing-and-infra.md → «Окружение»).
interface ImportMetaEnv {
  readonly VITE_MAP_TILE_URL?: string;
  readonly VITE_MAP_TILE_ATTRIBUTION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
