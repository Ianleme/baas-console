import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { GatewayFee } from '../../integrations/lera-box/fees/lera-box-fees.client.js';
import type { AllowedPaymentMethods, CheckoutLinkStatus } from './entities/checkout-link.entity.js';

const MAX_UNSIGNED_BIGINT = 18_446_744_073_709_551_615n;
const UNRESOLVED = new Set(['PROCESSING', 'PENDING', 'RECONCILIATION_PENDING', 'MANUAL_REVIEW']);

export interface CheckoutLinkRecord {
  id: string;
  merchantId: string;
  publicReference: string;
  description: string;
  amountCents: string;
  allowedMethods: AllowedPaymentMethods;
  maxInstallments: number;
  feeSnapshot: GatewayFee[];
  status: CheckoutLinkStatus;
  expiresAt: Date;
  publicTokenHash: Buffer;
  publicTokenCiphertext: Buffer;
  tokenClosedAt: Date | null;
  createdAt: Date;
}

export interface CheckoutLinkStore {
  create(link: CheckoutLinkRecord): Promise<void>;
  list(merchantId: string, query: CheckoutLinkListQuery): Promise<CheckoutLinkListResult>;
  expireActiveBefore(merchantId: string, expiresAt: Date): Promise<void>;
  find(merchantId: string, id: string): Promise<CheckoutLinkRecord | undefined>;
  setStatus(
    merchantId: string,
    id: string,
    expected: CheckoutLinkStatus,
    next: CheckoutLinkStatus,
    tokenClosedAt: Date | null
  ): Promise<boolean>;
  replacePublicTokenIfClosed(
    merchantId: string,
    id: string,
    publicTokenHash: Buffer,
    publicTokenCiphertext: Buffer
  ): Promise<boolean>;
  hasUnresolvedAttempt(merchantId: string, checkoutLinkId: string): Promise<boolean>;
}

export interface CheckoutLinkListQuery {
  search?: string;
  status?: CheckoutLinkStatus;
  method?: AllowedPaymentMethods;
  createdFrom?: Date;
  createdTo?: Date;
  limit: number;
  offset: number;
}

export interface CheckoutLinkListSummary {
  totalCount: number;
  activeCount: number;
  paidCount: number;
  paidAmountCents: string;
}

export interface CheckoutLinkListResult {
  items: CheckoutLinkRecord[];
  total: number;
  summary: CheckoutLinkListSummary;
}

export interface CheckoutFeeProvider {
  list(): Promise<GatewayFee[]>;
}

export interface CheckoutTokenProtector {
  hash(token: string): Buffer;
  seal(token: string): Buffer;
  unseal(ciphertext: Buffer): string;
}

export interface CreateCheckoutLinkInput {
  publicReference: string;
  description: string;
  amountCents: string;
  allowedMethods: AllowedPaymentMethods;
  maxInstallments: number;
  expiresAt: Date;
}

export interface CreatedCheckoutLink {
  link: CheckoutLinkRecord;
  publicToken: string;
}

export interface CheckoutLinkDetail {
  link: CheckoutLinkRecord;
  publicToken: string;
}

export class CheckoutLinkError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CheckoutLinkError';
  }
}

export class CheckoutLinkService {
  constructor(
    private readonly store: CheckoutLinkStore,
    private readonly fees: CheckoutFeeProvider,
    private readonly tokenProtector: CheckoutTokenProtector,
    private readonly now: () => Date = () => new Date(),
    private readonly id: () => string = randomUUID,
    private readonly token: () => string = () => randomBytes(32).toString('base64url')
  ) {}

  async create(merchantId: string, input: CreateCheckoutLinkInput): Promise<CreatedCheckoutLink> {
    const at = this.now();
    const normalized = validateCreate(input, at);
    const publicToken = this.token();
    if (Buffer.from(publicToken, 'base64url').byteLength < 32)
      throw new CheckoutLinkError('TOKEN_ENTROPY_INVALID');
    const feeSnapshot = normalized.allowedMethods === 'PIX' ? [] : await this.fees.list();
    const applicableFees = feeSnapshot.filter(
      (fee) => fee.installments <= normalized.maxInstallments
    );
    if (normalized.allowedMethods !== 'PIX' && applicableFees.length === 0)
      throw new CheckoutLinkError('FEE_SNAPSHOT_UNAVAILABLE');
    const link: CheckoutLinkRecord = {
      id: this.id(),
      merchantId,
      ...normalized,
      feeSnapshot: applicableFees,
      status: 'ACTIVE',
      publicTokenHash: this.tokenProtector.hash(publicToken),
      publicTokenCiphertext: this.tokenProtector.seal(publicToken),
      tokenClosedAt: null,
      createdAt: at
    };
    await this.store.create(link);
    return { link, publicToken };
  }

  async list(merchantId: string, query: CheckoutLinkListQuery): Promise<CheckoutLinkListResult> {
    const normalized = validateListQuery(query);
    await this.store.expireActiveBefore(merchantId, this.now());
    return this.store.list(merchantId, normalized);
  }

  async detail(merchantId: string, id: string): Promise<CheckoutLinkRecord> {
    const link = await this.required(merchantId, id);
    await this.expireIfNeeded(link);
    return link;
  }

  async share(merchantId: string, id: string): Promise<CheckoutLinkDetail> {
    let link = await this.detail(merchantId, id);
    if (link.status !== 'ACTIVE') throw new CheckoutLinkError('LINK_NOT_ACTIVE');
    if (link.tokenClosedAt !== null) {
      const publicToken = this.token();
      if (Buffer.from(publicToken, 'base64url').byteLength < 32)
        throw new CheckoutLinkError('TOKEN_ENTROPY_INVALID');
      const publicTokenHash = this.tokenProtector.hash(publicToken);
      const publicTokenCiphertext = this.tokenProtector.seal(publicToken);
      const replaced = await this.store.replacePublicTokenIfClosed(
        merchantId,
        id,
        publicTokenHash,
        publicTokenCiphertext
      );
      if (replaced) {
        link.publicTokenHash = publicTokenHash;
        link.publicTokenCiphertext = publicTokenCiphertext;
        link.tokenClosedAt = null;
        return { link, publicToken };
      }
      link = await this.detail(merchantId, id);
      if (link.status !== 'ACTIVE' || link.tokenClosedAt !== null)
        throw new CheckoutLinkError('LINK_STATE_CONFLICT');
    }
    return {
      link,
      publicToken: this.tokenProtector.unseal(link.publicTokenCiphertext)
    };
  }

  async cancel(merchantId: string, id: string): Promise<CheckoutLinkRecord> {
    const link = await this.required(merchantId, id);
    await this.expireIfNeeded(link);
    if (link.status !== 'ACTIVE') throw new CheckoutLinkError('LINK_NOT_ACTIVE');
    if (await this.store.hasUnresolvedAttempt(merchantId, id))
      throw new CheckoutLinkError('PAYMENT_ATTEMPT_UNRESOLVED');
    const at = this.now();
    if (!(await this.store.setStatus(merchantId, id, 'ACTIVE', 'CANCELLED', at)))
      throw new CheckoutLinkError('LINK_STATE_CONFLICT');
    link.status = 'CANCELLED';
    link.tokenClosedAt = at;
    return link;
  }

  async assertCanStartAttempt(merchantId: string, id: string): Promise<CheckoutLinkRecord> {
    const link = await this.detail(merchantId, id);
    if (link.status !== 'ACTIVE') throw new CheckoutLinkError('LINK_NOT_ACTIVE');
    if (await this.store.hasUnresolvedAttempt(merchantId, id))
      throw new CheckoutLinkError('PAYMENT_ATTEMPT_UNRESOLVED');
    return link;
  }

  async applyAttemptOutcome(
    merchantId: string,
    id: string,
    outcome: 'APPROVED' | 'DENIED'
  ): Promise<CheckoutLinkRecord> {
    const link = await this.required(merchantId, id);
    if (outcome === 'DENIED') return link;
    if (link.status === 'PAID') return link;
    const at = this.now();
    if (!(await this.store.setStatus(merchantId, id, link.status, 'PAID', at)))
      throw new CheckoutLinkError('LINK_STATE_CONFLICT');
    link.status = 'PAID';
    link.tokenClosedAt = at;
    return link;
  }

  private async required(merchantId: string, id: string): Promise<CheckoutLinkRecord> {
    const link = await this.store.find(merchantId, id);
    if (!link) throw new CheckoutLinkError('LINK_NOT_FOUND');
    return link;
  }

  private async expireIfNeeded(link: CheckoutLinkRecord): Promise<void> {
    const at = this.now();
    if (link.status !== 'ACTIVE' || link.expiresAt > at) return;
    if (await this.store.setStatus(link.merchantId, link.id, 'ACTIVE', 'EXPIRED', at)) {
      link.status = 'EXPIRED';
      link.tokenClosedAt = at;
    }
  }
}

export function createSha256TokenProtector(
  seal: (token: string) => Buffer,
  unseal: (ciphertext: Buffer) => string = () => {
    throw new CheckoutLinkError('TOKEN_RECOVERY_UNAVAILABLE');
  }
): CheckoutTokenProtector {
  return {
    hash: (token) => createHash('sha256').update(token, 'utf8').digest(),
    seal,
    unseal
  };
}

export function isUnresolvedAttemptStatus(status: string): boolean {
  return UNRESOLVED.has(status);
}

function validateCreate(input: CreateCheckoutLinkInput, now: Date): CreateCheckoutLinkInput {
  const description = input.description.trim();
  const publicReference = input.publicReference.trim();
  if (description.length === 0 || description.length > 255)
    throw new CheckoutLinkError('DESCRIPTION_INVALID');
  if (publicReference.length === 0 || publicReference.length > 100)
    throw new CheckoutLinkError('REFERENCE_INVALID');
  if (!/^\d+$/u.test(input.amountCents)) throw new CheckoutLinkError('AMOUNT_INVALID');
  const amount = BigInt(input.amountCents);
  if (amount <= 0n || amount > MAX_UNSIGNED_BIGINT) throw new CheckoutLinkError('AMOUNT_INVALID');
  if (!['PIX', 'CARD', 'PIX_CARD'].includes(input.allowedMethods))
    throw new CheckoutLinkError('METHOD_INVALID');
  const installmentsValid =
    input.allowedMethods === 'PIX'
      ? input.maxInstallments === 1
      : Number.isInteger(input.maxInstallments) &&
        input.maxInstallments >= 1 &&
        input.maxInstallments <= 21;
  if (!installmentsValid) throw new CheckoutLinkError('INSTALLMENTS_INVALID');
  if (!(input.expiresAt instanceof Date) || Number.isNaN(input.expiresAt.valueOf()))
    throw new CheckoutLinkError('EXPIRY_INVALID');
  if (input.expiresAt <= now) throw new CheckoutLinkError('EXPIRY_INVALID');
  return { ...input, publicReference, description };
}

function validateListQuery(query: CheckoutLinkListQuery): CheckoutLinkListQuery {
  const search = query.search?.trim();
  if (search && search.length > 255) throw new CheckoutLinkError('LIST_FILTER_INVALID');
  if (
    query.status !== undefined &&
    !['ACTIVE', 'PAID', 'EXPIRED', 'CANCELLED'].includes(query.status)
  )
    throw new CheckoutLinkError('LIST_FILTER_INVALID');
  if (query.method !== undefined && !['PIX', 'CARD', 'PIX_CARD'].includes(query.method))
    throw new CheckoutLinkError('LIST_FILTER_INVALID');
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100)
    throw new CheckoutLinkError('LIST_FILTER_INVALID');
  if (!Number.isInteger(query.offset) || query.offset < 0)
    throw new CheckoutLinkError('LIST_FILTER_INVALID');
  if (query.createdFrom && Number.isNaN(query.createdFrom.valueOf()))
    throw new CheckoutLinkError('LIST_FILTER_INVALID');
  if (query.createdTo && Number.isNaN(query.createdTo.valueOf()))
    throw new CheckoutLinkError('LIST_FILTER_INVALID');
  if (query.createdFrom && query.createdTo && query.createdFrom > query.createdTo)
    throw new CheckoutLinkError('LIST_FILTER_INVALID');
  const normalized = { ...query };
  if (search) normalized.search = search;
  else delete normalized.search;
  return normalized;
}
