import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createPaymentLinksClient,
  createReconciliationClient,
  createWebhooksClient
} from '@baas/api-client';

import { AppShell } from './app-shell.js';
import { AuthJourney } from '../features/auth/auth-journey.js';
import { PaymentLinks, type PaymentLinksApi } from '../features/payment-links/payment-links.js';
import {
  ReconciliationPage,
  type ReconciliationApi
} from '../features/reconciliation/reconciliation-page.js';
import {
  WebhookManagement,
  type WebhookManagementApi
} from '../features/webhooks/webhook-management.js';

const root = document.querySelector('#app-root');
if (!root) throw new Error('APP_ROOT_MISSING');

const linksApi = createPaymentLinksClient({ baseUrl: '' }) as PaymentLinksApi;
const screen =
  globalThis.location.hash === '#/links' ? (
    <AppShell content={<PaymentLinks api={linksApi} />} />
  ) : globalThis.location.hash === '#/webhooks' ? (
    <AppShell
      content={
        <WebhookManagement api={createWebhooksClient({ baseUrl: '' }) as WebhookManagementApi} />
      }
    />
  ) : globalThis.location.hash === '#/reconciliation' ? (
    <AppShell
      content={
        <ReconciliationPage
          api={createReconciliationClient({ baseUrl: '' }) as ReconciliationApi}
        />
      }
    />
  ) : (
    <AuthJourney />
  );
createRoot(root).render(<StrictMode>{screen}</StrictMode>);
