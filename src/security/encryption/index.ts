/**
 * Encryption Utilities
 * 
 * Provides encryption at rest and in transit capabilities.
 * Supports multiple encryption algorithms and key management strategies.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac, pbkdf2Sync, scryptSync, CipherGCM, DecipherGCM } from 'crypto';
import { EventEmitter } from 'events';

// Encryption algorithms
export type EncryptionAlgorithm =
  | 'aes-256-gcm'
  | 'aes-256-cbc'
  | 'aes-192-gcm'
  | 'aes-192-cbc'
  | 'aes-128-gcm'
  | 'aes-128-cbc';

// Hash algorithms
export type HashAlgorithm = 'sha256' | 'sha512' | 'sha3-256' | 'sha3-512' | 'blake2b512';

// Key derivation methods
export type KeyDerivationMethod = 'pbkdf2' | 'scrypt' | 'hkdf';

// Encryption result
export interface EncryptionResult {
  encrypted: string;
  iv: string;
  authTag?: string;
  algorithm: EncryptionAlgorithm;
  keyId?: string;
}

// Key metadata
export interface KeyMetadata {
  id: string;
  algorithm: EncryptionAlgorithm;
  createdAt: Date;
  expiresAt?: Date;
  purpose: 'data-encryption' | 'token-signing' | 'key-encryption';
  status: 'active' | 'expired' | 'revoked';
}

// Encryption configuration
export interface EncryptionConfig {
  defaultAlgorithm?: EncryptionAlgorithm;
  defaultHashAlgorithm?: HashAlgorithm;
  keyDerivationMethod?: KeyDerivationMethod;
  keyRotationDays?: number;
  keyIdPrefix?: string;
}

// Key manager interface
export interface KeyManager {
  getKey(keyId?: string): Buffer;
  getCurrentKeyId(): string;
  rotateKey(): string;
  listKeys(): KeyMetadata[];
}

// Type guards for GCM
function isGCMCipher(cipher: ReturnType<typeof createCipheriv>): cipher is CipherGCM {
  return 'getAuthTag' in cipher;
}

function isGCMDecipher(decipher: ReturnType<typeof createDecipheriv>): decipher is DecipherGCM {
  return 'setAuthTag' in decipher;
}

/**
 * Simple in-memory key manager
 */
export class InMemoryKeyManager implements KeyManager {
  private keys: Map<string, { key: Buffer; metadata: KeyMetadata }> = new Map();
  private currentKeyId: string;

  constructor(initialKey?: string | Buffer) {
    const keyId = this.generateKeyId();
    const key = typeof initialKey === 'string'
      ? scryptSync(initialKey, 'salt', 32)
      : initialKey || randomBytes(32);

    this.keys.set(keyId, {
      key,
      metadata: {
        id: keyId,
        algorithm: 'aes-256-gcm',
        createdAt: new Date(),
        purpose: 'data-encryption',
        status: 'active',
      },
    });

    this.currentKeyId = keyId;
  }

  getKey(keyId?: string): Buffer {
    const id = keyId || this.currentKeyId;
    const entry = this.keys.get(id);
    
    if (!entry) {
      throw new Error(`Key '${id}' not found`);
    }

    return entry.key;
  }

  getCurrentKeyId(): string {
    return this.currentKeyId;
  }

  rotateKey(): string {
    const newKeyId = this.generateKeyId();
    const newKey = randomBytes(32);

    this.keys.set(newKeyId, {
      key: newKey,
      metadata: {
        id: newKeyId,
        algorithm: 'aes-256-gcm',
        createdAt: new Date(),
        purpose: 'data-encryption',
        status: 'active',
      },
    });

    this.currentKeyId = newKeyId;
    return newKeyId;
  }

  listKeys(): KeyMetadata[] {
    return Array.from(this.keys.values()).map(e => e.metadata);
  }

  private generateKeyId(): string {
    return `key_${Date.now()}_${randomBytes(4).toString('hex')}`;
  }
}

/**
 * Encryption Service
 */
export class EncryptionService extends EventEmitter {
  private config: EncryptionConfig;
  private keyManager: KeyManager;

  constructor(config: EncryptionConfig = {}, keyManager?: KeyManager) {
    super();
    this.config = {
      defaultAlgorithm: 'aes-256-gcm',
      defaultHashAlgorithm: 'sha256',
      keyDerivationMethod: 'scrypt',
      keyRotationDays: 90,
      keyIdPrefix: 'godel',
      ...config,
    };

    this.keyManager = keyManager || new InMemoryKeyManager();
  }

  /**
   * Encrypt data
   */
  encrypt(
    data: string | Buffer,
    algorithm?: EncryptionAlgorithm,
    keyId?: string
  ): EncryptionResult {
    const algo = algorithm || this.config.defaultAlgorithm!;
    const key = this.keyManager.getKey(keyId);
    
    // Generate IV
    const iv = randomBytes(this.getIVLength(algo));
    
    // Create cipher
    const cipher = createCipheriv(algo, this.getKeyForAlgorithm(key, algo), iv);
    
    // Encrypt
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    let encrypted = cipher.update(dataBuffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const result: EncryptionResult = {
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      algorithm: algo,
      keyId: keyId || this.keyManager.getCurrentKeyId(),
    };

    // Get auth tag for GCM modes
    if (algo.includes('gcm') && isGCMCipher(cipher)) {
      result.authTag = cipher.getAuthTag().toString('base64');
    }

    this.emit('data:encrypted', { algorithm: algo, keyId: result.keyId });

    return result;
  }

  /**
   * Decrypt data
   */
  decrypt(encryptedData: EncryptionResult): string {
    const key = this.keyManager.getKey(encryptedData.keyId);
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const encrypted = Buffer.from(encryptedData.encrypted, 'base64');

    // Create decipher
    const decipher = createDecipheriv(
      encryptedData.algorithm,
      this.getKeyForAlgorithm(key, encryptedData.algorithm),
      iv
    );

    // Set auth tag for GCM modes
    if (encryptedData.algorithm.includes('gcm') && encryptedData.authTag && isGCMDecipher(decipher)) {
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'base64'));
    }

    // Decrypt
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    this.emit('data:decrypted', { algorithm: encryptedData.algorithm, keyId: encryptedData.keyId });

    return decrypted.toString('utf8');
  }

  /**
   * Hash data
   */
  hash(data: string | Buffer, algorithm?: HashAlgorithm): string {
    const algo = algorithm || this.config.defaultHashAlgorithm!;
    const hash = createHash(algo);
    
    if (Buffer.isBuffer(data)) {
      hash.update(data);
    } else {
      hash.update(data, 'utf8');
    }

    return hash.digest('hex');
  }

  /**
   * HMAC (Hash-based Message Authentication Code)
   */
  hmac(data: string | Buffer, key?: string | Buffer, algorithm?: HashAlgorithm): string {
    const algo = algorithm || this.config.defaultHashAlgorithm!;
    const hmacKey = key || this.keyManager.getKey();
    
    const hmac = createHmac(algo, hmacKey);
    
    if (Buffer.isBuffer(data)) {
      hmac.update(data);
    } else {
      hmac.update(data, 'utf8');
    }

    return hmac.digest('hex');
  }

  /**
   * Verify HMAC
   */
  verifyHmac(data: string | Buffer, signature: string, key?: string | Buffer, algorithm?: HashAlgorithm): boolean {
    const computed = this.hmac(data, key, algorithm);
    
    // Constant-time comparison to prevent timing attacks
    if (computed.length !== signature.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < computed.length; i++) {
      result |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    
    return result === 0;
  }

  /**
   * Derive key from password
   */
  deriveKey(
    password: string,
    salt?: Buffer,
    length: number = 32,
    method?: KeyDerivationMethod
  ): { key: Buffer; salt: Buffer } {
    const derivationMethod = method || this.config.keyDerivationMethod!;
    const actualSalt = salt || randomBytes(16);

    let key: Buffer;

    switch (derivationMethod) {
      case 'pbkdf2':
        key = pbkdf2Sync(password, actualSalt, 100000, length, 'sha256');
        break;
      case 'scrypt':
        key = scryptSync(password, actualSalt, length);
        break;
      case 'hkdf':
        // Simplified HKDF - in production, use proper HKDF implementation
        key = createHmac('sha256', actualSalt).update(password).digest().slice(0, length);
        break;
      default:
        throw new Error(`Unknown key derivation method: ${derivationMethod}`);
    }

    return { key, salt: actualSalt };
  }

  /**
   * Encrypt object fields selectively
   */
  encryptFields<T extends Record<string, unknown>>(
    obj: T,
    fields: string[],
    algorithm?: EncryptionAlgorithm
  ): T {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (fields.includes(key) && typeof value === 'string') {
        const encrypted = this.encrypt(value, algorithm);
        result[key] = `enc:${JSON.stringify(encrypted)}`;
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.encryptFields(value as Record<string, unknown>, fields, algorithm);
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }

  /**
   * Decrypt object fields
   */
  decryptFields<T extends Record<string, unknown>>(obj: T, fields: string[]): T {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (fields.includes(key) && typeof value === 'string' && value.startsWith('enc:')) {
        try {
          const encryptedData: EncryptionResult = JSON.parse(value.substring(4));
          result[key] = this.decrypt(encryptedData);
        } catch {
          result[key] = value;
        }
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.decryptFields(value as Record<string, unknown>, fields);
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }

  /**
   * Generate secure random token
   */
  generateToken(length: number = 32): string {
    return randomBytes(length).toString('base64url');
  }

  /**
   * Generate secure random ID
   */
  generateId(prefix: string = ''): string {
    const id = randomBytes(16).toString('hex');
    return prefix ? `${prefix}_${id}` : id;
  }

  /**
   * Constant-time string comparison
   */
  secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }

  /**
   * Get key manager
   */
  getKeyManager(): KeyManager {
    return this.keyManager;
  }

  /**
   * Rotate encryption key
   */
  rotateKey(): string {
    const newKeyId = this.keyManager.rotateKey();
    this.emit('key:rotated', { newKeyId });
    return newKeyId;
  }

  /**
   * Get IV length for algorithm
   */
  private getIVLength(algorithm: EncryptionAlgorithm): number {
    return algorithm.includes('gcm') ? 12 : 16;
  }

  /**
   * Get appropriate key size for algorithm
   */
  private getKeyForAlgorithm(key: Buffer, algorithm: EncryptionAlgorithm): Buffer {
    if (algorithm.includes('256')) {
      return key.slice(0, 32);
    } else if (algorithm.includes('192')) {
      return key.slice(0, 24);
    } else {
      return key.slice(0, 16);
    }
  }
}

// TLS/SSL Configuration helpers
export interface TLSConfig {
  cert: string;
  key: string;
  ca?: string;
  requestCert?: boolean;
  rejectUnauthorized?: boolean;
}

/**
 * TLS Configuration helper
 */
export function createTLSConfig(options: {
  certPath?: string;
  keyPath?: string;
  caPath?: string;
  certContent?: string;
  keyContent?: string;
  caContent?: string;
  requestCert?: boolean;
  rejectUnauthorized?: boolean;
}): TLSConfig {
  return {
    cert: options.certContent || '',
    key: options.keyContent || '',
    ca: options.caContent,
    requestCert: options.requestCert,
    rejectUnauthorized: options.rejectUnauthorized,
  };
}

// Singleton instance
let encryptionServiceInstance: EncryptionService | null = null;

export function getEncryptionService(config?: EncryptionConfig): EncryptionService {
  if (!encryptionServiceInstance) {
    encryptionServiceInstance = new EncryptionService(config);
  }
  return encryptionServiceInstance;
}

// Factory function
export function createEncryptionService(
  config?: EncryptionConfig,
  keyManager?: KeyManager
): EncryptionService {
  return new EncryptionService(config, keyManager);
}

// Note: Types already exported at top of file

export default EncryptionService;
