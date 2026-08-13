import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { DatabaseService } from '../../database/database.service.js';
import { ProblemException } from '../../platform/errors/problem.exception.js';
import type { GatewayCredentialService } from '../gateway-accounts/gateway-credential.service.js';
import { TransactionEntity } from '../transactions/entities/transaction.entity.js';
import type { WalletService } from '../wallet/wallet.service.js';
import type { WithdrawalGatewayAdapter } from './adapters/lera-box-withdrawal.adapter.js';
import type { CreateWithdrawalDto } from './dto/create-withdrawal.dto.js';
import { WithdrawalEntity, type WithdrawalStatus } from './entities/withdrawal.entity.js';

export interface WithdrawalView {
  id: string;
  externalReference: string;
  amountCents: string;
  status: WithdrawalStatus;
  destinationType: string;
  destinationMasked: string;
  gatewayWithdrawalId: string | null;
  createdAt: string;
}

export class WithdrawalsService {
  constructor(
    private readonly dbOrDataSource: DatabaseService | DataSource,
    private readonly walletService: WalletService,
    private readonly gateway: WithdrawalGatewayAdapter,
    private readonly credentials: GatewayCredentialService
  ) {}

  private get dataSource(): DataSource {
    return 'getDataSource' in this.dbOrDataSource
      ? this.dbOrDataSource.getDataSource()
      : this.dbOrDataSource;
  }

  async requestWithdrawal(merchantId: string, dto: CreateWithdrawalDto): Promise<WithdrawalView> {
    const requestedCents = BigInt(dto.amountCents);
    if (requestedCents <= 0n) {
      throw new ProblemException(
        'INVALID_AMOUNT',
        400,
        'O valor do saque deve ser maior que zero.'
      );
    }

    // 1. Check available balance
    const wallet = await this.walletService.current(merchantId);
    const balanceCents = BigInt(wallet.balanceCents);
    if (balanceCents < requestedCents) {
      throw new ProblemException(
        'INSUFFICIENT_FUNDS',
        400,
        'Saldo insuficiente para realizar a solicitação de saque.'
      );
    }

    const reference =
      typeof dto.externalReference === 'string' && dto.externalReference.trim().length > 0
        ? dto.externalReference.trim()
        : `WTH-${String(Date.now())}-${randomUUID().slice(0, 8)}`;

    // 2. Check idempotency
    const existing = await this.dataSource.getRepository(WithdrawalEntity).findOne({
      where: { merchantId, externalReference: reference }
    });
    if (existing) {
      return this.mapView(existing);
    }

    // Mask destination Pix key
    const maskedPix = maskPixKey(dto.pixKey, dto.pixKeyType);

    // 3. Create Withdrawal record
    const withdrawalId = randomUUID();
    const now = new Date();

    const withdrawal = this.dataSource.getRepository(WithdrawalEntity).create({
      id: withdrawalId,
      merchantId,
      externalReference: reference,
      amountCents: dto.amountCents,
      status: 'PROCESSING',
      destinationType: `PIX_${dto.pixKeyType}`,
      destinationMasked: maskedPix,
      gatewayWithdrawalId: null,
      reconciliationAttempts: 0,
      createdAt: now,
      updatedAt: now
    });

    // 4. Create Transaction record (Debit)
    const transactionId = randomUUID();
    const transaction = this.dataSource.getRepository(TransactionEntity).create({
      id: transactionId,
      merchantId,
      originType: 'WITHDRAWAL',
      originId: withdrawalId,
      externalReference: reference,
      gatewayTransactionId: null,
      type: 'DEBIT',
      status: 'PENDING',
      grossAmountCents: dto.amountCents,
      feeAmountCents: '0',
      netAmountCents: dto.amountCents,
      occurredAt: now,
      projectionVersion: 1
    });

    await this.dataSource.transaction(async (manager) => {
      await manager.save(withdrawal);
      await manager.save(transaction);
    });

    // 5. Execute gateway transfer if credentials exist
    try {
      const auth = await this.credentials.activeAuth(merchantId);
      const transferResult = await this.gateway.executeTransfer(auth.accessToken, {
        amountCents: dto.amountCents,
        externalReference: reference,
        pixKey: dto.pixKey,
        pixKeyType: dto.pixKeyType,
        document: auth.document
      });

      withdrawal.status = transferResult.status;
      withdrawal.gatewayWithdrawalId = transferResult.id;
      transaction.status = transferResult.status;
      transaction.gatewayTransactionId = transferResult.id;

      await this.dataSource.transaction(async (manager) => {
        await manager.save(withdrawal);
        await manager.save(transaction);
      });
    } catch (err: unknown) {
      const errObj = (err ?? {}) as { message?: string };
      withdrawal.status = 'DENIED';
      withdrawal.lastErrorCode = errObj.message ?? 'GATEWAY_TRANSFER_FAILED';
      transaction.status = 'DENIED';

      await this.dataSource.transaction(async (manager) => {
        await manager.save(withdrawal);
        await manager.save(transaction);
      });
    }

    return this.mapView(withdrawal);
  }

  async list(merchantId: string): Promise<WithdrawalView[]> {
    const records = await this.dataSource.getRepository(WithdrawalEntity).find({
      where: { merchantId },
      order: { createdAt: 'DESC' }
    });
    return records.map((r) => this.mapView(r));
  }

  private mapView(entity: WithdrawalEntity): WithdrawalView {
    return {
      id: entity.id,
      externalReference: entity.externalReference,
      amountCents: entity.amountCents,
      status: entity.status,
      destinationType: entity.destinationType,
      destinationMasked: entity.destinationMasked,
      gatewayWithdrawalId: entity.gatewayWithdrawalId,
      createdAt: entity.createdAt.toISOString()
    };
  }
}

function maskPixKey(key: string, type: string): string {
  if (type === 'CPF' && key.length >= 11) {
    return `***.${key.slice(3, 6)}.${key.slice(6, 9)}-**`;
  }
  if (type === 'CNPJ' && key.length >= 14) {
    return `**.${key.slice(2, 5)}.${key.slice(5, 8)}/****-**`;
  }
  if (type === 'EMAIL' && key.includes('@')) {
    const parts = key.split('@');
    const user = parts[0] ?? '';
    const domain = parts[1] ?? 'domain.com';
    const userPrefix = user.length > 0 ? user.slice(0, 2) : '**';
    return `${userPrefix}***@${domain}`;
  }
  if (key.length > 4) {
    return `***${key.slice(-4)}`;
  }
  return '***';
}
