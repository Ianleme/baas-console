import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import {
  createCardCheckoutClient,
  createCheckoutSessionClient,
  createPixStatusClient
} from '@baas/api-client';
import { CheckoutSession } from './checkout/checkout-session.js';
import { PayShell } from './pay-shell.js';

const root = document.querySelector('#pay-root');
if (!root) throw new Error('PAY_ROOT_MISSING');
let csrfToken = '';
const options = {
  baseUrl: '',
  csrfToken: () => csrfToken,
  onCsrfToken: (token: string) => {
    csrfToken = token;
  }
};

createRoot(root).render(
  <StrictMode>
    <PayShell
      content={
        <CheckoutSession
          api={createCheckoutSessionClient(options)}
          pixApi={createPixStatusClient(options)}
          cardApi={createCardCheckoutClient(options)}
        />
      }
    />
  </StrictMode>
);
