import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWalletWithdrawalPersistence1723502000000 implements MigrationInterface {
  name = 'CreateWalletWithdrawalPersistence1723502000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE wallet_snapshots (
      id CHAR(36) NOT NULL, merchant_id CHAR(36) NOT NULL,
      balance_cents BIGINT UNSIGNED NOT NULL, available_cents BIGINT UNSIGNED NULL,
      captured_at DATETIME(6) NOT NULL, source_request_id VARCHAR(191) NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id), KEY idx_wallet_snapshots_merchant_captured (merchant_id, captured_at),
      CONSTRAINT fk_wallet_snapshots_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    await queryRunner.query(`CREATE TABLE withdrawals (
      id CHAR(36) NOT NULL, merchant_id CHAR(36) NOT NULL, external_reference VARCHAR(100) NOT NULL,
      amount_cents BIGINT UNSIGNED NOT NULL,
      status ENUM('PROCESSING', 'PENDING', 'RECONCILIATION_PENDING', 'APPROVED', 'DENIED', 'MANUAL_REVIEW') NOT NULL,
      gateway_withdrawal_id VARCHAR(191) NULL, destination_type VARCHAR(32) NOT NULL,
      destination_masked VARCHAR(191) NOT NULL, destination_blind_index VARBINARY(64) NULL,
      reconciliation_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      next_reconciliation_at DATETIME(6) NULL, lease_until DATETIME(6) NULL, last_error_code VARCHAR(64) NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id), UNIQUE KEY uq_withdrawals_external_reference (merchant_id, external_reference),
      UNIQUE KEY uq_withdrawals_gateway_id (merchant_id, gateway_withdrawal_id),
      UNIQUE KEY uq_withdrawals_id_merchant (id, merchant_id),
      KEY idx_withdrawals_reconciliation (status, next_reconciliation_at, lease_until),
      CONSTRAINT fk_withdrawals_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE,
      CONSTRAINT chk_withdrawals_amount_positive CHECK (amount_cents > 0)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    await queryRunner.query(
      'ALTER TABLE financial_events ADD KEY idx_financial_events_withdrawal_tenant (withdrawal_id, merchant_id), ADD CONSTRAINT fk_financial_events_withdrawal_tenant FOREIGN KEY (withdrawal_id, merchant_id) REFERENCES withdrawals (id, merchant_id) ON DELETE CASCADE'
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE financial_events DROP FOREIGN KEY fk_financial_events_withdrawal_tenant, DROP INDEX idx_financial_events_withdrawal_tenant'
    );
    await queryRunner.query('DROP TABLE withdrawals');
    await queryRunner.query('DROP TABLE wallet_snapshots');
  }
}
