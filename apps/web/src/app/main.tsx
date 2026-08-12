import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createPaymentLinksClient } from '@baas/api-client';

import { AppShell } from './app-shell.js';
import { AuthJourney } from '../features/auth/auth-journey.js';
import { PaymentLinks, type PaymentLinksApi } from '../features/payment-links/payment-links.js';

const root = document.querySelector('#app-root');
if (!root) throw new Error('APP_ROOT_MISSING');

const linksApi = createPaymentLinksClient({ baseUrl: '' }) as PaymentLinksApi;
const screen =
  globalThis.location.hash === '#/links' ? (
    <AppShell content={<PaymentLinks api={linksApi} />} />
  ) : (
    <AuthJourney />
  );
createRoot(root).render(<StrictMode>{screen}</StrictMode>);
