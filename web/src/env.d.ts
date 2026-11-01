/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** The Eider server's address when the page is served by Vite (scripts/dev.sh). */
  readonly VITE_API_BASE?: string;
}
