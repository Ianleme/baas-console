import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AuthJourney } from '../features/auth/auth-journey.js';

const root = document.querySelector('#app-root');
if (!root) throw new Error('APP_ROOT_MISSING');

createRoot(root).render(
  <StrictMode>
    <AuthJourney />
  </StrictMode>
);
