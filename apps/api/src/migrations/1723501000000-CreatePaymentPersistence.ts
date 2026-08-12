import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentPersistence1723501000000 implements MigrationInterface {
  name = 'CreatePaymentPersistence1723501000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE checkout_links (
      id CHAR(36) NOT NULL, merchant_id CHAR(36) NOT NULL, public_reference VARCHAR(100) NOT NULL,
      description VARCHAR(255) NOT NULL, amount_cents BIGINT UNSIGNED NOT NULL,
      allowed_methods ENUM('PIX', 'CARD', 'PIX_CARD') NOT NULL, max_installments TINYINT UNSIGNED NOT NULL DEFAULT 1,
      fee_snapshot_json JSON NULL, status ENUM('ACTIVE', 'CANCELLED', 'EXPIRED', 'PAID') NOT NULL DEFAULT 'ACTIVE',
      expires_at DATETIME(6) NOT NULL, public_token_hash VARBINARY(64) NOT NULL,
      public_token_ciphertext VARBINARY(4096) NOT NULL, token_closed_at DATETIME(6) NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id), UNIQUE KEY uq_checkout_links_reference (merchant_id, public_reference),
      UNIQUE KEY uq_checkout_links_public_token_hash (public_token_hash), UNIQUE KEY uq_checkout_links_id_merchant (id, merchant_id),
      CONSTRAINT fk_checkout_links_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE,
      CONSTRAINT chk_checkout_links_amount_positive CHECK (amount_cents > 0),
      CONSTRAINT chk_checkout_links_installments CHECK ((allowed_methods = 'PIX' AND max_installments = 1) OR (allowed_methods <> 'PIX' AND max_installments BETWEEN 1 AND 12))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    await queryRunner.query(`CREATE TABLE payment_attempts (
      id CHAR(36) NOT NULL, merchant_id CHAR(36) NOT NULL, checkout_link_id CHAR(36) NOT NULL,
      method ENUM('PIX', 'CARD') NOT NULL,
      status ENUM('PROCESSING', 'PENDING', 'RECONCILIATION_PENDING', 'APPROVED', 'DENIED', 'FAILED') NOT NULL,
      unresolved_checkout_link_id CHAR(36) GENERATED ALWAYS AS (CASE WHEN status IN ('PROCESSING', 'PENDING', 'RECONCILIATION_PENDING') THEN checkout_link_id ELSE NULL END) STORED,
      external_reference VARCHAR(100) NOT NULL, gateway_payment_id VARCHAR(191) NULL, gateway_tx_id VARCHAR(191) NULL,
      installments TINYINT UNSIGNED NOT NULL, fee_bps SMALLINT UNSIGNED NOT NULL,
      gross_amount_cents BIGINT UNSIGNED NOT NULL, fee_amount_cents BIGINT UNSIGNED NOT NULL, net_amount_cents BIGINT UNSIGNED NOT NULL,
      card_brand VARCHAR(32) NULL, card_last4 CHAR(4) NULL, failure_code VARCHAR(64) NULL,
      reconciliation_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0, next_reconciliation_at DATETIME(6) NULL, lease_until DATETIME(6) NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id), UNIQUE KEY uq_payment_attempts_external_reference (merchant_id, external_reference),
      UNIQUE KEY uq_payment_attempts_gateway_payment (merchant_id, gateway_payment_id), UNIQUE KEY uq_payment_attempts_gateway_transaction (merchant_id, gateway_tx_id),
      UNIQUE KEY uq_payment_attempts_id_merchant (id, merchant_id), UNIQUE KEY uq_payment_attempts_unresolved_link (merchant_id, unresolved_checkout_link_id),
      KEY idx_payment_attempts_checkout_tenant (checkout_link_id, merchant_id),
      CONSTRAINT fk_payment_attempts_checkout_tenant FOREIGN KEY (checkout_link_id, merchant_id) REFERENCES checkout_links (id, merchant_id) ON DELETE RESTRICT,
      CONSTRAINT chk_payment_attempts_fee_bps CHECK (fee_bps BETWEEN 0 AND 10000),
      CONSTRAINT chk_payment_attempts_amounts CHECK (gross_amount_cents > 0 AND gross_amount_cents = fee_amount_cents + net_amount_cents),
      CONSTRAINT chk_payment_attempts_installments CHECK ((method = 'PIX' AND installments = 1) OR (method = 'CARD' AND installments BETWEEN 1 AND 12)),
      CONSTRAINT chk_payment_attempts_card_last4 CHECK (card_last4 IS NULL OR card_last4 REGEXP '^[0-9]{4}$')
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    await queryRunner.query(`CREATE TABLE transactions (
      id CHAR(36) NOT NULL, merchant_id CHAR(36) NOT NULL, origin_type ENUM('PAYMENT', 'WITHDRAWAL') NOT NULL, origin_id CHAR(36) NOT NULL,
      external_reference VARCHAR(100) NOT NULL, gateway_transaction_id VARCHAR(191) NULL,
      type ENUM('CREDIT', 'DEBIT') NOT NULL, status ENUM('PENDING', 'APPROVED', 'DENIED', 'RECONCILIATION_PENDING', 'REVERSED') NOT NULL,
      gross_amount_cents BIGINT UNSIGNED NOT NULL, fee_amount_cents BIGINT UNSIGNED NOT NULL, net_amount_cents BIGINT UNSIGNED NOT NULL,
      occurred_at DATETIME(6) NOT NULL, projection_version INT UNSIGNED NOT NULL,
      receipt_token_hash VARBINARY(64) NULL, receipt_token_ciphertext VARBINARY(4096) NULL,
      receipt_token_expires_at DATETIME(6) NULL, receipt_token_revoked_at DATETIME(6) NULL, receipt_token_version INT UNSIGNED NOT NULL DEFAULT 0,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id), UNIQUE KEY uq_transactions_origin (merchant_id, origin_type, origin_id),
      UNIQUE KEY uq_transactions_external_reference (merchant_id, external_reference), UNIQUE KEY uq_transactions_gateway_id (merchant_id, gateway_transaction_id),
      CONSTRAINT fk_transactions_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE,
      CONSTRAINT chk_transactions_amounts CHECK (gross_amount_cents > 0 AND gross_amount_cents = fee_amount_cents + net_amount_cents)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    await queryRunner.query(`CREATE TABLE financial_events (
      id CHAR(36) NOT NULL, merchant_id CHAR(36) NOT NULL, payment_attempt_id CHAR(36) NULL, withdrawal_id CHAR(36) NULL,
      event_type VARCHAR(64) NOT NULL, previous_status VARCHAR(64) NULL, new_status VARCHAR(64) NOT NULL,
      source ENUM('GATEWAY', 'WEBHOOK', 'RECONCILIATION', 'SYSTEM') NOT NULL, occurred_at DATETIME(6) NOT NULL, metadata_json JSON NOT NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id), KEY idx_financial_events_merchant_occurred (merchant_id, occurred_at),
      KEY idx_financial_events_payment_tenant (payment_attempt_id, merchant_id),
      CONSTRAINT fk_financial_events_payment_tenant FOREIGN KEY (payment_attempt_id, merchant_id) REFERENCES payment_attempts (id, merchant_id) ON DELETE CASCADE,
      CONSTRAINT chk_financial_events_exactly_one_origin CHECK ((payment_attempt_id IS NULL) <> (withdrawal_id IS NULL))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE financial_events');
    await queryRunner.query('DROP TABLE transactions');
    await queryRunner.query('DROP TABLE payment_attempts');
    await queryRunner.query('DROP TABLE checkout_links');
  }
}
