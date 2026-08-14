import { Global, Module } from '@nestjs/common';

import { DatabaseService } from './database.service.js';

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService]
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DatabaseModule {}
