import type { Provider } from '@nestjs/common';
import pino, { type Logger } from 'pino';

export const PLATFORM_LOGGER = Symbol('PLATFORM_LOGGER');

export const platformLoggerProvider: Provider<Logger> = {
  provide: PLATFORM_LOGGER,
  useFactory: () =>
    pino({
      base: null,
      level: process.env.LOG_LEVEL ?? 'info',
      timestamp: pino.stdTimeFunctions.isoTime
    })
};
