export const DEMO_TENANT_ID = '00000000-0000-4000-8000-000000000043';
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000044';
export const DEMO_READ_ONLY_CODE = 'DEMO_READ_ONLY';
export const DEMO_SESSION_TTL_MS = 15 * 60_000;

export function demoEnabled(): boolean {
  return process.env.DEMO_ENABLED === 'true';
}

export function demoSecret(): string {
  return process.env.DEMO_TOKEN_SECRET ?? 'local-demo-secret-at-least-32-characters';
}
