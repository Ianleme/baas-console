import { Module } from '@nestjs/common';

import { SecurityService } from './security.service.js';

@Module({
  providers: [
    {
      provide: SecurityService,
      useFactory: () =>
        new SecurityService(
          Buffer.from(
            process.env.BLIND_INDEX_KEY_BASE64 ?? 'dGVzdC1ibGluZC1pbmRleC1rZXktMzItYnl0ZXM=',
            'base64'
          )
        )
    }
  ],
  exports: [SecurityService]
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class SecurityModule {}
