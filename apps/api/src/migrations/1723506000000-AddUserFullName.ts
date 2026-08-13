import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserFullName1723506000000 implements MigrationInterface {
  name = 'AddUserFullName1723506000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE users ADD COLUMN full_name VARCHAR(255) NULL AFTER email'
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE users DROP COLUMN full_name');
  }
}
