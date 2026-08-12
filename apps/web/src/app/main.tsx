import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppShell } from './app-shell.js';

const root = document.querySelector('#app-root');
if (!root) throw new Error('APP_ROOT_MISSING');

createRoot(root).render(
  <StrictMode>
    <AppShell />
  </StrictMode>
);
