import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowGatewayInstallments1723504000000 implements MigrationInterface {
  name = 'AllowGatewayInstallments1723504000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE checkout_links DROP CHECK chk_checkout_links_installments'
    );
    await queryRunner.query(
      "ALTER TABLE checkout_links ADD CONSTRAINT chk_checkout_links_installments CHECK ((allowed_methods = 'PIX' AND max_installments = 1) OR (allowed_methods <> 'PIX' AND max_installments BETWEEN 1 AND 21))"
    );
    await queryRunner.query(
      'ALTER TABLE payment_attempts DROP CHECK chk_payment_attempts_installments'
    );
    await queryRunner.query(
      "ALTER TABLE payment_attempts ADD CONSTRAINT chk_payment_attempts_installments CHECK ((method = 'PIX' AND installments = 1) OR (method = 'CARD' AND installments BETWEEN 1 AND 21))"
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE checkout_links DROP CHECK chk_checkout_links_installments'
    );
    await queryRunner.query(
      "ALTER TABLE checkout_links ADD CONSTRAINT chk_checkout_links_installments CHECK ((allowed_methods = 'PIX' AND max_installments = 1) OR (allowed_methods <> 'PIX' AND max_installments BETWEEN 1 AND 12))"
    );
    await queryRunner.query(
      'ALTER TABLE payment_attempts DROP CHECK chk_payment_attempts_installments'
    );
    await queryRunner.query(
      "ALTER TABLE payment_attempts ADD CONSTRAINT chk_payment_attempts_installments CHECK ((method = 'PIX' AND installments = 1) OR (method = 'CARD' AND installments BETWEEN 1 AND 12))"
    );
  }
}
