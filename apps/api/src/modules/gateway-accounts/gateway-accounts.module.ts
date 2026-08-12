import { Module } from '@nestjs/common';
export const GATEWAY_IDENTITY = Symbol('GATEWAY_IDENTITY');
@Module({})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- NestJS runtime module.
export class GatewayAccountsModule {}
