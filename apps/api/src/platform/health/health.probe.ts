import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthProbe {
  checkReadiness(): string | undefined {
    return 'SCHEMA_NOT_READY';
  }
}
