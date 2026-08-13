import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { WebhookProcessingService } from './webhook-processing.service.js';
import { DatabaseService } from '../../../database/database.service.js';
import { Logger } from '@nestjs/common';

@Injectable()
export class WebhookWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private readonly logger = new Logger(WebhookWorker.name);
  constructor(
    private readonly processing: WebhookProcessingService,
    private readonly database: DatabaseService
  ) {}
  onModuleInit(): void {
    if (process.env.JEST_WORKER_ID || process.env.WEBHOOK_WORKER_ENABLED === 'false') return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 5_000);
    this.timer.unref();
  }
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
  private async tick(): Promise<void> {
    if (!this.database.isConnected()) return;
    if (this.running) return;
    this.running = true;
    try {
      await this.processing.run();
    } catch (error) {
      this.logger.error('Webhook worker failed', error);
    } finally {
      this.running = false;
    }
  }
}
