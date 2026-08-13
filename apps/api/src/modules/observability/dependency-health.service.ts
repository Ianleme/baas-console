import { Injectable } from '@nestjs/common';

export interface DependencyHealth {
  gateway: 'up' | 'down' | 'unknown';
  smtp: 'up' | 'down' | 'unknown';
  chromium: 'up' | 'down' | 'unknown';
}

@Injectable()
export class DependencyHealthService {
  private current: DependencyHealth = { gateway: 'unknown', smtp: 'unknown', chromium: 'unknown' };

  setHealth(health: DependencyHealth): void {
    this.current = { ...health };
  }

  getHealth(): DependencyHealth {
    return { ...this.current };
  }
}
