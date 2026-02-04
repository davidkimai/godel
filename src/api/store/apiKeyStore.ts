import { EventEmitter } from 'events';
import { hashApiKey, compareApiKey } from '../../utils/crypto';
import { logger } from '../logging/logger';

export interface ApiKey {
  id: string;
  name: string;
  hash: string;
  scopes: string[];
  createdAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
  isRevoked: boolean;
  revokedAt?: Date;
  metadata?: Record<string, any>;
}

export interface CreateApiKeyOptions {
  name: string;
  scopes?: string[];
  expiresInDays?: number;
  metadata?: Record<string, any>;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  key?: ApiKey;
  error?: string;
}

export class ApiKeyStore extends EventEmitter {
  private keys: Map<string, ApiKey> = new Map();

  async createKey(options: CreateApiKeyOptions): Promise<{ key: ApiKey; plaintext: string }> {
    const id = this.generateKeyId();
    const plaintext = this.generatePlaintextKey();
    const hash = await hashApiKey(plaintext);

    const key: ApiKey = {
      id,
      name: options.name,
      hash,
      scopes: options.scopes || ['read'],
      createdAt: new Date(),
      expiresAt: options.expiresInDays 
        ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
        : undefined,
      isRevoked: false,
      metadata: options.metadata
    };

    this.keys.set(id, key);
    
    logger.info(`API key created: ${id}`, { name: options.name, scopes: key.scopes });
    this.emit('keyCreated', { keyId: id, name: options.name });

    return { key, plaintext };
  }

  async validateKey(plaintextKey: string): Promise<ApiKeyValidationResult> {
    // Check all keys for matching hash
    for (const key of this.keys.values()) {
      if (key.isRevoked) continue;
      if (key.expiresAt && key.expiresAt < new Date()) continue;
      
      const isValid = await compareApiKey(plaintextKey, key.hash);
      if (isValid) {
        key.lastUsedAt = new Date();
        logger.debug(`API key validated: ${key.id}`);
        return { valid: true, key };
      }
    }
    
    return { valid: false, error: 'Invalid key' };
  }

  revokeKey(keyId: string): boolean {
    const key = this.keys.get(keyId);
    if (!key) {
      return false;
    }

    key.isRevoked = true;
    key.revokedAt = new Date();

    logger.info(`API key revoked: ${keyId}`);
    this.emit('keyRevoked', { keyId });
    
    return true;
  }

  async rotateKey(keyId: string): Promise<{ key: ApiKey; plaintext: string } | null> {
    const oldKey = this.keys.get(keyId);
    if (!oldKey) {
      return null;
    }

    // Revoke old key
    this.revokeKey(keyId);

    // Create new key with same properties
    const result = await this.createKey({
      name: `${oldKey.name} (rotated)`,
      scopes: oldKey.scopes,
      metadata: { ...oldKey.metadata, rotatedFrom: keyId }
    });

    logger.info(`API key rotated: ${keyId} -> ${result.key.id}`);
    this.emit('keyRotated', { oldKeyId: keyId, newKeyId: result.key.id });

    return result;
  }

  getKey(keyId: string): ApiKey | undefined {
    return this.keys.get(keyId);
  }

  getAllKeys(): ApiKey[] {
    return Array.from(this.keys.values());
  }

  getActiveKeys(): ApiKey[] {
    return this.getAllKeys().filter(k => !k.isRevoked);
  }

  // Helper methods
  private generateKeyId(): string {
    return `key_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private generatePlaintextKey(): string {
    const prefix = 'dash';
    const random = require('crypto').randomBytes(32).toString('base64url');
    return `${prefix}_${random}`;
  }
}

// Singleton instance
let store: ApiKeyStore | null = null;

export function getApiKeyStore(): ApiKeyStore {
  if (!store) {
    store = new ApiKeyStore();
  }
  return store;
}

export function resetApiKeyStore(): void {
  store = null;
}
