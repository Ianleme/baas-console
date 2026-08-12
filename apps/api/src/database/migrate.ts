import 'reflect-metadata';

import { createApplicationDataSource } from './data-source.js';

const migrationLockName = 'baas_console_schema_migrations';
const dataSource = createApplicationDataSource();

try {
  await dataSource.initialize();
  const rows = await dataSource.query<{ acquired: number }[]>(
    'SELECT GET_LOCK(?, 60) AS acquired',
    [migrationLockName]
  );
  if (Number(rows[0]?.acquired) !== 1) throw new Error('DATABASE_MIGRATION_LOCK_TIMEOUT');
  try {
    await dataSource.runMigrations({ transaction: 'all' });
  } finally {
    await dataSource.query('SELECT RELEASE_LOCK(?)', [migrationLockName]);
  }
} finally {
  if (dataSource.isInitialized) await dataSource.destroy();
}
