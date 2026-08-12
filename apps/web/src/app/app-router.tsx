import { useEffect, useMemo, useState } from 'react';
import {
  createAuthJourneyClient,
  createPaymentLinksClient,
  createReconciliationClient,
  createWebhooksClient,
  type BaasMemorySession
} from '@baas/api-client';

import { AuthJourney, type AuthJourneyApi } from '../features/auth/auth-journey.js';
import { PaymentLinks, type PaymentLinksApi } from '../features/payment-links/payment-links.js';
import {
  ReconciliationPage,
  type ReconciliationApi
} from '../features/reconciliation/reconciliation-page.js';
import {
  WebhookManagement,
  type WebhookManagementApi
} from '../features/webhooks/webhook-management.js';
import { AppShell } from './app-shell.js';

export function AppRouter({ session }: { session: BaasMemorySession }) {
  const [hash, setHash] = useState(globalThis.location.hash || '#/');
  const [authenticated, setAuthenticated] = useState(Boolean(session.token()));
  const clients = useMemo(() => {
    const options = {
      baseUrl: '',
      accessToken: session.token,
      onAccessToken: session.setToken
    };
    return {
      auth: createAuthJourneyClient(options) as AuthJourneyApi,
      links: createPaymentLinksClient(options) as PaymentLinksApi,
      webhooks: createWebhooksClient(options) as WebhookManagementApi,
      reconciliation: createReconciliationClient(options) as ReconciliationApi
    };
  }, [session]);

  useEffect(() => {
    const navigate = () => {
      setHash(globalThis.location.hash || '#/');
    };
    globalThis.addEventListener('hashchange', navigate);
    return () => {
      globalThis.removeEventListener('hashchange', navigate);
    };
  }, []);

  if (!authenticated) {
    return (
      <AuthJourney
        client={clients.auth}
        onAuthenticated={() => {
          setAuthenticated(true);
          globalThis.location.hash = '#/';
        }}
      />
    );
  }
  if (hash === '#/links') return <AppShell content={<PaymentLinks api={clients.links} />} />;
  if (hash === '#/webhooks')
    return <AppShell content={<WebhookManagement api={clients.webhooks} />} />;
  if (hash === '#/reconciliation')
    return <AppShell content={<ReconciliationPage api={clients.reconciliation} />} />;
  return <AppShell />;
}
