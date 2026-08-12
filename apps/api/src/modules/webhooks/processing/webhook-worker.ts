import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { WebhookProcessingService } from './webhook-processing.service.js';

@Injectable()
export class WebhookWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  constructor(private readonly processing: WebhookProcessingService) {}
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
    if (this.running) return;
    this.running = true;
    try {
      await this.processing.run();
    } finally {
      this.running = false;
    }
  }
}
