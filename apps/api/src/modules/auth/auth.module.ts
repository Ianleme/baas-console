import { Module } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TypeOrmAuthStore } from './typeorm-auth.store.js';

@Module({
  controllers: [AuthController],
  providers: [
    DatabaseService,
    TypeOrmAuthStore,
    {
      provide: AuthService,
      inject: [TypeOrmAuthStore],
      useFactory: (store: TypeOrmAuthStore) => new AuthService(store)
    }
  ],
  exports: [DatabaseService]
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- NestJS requires a decorated runtime module class.
export class AuthModule {}
