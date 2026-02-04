/**
 * Cryptographic Utilities
 * 
 * Secure password and API key hashing using bcrypt.
 * Uses timingSafeEqual for constant-time comparisons where applicable.
 */

import * as bcrypt from 'bcrypt';
import { timingSafeEqual } from 'crypto';

// Salt rounds for bcrypt (12 = ~250ms/hash, good balance of security/performance)
export const SALT_ROUNDS = 12;

/**
 * Hash a password using bcrypt
 * @param password Plaintext password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 1) {
    throw new Error('Password cannot be empty');
  }
  if (password.length > 512) {
    throw new Error('Password too long (max 512 characters)');
  }
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plaintext password against a bcrypt hash
 * Uses bcrypt.compare which is timing-safe
 * @param password Plaintext password
 * @param hash Bcrypt hash from database
 * @returns True if password matches
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) {
    return false;
  }
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * Hash an API key using bcrypt
 * API keys are high-entropy so we use the same bcrypt approach
 * @param apiKey Plaintext API key
 * @returns Hashed API key
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  if (!apiKey || apiKey.length < 1) {
    throw new Error('API key cannot be empty');
  }
  if (apiKey.length > 1024) {
    throw new Error('API key too long (max 1024 characters)');
  }
  return bcrypt.hash(apiKey, SALT_ROUNDS);
}

/**
 * Compare a plaintext API key against a bcrypt hash
 * @param apiKey Plaintext API key
 * @param hash Bcrypt hash from storage
 * @returns True if API key matches
 */
export async function compareApiKey(apiKey: string, hash: string): Promise<boolean> {
  if (!apiKey || !hash) {
    return false;
  }
  try {
    return await bcrypt.compare(apiKey, hash);
  } catch {
    return false;
  }
}

/**
 * Timing-safe string comparison for non-bcrypt comparisons
 * Use this when comparing non-hashed values (like tokens, signatures)
 * @param a First string
 * @param b Second string
 * @returns True if strings are equal
 */
export function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    
    if (bufA.length !== bufB.length) {
      return false;
    }
    
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Generate a cryptographically secure random token
 * @param bytes Number of bytes of randomness (default 32)
 * @returns Base64url-encoded token
 */
export function generateSecureToken(bytes: number = 32): string {
  const crypto = require('crypto');
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Generate a secure random string for passwords/state
 * @param length Length of string
 * @returns Random alphanumeric string
 */
export function generateRandomString(length: number = 32): string {
  const crypto = require('crypto');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const result: string[] = [];
  const randomBytes = crypto.randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    result.push(chars[randomBytes[i] % chars.length]);
  }
  
  return result.join('');
}
