/**
 * API Authentication Middleware
 * 
 * Validates API keys from X-API-Key header.
 * Uses cryptographically secure key generation.
 */

import { logger } from '../../utils/logger';
import { Request, Response, NextFunction } from 'express';
import { randomBytes, timingSafeEqual, createHmac } from 'crypto';

// In-memory key storage (in production, use database with hashed keys)
const validKeys = new Set<string>();
const validSessions = new Map<string, number>();

// API key format: dash_<prefix>_<32-char-hex>
const API_KEY_PATTERN = /^dash_[a-z]+_[a-f0-9]{64}$/;
const API_KEY_PREFIX = 'dash';
const PUBLIC_PATH_PREFIXES = [
  '/health',
  '/api/auth',
  '/api/v1/auth',
  '/api/openapi.json',
  '/api/v1/openapi.json',
  '/api/docs',
  '/api/v1/docs',
];

/** Authenticated request with API key */
export interface AuthenticatedRequest extends Request {
  apiKey: string;
}

/** Require authentication middleware wrapper */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (isPublicPath(req.path)) {
    next();
    return;
  }

  const apiKey = extractApiKey(req);
  if (apiKey && isValidKey(apiKey)) {
    (req as AuthenticatedRequest).apiKey = apiKey;
    next();
    return;
  }

  const sessionToken = typeof (req as any).cookies?.['session'] === 'string'
    ? (req as any).cookies['session']
    : null;
  if (sessionToken && isValidSessionToken(sessionToken)) {
    next();
    return;
  }

  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    const jwtSecret = process.env['DASH_JWT_SECRET'] || process.env['JWT_SECRET'];
    if (jwtSecret) {
      const { valid } = validateJwtToken(bearerToken, jwtSecret, {
        issuer: process.env['DASH_JWT_ISSUER'],
        audience: process.env['DASH_JWT_AUDIENCE'],
      });
      if (valid) {
        next();
        return;
      }
    }
  }

  res.status(401).json({
    error: 'Unauthorized',
    message: 'Authentication required. Provide X-API-Key or valid Bearer token.',
  });
}

/**
 * Generate a cryptographically secure API key
 * Format: dash_<prefix>_<64-char-hex>
 */
export function generateApiKey(prefix: string = 'live'): string {
  // Validate prefix
  if (!/^[a-z]+$/.test(prefix)) {
    throw new Error('API key prefix must be lowercase letters only');
  }
  
  // Generate 32 bytes (256 bits) of randomness = 64 hex chars
  const randomPart = randomBytes(32).toString('hex');
  return `${API_KEY_PREFIX}_${prefix}_${randomPart}`;
}

/**
 * Validate API key format
 */
export function isValidApiKeyFormat(key: string): boolean {
  return API_KEY_PATTERN.test(key);
}

/**
 * Securely compare two API keys (timing-safe)
 */
function secureCompareKeys(provided: string, stored: string): boolean {
  try {
    const providedBuf = Buffer.from(provided, 'utf8');
    const storedBuf = Buffer.from(stored, 'utf8');
    
    if (providedBuf.length !== storedBuf.length) {
      return false;
    }
    
    return timingSafeEqual(providedBuf, storedBuf);
  } catch {
    return false;
  }
}

/**
 * Check if a key is valid
 */
function isValidKey(key: string): boolean {
  // Check against stored keys (timing-safe)
  for (const storedKey of Array.from(validKeys)) {
    if (secureCompareKeys(key, storedKey)) {
      return true;
    }
  }

  // Also allow explicitly configured runtime key if present
  const configured = process.env['DASH_API_KEY'];
  if (configured && secureCompareKeys(key, configured)) {
    return true;
  }
  return false;
}

function isPublicPath(path: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function extractApiKey(req: Request): string | null {
  const key = req.headers['x-api-key'];
  if (typeof key === 'string' && key.length > 0) {
    return key;
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('ApiKey ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

function validateJwtToken(
  token: string,
  secret: string,
  options?: { issuer?: string; audience?: string }
): { valid: boolean; payload?: Record<string, unknown> } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false };
    }

    const [headerSegment, payloadSegment, signatureSegment] = parts;
    const expectedSignature = createHmac('sha256', secret)
      .update(`${headerSegment}.${payloadSegment}`)
      .digest('base64url');
    if (
      expectedSignature.length !== signatureSegment.length
      || !timingSafeEqual(Buffer.from(expectedSignature, 'utf8'), Buffer.from(signatureSegment, 'utf8'))
    ) {
      return { valid: false };
    }

    const header = JSON.parse(Buffer.from(headerSegment, 'base64url').toString('utf8'));
    if (header?.alg !== 'HS256') {
      return { valid: false };
    }

    const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return { valid: false };
    if (payload.nbf && payload.nbf > now) return { valid: false };
    if (options?.issuer && payload.iss !== options.issuer) return { valid: false };
    if (options?.audience) {
      const aud = payload.aud;
      const audOk = Array.isArray(aud) ? aud.includes(options.audience) : aud === options.audience;
      if (!audOk) return { valid: false };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

export function authMiddleware(apiKey: string) {
  // Always register explicit configured key when provided
  if (apiKey && apiKey.trim().length > 0) {
    validKeys.add(apiKey);
    if (!isValidApiKeyFormat(apiKey)) {
      logger.warn('[Auth] API key does not match recommended secure format; continuing with configured key.');
    }
  } else {
    logger.warn('[Auth] No API key configured. Generating secure key.');
    const secureKey = generateApiKey('default');
    validKeys.add(secureKey);
    logger.info(`[Auth] Generated secure API key: ${secureKey.slice(0, 20)}...`);
  }

  return (req: Request, res: Response, next: NextFunction) => {
    if (isPublicPath(req.path)) {
      return next();
    }

    const key = extractApiKey(req);
    const sessionToken = typeof (req as any).cookies?.['session'] === 'string'
      ? (req as any).cookies['session']
      : null;

    if (sessionToken && isValidSessionToken(sessionToken)) {
      return next();
    }

    if (!key) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'API key required. Set X-API-Key header.'
      });
    }

    if (!isValidKey(key)) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key'
      });
    }

    // Attach key to request for rate limiting
    (req as any).apiKey = key;
    next();
  };
}

export function addApiKey(key: string): void {
  if (!isValidApiKeyFormat(key)) {
    throw new Error('Invalid API key format');
  }
  validKeys.add(key);
}

export function revokeApiKey(key: string): void {
  validKeys.delete(key);
}

export function registerSessionToken(token: string, expiresAtMs: number): void {
  validSessions.set(token, expiresAtMs);
}

export function revokeSessionToken(token: string): void {
  validSessions.delete(token);
}

export function isValidSessionToken(token: string): boolean {
  const expiresAt = validSessions.get(token);
  if (!expiresAt) {
    return false;
  }
  if (expiresAt < Date.now()) {
    validSessions.delete(token);
    return false;
  }
  return true;
}

export function listApiKeys(): string[] {
  // Return masked keys for display
  return Array.from(validKeys).map(key => {
    const parts = key.split('_');
    return `${parts[0]}_${parts[1]}_${'*'.repeat(20)}`;
  });
}
