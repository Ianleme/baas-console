import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  OutboxInspectionPage,
  type EmailDeliveriesApi,
  type EmailDeliveriesData
} from './outbox-inspection-page.js';

describe('OutboxInspectionPage Component', () => {
  const sampleDeliveries: EmailDeliveriesData = {
    items: [
      {
        id: 'del-1',
        kind: 'CHECKOUT_LINK',
        idempotencyKey: 'key-1',
        recipientMasked: 'c***@loja.com',
        status: 'SENT',
        attempts: 1,
        nextAttemptAt: null,
        lastErrorCode: null,
        createdAt: '2026-08-12T10:00:00.000Z'
      },
      {
        id: 'del-2',
        kind: 'PAYMENT_RECEIPT',
        idempotencyKey: 'key-2',
        recipientMasked: 'p***@loja.com',
        status: 'DEAD_LETTER',
        attempts: 5,
        nextAttemptAt: null,
        lastErrorCode: 'SMTP_CONNECTION_REFUSED',
        createdAt: '2026-08-12T11:00:00.000Z'
      }
    ],
    total: 2
  };

  it('renders outbox inspection header and deliveries table', async () => {
    const listMock = vi.fn().mockResolvedValue(sampleDeliveries);
    const retryMock = vi.fn().mockResolvedValue({ status: 'QUEUED' });
    const api: EmailDeliveriesApi = {
      listDeliveries: listMock,
      retryDelivery: retryMock
    };

    render(<OutboxInspectionPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText(/Outbox & Inspeção de E-mails/i)).toBeDefined();
    });

    expect(screen.getByText('CHECKOUT_LINK')).toBeDefined();
    expect(screen.getByText('PAYMENT_RECEIPT')).toBeDefined();
    expect(screen.getByText('SMTP_CONNECTION_REFUSED')).toBeDefined();
    expect(screen.getByText('Dead Letter (DLQ)')).toBeDefined();
  });

  it('displays re-enfileirar action button for dead-letter deliveries', async () => {
    const listMock = vi.fn().mockResolvedValue(sampleDeliveries);
    const retryMock = vi.fn().mockResolvedValue({ status: 'QUEUED' });
    const api: EmailDeliveriesApi = {
      listDeliveries: listMock,
      retryDelivery: retryMock
    };

    render(<OutboxInspectionPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText('Re-enfileirar')).toBeDefined();
    });
  });

  it('calls retryDelivery API when Re-enfileirar button is clicked', async () => {
    const listMock = vi.fn().mockResolvedValue(sampleDeliveries);
    const retryMock = vi.fn().mockResolvedValue({ status: 'QUEUED' });
    const api: EmailDeliveriesApi = {
      listDeliveries: listMock,
      retryDelivery: retryMock
    };

    render(<OutboxInspectionPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText('Re-enfileirar')).toBeDefined();
    });

    const retryButton = screen.getByText('Re-enfileirar');
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(retryMock).toHaveBeenCalledWith('del-2');
    });
  });
});
