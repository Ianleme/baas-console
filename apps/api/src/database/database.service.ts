import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { createApplicationDataSource } from './data-source.js';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private dataSource: DataSource | undefined;

  async connect(maxRetries = 10, initialDelayMs = 1000): Promise<void> {
    if (this.dataSource?.isInitialized) return;
    const dataSource = createApplicationDataSource();
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        await dataSource.initialize();
        this.dataSource = dataSource;
        return;
      } catch (err) {
        attempt++;
        if (attempt >= maxRetries) throw err;
        await new Promise((resolve) => setTimeout(resolve, initialDelayMs * Math.min(attempt, 5)));
      }
    }
  }

  getDataSource(): DataSource {
    if (!this.dataSource?.isInitialized) throw new Error('DATABASE_NOT_CONNECTED');
    return this.dataSource;
  }

  async checkSchemaReadiness(): Promise<boolean> {
    if (!this.dataSource?.isInitialized) return false;
    try {
      await this.dataSource.query('SELECT 1');
      return !(await this.dataSource.showMigrations());
    } catch {
      return false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.dataSource?.isInitialized) await this.dataSource.destroy();
  }
}
