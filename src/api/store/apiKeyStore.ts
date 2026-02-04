// bcrypt now imported from crypto utils
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { ApiKeyRepository } from '../../storage/repositories/ApiKeyRepository';

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
  private repository: ApiKeyRepository | null = null;
  private isInitialized: boolean = false;
  private readonly SALT_ROUNDS = 12;

  /**
   * Initialize the API key store with database connection
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.repository = new ApiKeyRepository();
    await this.repository.initialize();
    this.isInitialized = true;

    logger.info('API Key Store initialized with PostgreSQL persistence');
  }

  /**
   * Ensure the store is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.repository) {
      throw new Error('ApiKeyStore not initialized. Call initialize() first.');
    }
  }

  async createKey(options: CreateApiKeyOptions): Promise<{ key: ApiKey; plaintext: string }> {
    this.ensureInitialized();

    const id = this.generateKeyId();
    const plaintext = this.generatePlaintextKey();
    const hash = await bcrypt.hash(plaintext, this.SALT_ROUNDS);

    const expiresAt = options.expiresInDays
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    const dbKey = await this.repository!.create({
      key_hash: hash,
      name: options.name,
      scopes: options.scopes || ['read'],
      metadata: options.metadata,
      expires_at: expiresAt,
    });

    const key: ApiKey = this.mapDbToApiKey(dbKey);

    logger.info(`API key created: ${key.id}`, { name: options.name, scopes: key.scopes });
    this.emit('keyCreated', { keyId: key.id, name: options.name });

    return { key, plaintext };
  }

  async validateKey(plaintextKey: string): Promise<ApiKeyValidationResult> {
    this.ensureInitialized();

    // Get all active, non-revoked keys from database
    const keys = await this.repository!.list({
      isActive: true,
      includeRevoked: false,
      includeExpired: false,
    });

    // Try to find a matching key by comparing hashes
    for (const dbKey of keys) {
      const isValid = await bcrypt.compare(plaintextKey, dbKey.key_hash);
      if (isValid) {
        // Update last used timestamp
        await this.repository!.updateLastUsed(dbKey.id);

        const key = this.mapDbToApiKey(dbKey);
        key.lastUsedAt = new Date();

        logger.debug(`API key validated: ${key.id}`);
        return { valid: true, key };
      }
    }

    return { valid: false, error: 'Invalid key' };
  }

  async revokeKey(keyId: string): Promise<boolean> {
    this.ensureInitialized();

    const revoked = await this.repository!.revoke(keyId);
    if (!revoked) {
      return false;
    }

    logger.info(`API key revoked: ${keyId}`);
    this.emit('keyRevoked', { keyId });

    return true;
  }

  async rotateKey(keyId: string): Promise<{ key: ApiKey; plaintext: string } | null> {
    this.ensureInitialized();

    const oldKey = await this.repository!.findById(keyId);
    if (!oldKey) {
      return null;
    }

    // Generate new key
    const plaintext = this.generatePlaintextKey();
    const newKeyHash = await bcrypt.hash(plaintext, this.SALT_ROUNDS);

    // Use repository rotate method
    const { oldKey: revokedKey, newKey } = await this.repository!.rotate(keyId, newKeyHash);

    if (!revokedKey || !newKey) {
      return null;
    }

    const key = this.mapDbToApiKey(newKey);

    logger.info(`API key rotated: ${keyId} -> ${key.id}`);
    this.emit('keyRotated', { oldKeyId: keyId, newKeyId: key.id });

    return { key, plaintext };
  }

  async getKey(keyId: string): Promise<ApiKey | undefined> {
    this.ensureInitialized();

    const dbKey = await this.repository!.findById(keyId);
    if (!dbKey) return undefined;

    return this.mapDbToApiKey(dbKey);
  }

  async getAllKeys(): Promise<ApiKey[]> {
    this.ensureInitialized();

    const dbKeys = await this.repository!.list({
      includeRevoked: true,
      includeExpired: true,
    });

    return dbKeys.map(key => this.mapDbToApiKey(key));
  }

  async getActiveKeys(): Promise<ApiKey[]> {
    this.ensureInitialized();

    const dbKeys = await this.repository!.list({
      isActive: true,
      includeRevoked: false,
      includeExpired: false,
    });

    return dbKeys.map(key => this.mapDbToApiKey(key));
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

  private mapDbToApiKey(dbKey: {
    id: string;
    key_hash: string;
    name: string;
    scopes: string[];
    is_revoked: boolean;
    revoked_at?: Date;
    metadata: Record<string, unknown>;
    created_at: Date;
    expires_at?: Date;
    last_used_at?: Date;
  }): ApiKey {
    return {
      id: dbKey.id,
      name: dbKey.name,
      hash: dbKey.key_hash,
      scopes: dbKey.scopes,
      isRevoked: dbKey.is_revoked,
      revokedAt: dbKey.revoked_at,
      metadata: dbKey.metadata,
      createdAt: dbKey.created_at,
      expiresAt: dbKey.expires_at,
      lastUsedAt: dbKey.last_used_at,
    };
  }
}

// Singleton instance
let store: ApiKeyStore | null = null;
let initializationPromise: Promise<ApiKeyStore> | null = null;

export async function getApiKeyStore(): Promise<ApiKeyStore> {
  if (store?.['isInitialized']) {
    return store;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    store = new ApiKeyStore();
    await store.initialize();
    return store;
  })();

  return initializationPromise;
}

export function resetApiKeyStore(): void {
  store = null;
  initializationPromise = null;
}

// Backwards compatibility - synchronous getter (deprecated)
export function getApiKeyStoreSync(): ApiKeyStore {
  if (!store) {
    store = new ApiKeyStore();
    // Auto-initialize in background for backwards compatibility
    store.initialize().catch(err => {
      logger.error('Failed to auto-initialize API key store:', err);
    });
  }
  return store;
}
