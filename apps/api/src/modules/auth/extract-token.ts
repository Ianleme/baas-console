import type { Request } from 'express';

export function extractAccessToken(request: Request): string | undefined {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice(7).trim();
    if (token) return token;
  }
  const rawCookie = request.headers.cookie;
  if (rawCookie) {
    for (const part of rawCookie.split(';')) {
      const separator = part.indexOf('=');
      if (separator > 0) {
        const name = part.slice(0, separator).trim();
        if (
          name === 'baas_access' ||
          name === '__Host-baas_access' ||
          name === 'baas_access_token'
        ) {
          return decodeURIComponent(part.slice(separator + 1).trim());
        }
      }
    }
  }
  return undefined;
}
