import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EmailOutboxService } from './email-outbox.service.js';
import { DatabaseService } from '../../database/database.service.js';

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(
    private readonly outbox: EmailOutboxService,
    private readonly database: DatabaseService
  ) {}
  onModuleInit(): void {
    void this.process();
    this.timer = setInterval(() => void this.process(), 5_000);
    this.timer.unref();
  }
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
  private async process(): Promise<void> {
    if (!this.database.isConnected()) return;
    if (this.running) return;
    this.running = true;
    try {
      await this.outbox.processOutbox();
    } catch (error) {
      this.logger.error('Email outbox worker failed', error);
    } finally {
      this.running = false;
    }
  }
}
