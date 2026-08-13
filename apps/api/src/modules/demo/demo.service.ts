import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  DEMO_SESSION_TTL_MS,
  DEMO_TENANT_ID,
  DEMO_USER_ID,
  demoEnabled,
  demoSecret
} from './demo.constants.js';
import { ProblemException } from '../../platform/errors/problem.exception.js';

export interface DemoPrincipal {
  demo: true;
  userId: string;
  merchantId: string;
  exp: number;
}

@Injectable()
export class DemoService {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  private consumeRateLimit(key: string, now: number): void {
    const current = this.attempts.get(key);
    const window =
      !current || current.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : current;
    window.count += 1;
    this.attempts.set(key, window);
    if (window.count > 5)
      throw new ProblemException('RATE_LIMITED', 429, 'Demo rate limit exceeded.');
  }

  issueSession(
    now = Date.now(),
    rateLimitKey?: string
  ): {
    accessToken: string;
    expiresAt: string;
    principal: DemoPrincipal;
  } {
    if (!demoEnabled()) throw new ProblemException('DEMO_DISABLED', 404, 'DEMO_DISABLED');
    if (rateLimitKey) this.consumeRateLimit(rateLimitKey, now);
    const payload: DemoPrincipal = {
      demo: true,
      userId: DEMO_USER_ID,
      merchantId: DEMO_TENANT_ID,
      exp: now + DEMO_SESSION_TTL_MS
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = createHmac('sha256', demoSecret()).update(encoded).digest('base64url');
    return {
      accessToken: `${encoded}.${signature}`,
      expiresAt: new Date(payload.exp).toISOString(),
      principal: payload
    };
  }

  verifySession(token: string, now = Date.now()): DemoPrincipal | undefined {
    if (!demoEnabled()) return undefined;
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return undefined;
    const expected = createHmac('sha256', demoSecret()).update(encoded).digest('base64url');
    const actualBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes))
      return undefined;
    try {
      const principal = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8')
      ) as DemoPrincipal;
      if (
        principal.demo !== true ||
        principal.userId !== DEMO_USER_ID ||
        principal.merchantId !== DEMO_TENANT_ID ||
        !Number.isSafeInteger(principal.exp) ||
        principal.exp <= now
      )
        return undefined;
      return principal;
    } catch {
      return undefined;
    }
  }
}
