import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { PayShell } from './pay-shell.js';

const root = document.querySelector('#pay-root');
if (!root) throw new Error('PAY_ROOT_MISSING');

createRoot(root).render(
  <StrictMode>
    <PayShell />
  </StrictMode>
);
