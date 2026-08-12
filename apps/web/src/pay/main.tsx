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

createRoot(root).render(
  <StrictMode>
    <PayShell
      content={
        <CheckoutSession
          api={createCheckoutSessionClient({ baseUrl: '' })}
          pixApi={createPixStatusClient({ baseUrl: '' })}
          cardApi={createCardCheckoutClient({ baseUrl: '' })}
        />
      }
    />
  </StrictMode>
);
