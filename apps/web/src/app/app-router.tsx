import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createAuthJourneyClient,
  createCurrentProfileClient,
  createDashboardClient,
  createPaymentLinksClient,
  createReconciliationClient,
  createTransactionsClient,
  createWebhooksClient,
  createWithdrawalsClient,
  type BaasMemorySession
} from '@baas/api-client';

import { AuthJourney, type AuthJourneyApi } from '../features/auth/auth-journey.js';
import { Dashboard, type DashboardApi } from '../features/dashboard/dashboard.js';
import { PaymentLinks, type PaymentLinksApi } from '../features/payment-links/payment-links.js';
import {
  ReconciliationPage,
  type ReconciliationApi
} from '../features/reconciliation/reconciliation-page.js';
import {
  TransactionsPage,
  type TransactionStatementApi
} from '../features/transactions/transactions-page.js';
import {
  WebhookManagement,
  type WebhookManagementApi
} from '../features/webhooks/webhook-management.js';
import { WithdrawalsPage, type WithdrawalsApi } from '../features/withdrawals/withdrawals-page.js';
import { AppShell } from './app-shell.js';
import { WalletPage } from '../features/wallet/wallet-page.js';
import { SettingsPage } from '../features/settings/settings-page.js';
import type { WalletApi } from '../features/wallet/wallet-page.js';
import type { CurrentProfile, CurrentProfileApi } from '../features/settings/settings-page.js';

export function AppRouter({ session }: { session: BaasMemorySession }) {
  const [hash, setHash] = useState(globalThis.location.hash || '#/');
  const [authenticated, setAuthenticated] = useState(Boolean(session.token()));
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [profileState, setProfileState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const endSession = useCallback(() => {
    session.clear();
    setProfile(null);
    setAuthenticated(false);
  }, [session]);
  const clients = useMemo(() => {
    const options = {
      baseUrl: '',
      accessToken: session.token,
      onAccessToken: session.setToken,
      onUnauthenticated: endSession
    };
    return {
      auth: createAuthJourneyClient(options) as AuthJourneyApi & { logout(): Promise<void> },
      profile: createCurrentProfileClient(options) as CurrentProfileApi,
      dashboard: createDashboardClient(options) as DashboardApi,
      links: createPaymentLinksClient(options) as PaymentLinksApi,
      transactions: (createTransactionsClient as (opts: unknown) => TransactionStatementApi)(
        options
      ),
      withdrawals: (createWithdrawalsClient as (opts: unknown) => WithdrawalsApi)(options),
      webhooks: createWebhooksClient(options) as WebhookManagementApi,
      reconciliation: createReconciliationClient(options) as ReconciliationApi
    };
  }, [endSession, session]);

  useEffect(() => {
    const navigate = () => {
      setHash(globalThis.location.hash || '#/');
    };
    globalThis.addEventListener('hashchange', navigate);
    return () => {
      globalThis.removeEventListener('hashchange', navigate);
    };
  }, []);

  useEffect(() => {
    if (!authenticated) {
      void clients.auth.refresh?.().then((success) => {
        if (success) setAuthenticated(true);
      });
    }
  }, [authenticated, clients.auth]);

  useEffect(() => {
    if (!authenticated) return;
    setProfileState('loading');
    void clients.profile
      .load()
      .then((value) => {
        if (!value || !value.merchant || !value.owner) {
          setProfile(null);
          setProfileState('unavailable');
          return;
        }
        setProfile(value as CurrentProfile);
        setProfileState('ready');
      })
      .catch(() => {
        setProfile(null);
        setProfileState('unavailable');
      });
  }, [authenticated, clients.profile]);

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
  const shellProps = {
    profile,
    profileState,
    activePath: hash,
    onLogout: async () => {
      try {
        await clients.auth.logout?.();
      } finally {
        endSession();
      }
    }
  };
  const walletApi: WalletApi = {
    load: async () => {
      const dashboard = await clients.dashboard.load();
      return dashboard.wallet;
    }
  };
  if (hash === '#/') return <AppShell {...shellProps} content={<Dashboard api={clients.dashboard} />} />;
  if (hash === '#/carteira')
    return <AppShell {...shellProps} content={<WalletPage api={walletApi} />} />;
  if (hash === '#/configuracoes')
    return <AppShell {...shellProps} content={<SettingsPage api={clients.profile} />} />;
  if (hash === '#/links') return <AppShell {...shellProps} content={<PaymentLinks api={clients.links} />} />;
  if (hash === '#/transactions')
    return <AppShell {...shellProps} content={<TransactionsPage api={clients.transactions} />} />;
  if (hash === '#/saques' || hash === '#/withdrawals')
    return <AppShell {...shellProps} content={<WithdrawalsPage api={clients.withdrawals} />} />;
  if (hash === '#/webhooks')
    return <AppShell {...shellProps} content={<WebhookManagement api={clients.webhooks} />} />;
  if (hash === '#/reconciliation')
    return <AppShell {...shellProps} content={<ReconciliationPage api={clients.reconciliation} />} />;
  return <AppShell {...shellProps} />;
}
