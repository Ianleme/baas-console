import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCheckoutSessions1723505000000 implements MigrationInterface {
  name = 'CreateCheckoutSessions1723505000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE checkout_sessions (
      id CHAR(36) NOT NULL, checkout_link_id CHAR(36) NOT NULL,
      token_hash VARBINARY(32) NOT NULL, csrf_token_hash VARBINARY(32) NOT NULL,
      expires_at DATETIME(6) NOT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id), UNIQUE KEY uq_checkout_sessions_token_hash (token_hash),
      KEY idx_checkout_sessions_link (checkout_link_id),
      CONSTRAINT fk_checkout_sessions_link FOREIGN KEY (checkout_link_id) REFERENCES checkout_links (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    await queryRunner.query(
      'ALTER TABLE payment_attempts ADD COLUMN pix_txid VARCHAR(191) NULL, ADD COLUMN pix_emv TEXT NULL, ADD COLUMN pix_qr_code_base64 MEDIUMTEXT NULL'
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE payment_attempts DROP COLUMN pix_qr_code_base64, DROP COLUMN pix_emv, DROP COLUMN pix_txid'
    );
    await queryRunner.query('DROP TABLE checkout_sessions');
  }
}
