/**
 * API Authentication Middleware
 * 
 * Validates API keys from X-API-Key header.
 * Uses cryptographically secure key generation.
 */

import { Request, Response, NextFunction } from 'express';
import { randomBytes, timingSafeEqual } from 'crypto';

// In-memory key storage (in production, use database with hashed keys)
const validKeys = new Set<string>();

// API key format: dash_<prefix>_<32-char-hex>
const API_KEY_PATTERN = /^dash_[a-z]+_[a-f0-9]{64}$/;
const API_KEY_PREFIX = 'dash';

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
  // First check format
  if (!isValidApiKeyFormat(key)) {
    return false;
  }
  
  // Then check against stored keys (timing-safe)
  for (const storedKey of validKeys) {
    if (secureCompareKeys(key, storedKey)) {
      return true;
    }
  }
  return false;
}

export function authMiddleware(apiKey: string) {
  // Add default key if it's in valid format, otherwise generate one
  if (isValidApiKeyFormat(apiKey)) {
    validKeys.add(apiKey);
  } else {
    console.warn('[Auth] Default API key does not meet security requirements. Generating secure key.');
    const secureKey = generateApiKey('default');
    validKeys.add(secureKey);
    console.info(`[Auth] Generated secure API key: ${secureKey.slice(0, 20)}...`);
  }

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip auth for health endpoint
    if (req.path === '/health') {
      return next();
    }

    const key = req.headers['x-api-key'] as string;

    if (!key) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'API key required. Set X-API-Key header.'
      });
    }

    // Validate key format
    if (!isValidApiKeyFormat(key)) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key format'
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

export function listApiKeys(): string[] {
  // Return masked keys for display
  return Array.from(validKeys).map(key => {
    const parts = key.split('_');
    return `${parts[0]}_${parts[1]}_${'*'.repeat(20)}`;
  });
}

export { validKeys };
