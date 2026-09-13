// Public mobile builds must never inherit a developer's private proxy address.
import './check-version.mjs';
import { build } from 'vite';

process.env.VITE_TICKET_PROXY_BASE_URL = '';
await build({
  envDir: false,
  define: { 'import.meta.env.VITE_TICKET_PROXY_BASE_URL': JSON.stringify('') },
});
