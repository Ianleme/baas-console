import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAsyncPersistence1723503000000 implements MigrationInterface {
  name = 'CreateAsyncPersistence1723503000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE webhook_endpoints (
      id CHAR(36) NOT NULL, merchant_id CHAR(36) NOT NULL, public_endpoint_id CHAR(32) NOT NULL,
      event_type ENUM('PAYMENT_PIX', 'PAYMENT_CARD', 'WITHDRAWAL') NOT NULL,
      gateway_webhook_id VARCHAR(191) NULL, secret_ciphertext VARBINARY(4096) NOT NULL,
      status ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE', configured_at DATETIME(6) NOT NULL,
      last_received_at DATETIME(6) NULL, PRIMARY KEY (id),
      UNIQUE KEY uq_webhook_endpoints_merchant_event (merchant_id, event_type),
      UNIQUE KEY uq_webhook_endpoints_public_id (public_endpoint_id),
      UNIQUE KEY uq_webhook_endpoints_gateway_id (merchant_id, gateway_webhook_id),
      UNIQUE KEY uq_webhook_endpoints_id_merchant (id, merchant_id),
      CONSTRAINT fk_webhook_endpoints_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    await queryRunner.query(`CREATE TABLE webhook_events (
      id CHAR(36) NOT NULL, merchant_id CHAR(36) NOT NULL, webhook_endpoint_id CHAR(36) NOT NULL,
      dedupe_key VARCHAR(191) NOT NULL, raw_body_ciphertext LONGBLOB NOT NULL, raw_body_hash VARBINARY(64) NOT NULL,
      signature_metadata JSON NOT NULL,
      status ENUM('RECEIVED', 'PROCESSING', 'RETRY_SCHEDULED', 'PROCESSED', 'UNPROCESSABLE', 'DEAD_LETTER') NOT NULL,
      attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0, next_attempt_at DATETIME(6) NULL, lease_until DATETIME(6) NULL,
      last_error_code VARCHAR(64) NULL, received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      processed_at DATETIME(6) NULL, purge_after DATETIME(6) NOT NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
      UNIQUE KEY uq_webhook_events_dedupe (webhook_endpoint_id, dedupe_key),
      KEY idx_webhook_events_endpoint_tenant (webhook_endpoint_id, merchant_id),
      KEY idx_webhook_events_lease (status, next_attempt_at, lease_until), KEY idx_webhook_events_purge (purge_after),
      CONSTRAINT fk_webhook_events_endpoint_tenant FOREIGN KEY (webhook_endpoint_id, merchant_id) REFERENCES webhook_endpoints (id, merchant_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    await queryRunner.query(`CREATE TABLE email_deliveries (
      id CHAR(36) NOT NULL, merchant_id CHAR(36) NOT NULL, kind VARCHAR(64) NOT NULL,
      idempotency_key VARCHAR(191) NOT NULL, recipient_ciphertext VARBINARY(4096) NULL,
      recipient_masked VARCHAR(191) NOT NULL, template_version SMALLINT UNSIGNED NOT NULL,
      payload_ciphertext LONGBLOB NULL, status ENUM('QUEUED', 'SENDING', 'SENT', 'FAILED', 'DEAD_LETTER') NOT NULL,
      attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0, next_attempt_at DATETIME(6) NULL, lease_until DATETIME(6) NULL,
      provider_message_id VARCHAR(191) NULL, last_error_code VARCHAR(64) NULL, purge_after DATETIME(6) NOT NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
      UNIQUE KEY uq_email_deliveries_idempotency (merchant_id, idempotency_key),
      KEY idx_email_deliveries_lease (status, next_attempt_at, lease_until), KEY idx_email_deliveries_purge (purge_after),
      CONSTRAINT fk_email_deliveries_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    await queryRunner.query(`CREATE TABLE audit_events (
      id CHAR(36) NOT NULL, merchant_id CHAR(36) NOT NULL, actor_user_id CHAR(36) NULL,
      actor_type ENUM('USER', 'SYSTEM', 'DEMO') NOT NULL, action VARCHAR(64) NOT NULL,
      target_type VARCHAR(64) NOT NULL, target_public_id VARCHAR(191) NULL, request_id CHAR(36) NOT NULL,
      metadata_json JSON NOT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
      KEY idx_audit_events_merchant_created (merchant_id, created_at),
      KEY idx_audit_events_actor_tenant (actor_user_id, merchant_id),
      CONSTRAINT fk_audit_events_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_audit_events_actor_tenant FOREIGN KEY (actor_user_id, merchant_id) REFERENCES users (id, merchant_id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE audit_events');
    await queryRunner.query('DROP TABLE email_deliveries');
    await queryRunner.query('DROP TABLE webhook_events');
    await queryRunner.query('DROP TABLE webhook_endpoints');
  }
}
