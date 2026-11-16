import { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { logger } from '../../../infrastructure/logger/logger';

/**
 * Compares two API keys without leaking their contents or their lengths through
 * comparison timing. Both values are reduced to fixed-length SHA-256 digests
 * before `timingSafeEqual`, so candidates of a different size are still safe.
 */
function apiKeysMatch(candidate: string, expected: string): boolean {
  const candidateDigest = createHash('sha256').update(candidate, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];

  const validKey = process.env.API_KEY;
  // Temporary dual-key rotation window. The secondary slot holds the incoming
  // key during phase 1 (`rotate`) and the outgoing key after phase 2
  // (`promote`); phase 3 (`retire`) removes it by name, which is what actually
  // retires the old key. See docs/CREDENTIAL-ROTATION.md.
  // It only works together with API_KEY, and an empty or missing value retires it.
  const secondaryKey = process.env.API_KEY_SECONDARY ?? '';
  const hasSecondaryKey = secondaryKey.length > 0;

  if (!validKey) {
    logger.error("❌ API_KEY no está configurada en variables de entorno");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const primaryMatches =
    typeof apiKey === 'string' && apiKeysMatch(apiKey, validKey);
  const secondaryMatches =
    typeof apiKey === 'string' && hasSecondaryKey && apiKeysMatch(apiKey, secondaryKey);

  if (!primaryMatches && !secondaryMatches) {
    logger.warn({ ip: req.ip }, "🔐 Intento de acceso con API Key inválida");
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}
