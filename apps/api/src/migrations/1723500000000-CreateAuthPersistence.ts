import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthPersistence1723500000000 implements MigrationInterface {
  name = 'CreateAuthPersistence1723500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE merchants (
        id CHAR(36) NOT NULL,
        legal_name VARCHAR(255) NOT NULL,
        display_name VARCHAR(120) NOT NULL,
        status ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
        demo_mode BOOLEAN NOT NULL DEFAULT FALSE,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    await queryRunner.query(`
      CREATE TABLE users (
        id CHAR(36) NOT NULL,
        merchant_id CHAR(36) NOT NULL,
        email VARCHAR(254) NOT NULL,
        email_normalized VARCHAR(254) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        status ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
        last_login_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_email_normalized (email_normalized),
        UNIQUE KEY uq_users_owner_merchant (merchant_id),
        UNIQUE KEY uq_users_id_merchant (id, merchant_id),
        CONSTRAINT fk_users_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    await queryRunner.query(`
      CREATE TABLE auth_sessions (
        id CHAR(36) NOT NULL,
        merchant_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        family_id CHAR(36) NOT NULL,
        refresh_token_hash VARBINARY(64) NOT NULL,
        expires_at DATETIME(6) NOT NULL,
        rotated_at DATETIME(6) NULL,
        revoked_at DATETIME(6) NULL,
        reuse_detected_at DATETIME(6) NULL,
        user_agent_hash VARBINARY(64) NULL,
        ip_address_hash VARBINARY(64) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_auth_sessions_refresh_token_hash (refresh_token_hash),
        KEY idx_auth_sessions_family_id (family_id),
        KEY idx_auth_sessions_expires_at (expires_at),
        CONSTRAINT fk_auth_sessions_user_tenant FOREIGN KEY (user_id, merchant_id)
          REFERENCES users (id, merchant_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    await queryRunner.query(`
      CREATE TABLE gateway_accounts (
        id CHAR(36) NOT NULL,
        merchant_id CHAR(36) NOT NULL,
        status ENUM('REGISTRATION_PENDING', 'GATEWAY_REGISTRATION_FAILED', 'GATEWAY_REGISTRATION_UNKNOWN', 'AWAITING_CREDENTIALS', 'ACTIVE', 'ERROR', 'DISCONNECTED') NOT NULL DEFAULT 'AWAITING_CREDENTIALS',
        expected_document VARCHAR(32) NULL,
        expected_person_type ENUM('PF', 'PJ') NULL,
        gateway_user_id VARCHAR(191) NULL,
        codigo_cliente_ciphertext VARBINARY(4096) NULL,
        chave_loja_ciphertext VARBINARY(4096) NULL,
        access_token_ciphertext VARBINARY(4096) NULL,
        token_expires_at DATETIME(6) NULL,
        last_connected_at DATETIME(6) NULL,
        last_error_code VARCHAR(64) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_gateway_accounts_merchant (merchant_id),
        CONSTRAINT fk_gateway_accounts_merchant FOREIGN KEY (merchant_id)
          REFERENCES merchants (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE gateway_accounts');
    await queryRunner.query('DROP TABLE auth_sessions');
    await queryRunner.query('DROP TABLE users');
    await queryRunner.query('DROP TABLE merchants');
  }
}
