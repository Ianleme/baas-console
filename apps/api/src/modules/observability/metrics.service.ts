import { Injectable } from '@nestjs/common';

export type MetricLabels = Record<'method' | 'route' | 'status', string>;

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();

  increment(name: string, labels: MetricLabels): void {
    const key = `${name}|${labels.method}|${labels.route}|${labels.status}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  snapshot(): Map<string, number> {
    return new Map(this.counters);
  }
}
