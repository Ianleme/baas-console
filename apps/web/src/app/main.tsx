import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBaasMemorySession } from '@baas/api-client';

import { AppRouter } from './app-router.js';

const root = document.querySelector('#app-root');
if (!root) throw new Error('APP_ROOT_MISSING');

const session = createBaasMemorySession();
createRoot(root).render(
  <StrictMode>
    <AppRouter session={session} />
  </StrictMode>
);
