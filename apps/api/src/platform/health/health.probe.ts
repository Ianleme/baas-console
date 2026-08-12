import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';

@Injectable()
export class HealthProbe {
  constructor(private readonly database: DatabaseService) {}

  async checkReadiness(): Promise<string | undefined> {
    return (await this.database.checkSchemaReadiness()) ? undefined : 'SCHEMA_NOT_READY';
  }
}
