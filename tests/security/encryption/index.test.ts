/**
 * Encryption Service Tests
 */

import {
  EncryptionService,
  InMemoryKeyManager,
  createEncryptionService,
} from '../../../src/security/encryption';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    const keyManager = new InMemoryKeyManager('test-key');
    service = createEncryptionService({}, keyManager);
  });

  describe('Symmetric Encryption', () => {
    it('should encrypt and decrypt data', () => {
      const plaintext = 'Hello, World!';
      const encrypted = service.encrypt(plaintext);

      expect(encrypted.encrypted).not.toBe(plaintext);
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.algorithm).toBe('aes-256-gcm');

      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should use different IVs for same data', () => {
      const plaintext = 'Same data';
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
    });

    it('should support different algorithms', () => {
      const plaintext = 'Test data';
      
      const encrypted = service.encrypt(plaintext, 'aes-256-cbc');
      expect(encrypted.algorithm).toBe('aes-256-cbc');

      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt buffers', () => {
      const buffer = Buffer.from('Buffer data');
      const encrypted = service.encrypt(buffer);
      const decrypted = service.decrypt(encrypted);

      expect(Buffer.from(decrypted)).toEqual(buffer);
    });
  });

  describe('Hashing', () => {
    it('should hash strings', () => {
      const hash1 = service.hash('test data');
      const hash2 = service.hash('test data');

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex length
    });

    it('should use different algorithms', () => {
      const sha256 = service.hash('test', 'sha256');
      const sha512 = service.hash('test', 'sha512');

      expect(sha256.length).toBe(64);
      expect(sha512.length).toBe(128);
      expect(sha256).not.toBe(sha512);
    });

    it('should hash buffers', () => {
      const buffer = Buffer.from('buffer test');
      const hash = service.hash(buffer);

      expect(hash.length).toBe(64);
    });
  });

  describe('HMAC', () => {
    it('should generate HMAC', () => {
      const hmac1 = service.hmac('test data', 'secret-key');
      const hmac2 = service.hmac('test data', 'secret-key');

      expect(hmac1).toBe(hmac2);
    });

    it('should generate different HMACs for different keys', () => {
      const hmac1 = service.hmac('test', 'key1');
      const hmac2 = service.hmac('test', 'key2');

      expect(hmac1).not.toBe(hmac2);
    });

    it('should verify HMAC', () => {
      const data = 'test data';
      const key = 'secret-key';
      const hmac = service.hmac(data, key);

      expect(service.verifyHmac(data, hmac, key)).toBe(true);
      expect(service.verifyHmac(data, hmac, 'wrong-key')).toBe(false);
    });
  });

  describe('Key Derivation', () => {
    it('should derive keys with scrypt', () => {
      const { key, salt } = service.deriveKey('password', undefined, 32, 'scrypt');

      expect(key.length).toBe(32);
      expect(salt.length).toBe(16);
    });

    it('should derive keys with PBKDF2', () => {
      const { key, salt } = service.deriveKey('password', undefined, 32, 'pbkdf2');

      expect(key.length).toBe(32);
      expect(salt.length).toBe(16);
    });

    it('should derive different keys with different salts', () => {
      const salt1 = Buffer.from('salt1-salt1-salt');
      const salt2 = Buffer.from('salt2-salt2-salt');

      const { key: key1 } = service.deriveKey('password', salt1);
      const { key: key2 } = service.deriveKey('password', salt2);

      expect(key1).not.toEqual(key2);
    });

    it('should derive same key with same password and salt', () => {
      const salt = Buffer.from('fixed-salt-fixed');

      const { key: key1 } = service.deriveKey('password', salt);
      const { key: key2 } = service.deriveKey('password', salt);

      expect(key1).toEqual(key2);
    });
  });

  describe('Field Encryption', () => {
    it('should encrypt specific fields', () => {
      const obj = {
        name: 'John',
        email: 'john@example.com',
        phone: '555-1234',
      };

      const encrypted = service.encryptFields(obj, ['email', 'phone']);

      expect(encrypted.name).toBe('John');
      expect(encrypted.email).toMatch(/^enc:/);
      expect(encrypted.phone).toMatch(/^enc:/);
    });

    it('should decrypt specific fields', () => {
      const obj = {
        name: 'John',
        email: 'john@example.com',
      };

      const encrypted = service.encryptFields(obj, ['email']);
      const decrypted = service.decryptFields(encrypted, ['email']);

      expect(decrypted.name).toBe('John');
      expect(decrypted.email).toBe('john@example.com');
    });

    it('should handle nested objects', () => {
      const obj = {
        user: {
          email: 'test@example.com',
        },
      };

      const encrypted = service.encryptFields(obj, ['email']);
      expect(encrypted.user.email).toMatch(/^enc:/);
    });
  });

  describe('Token Generation', () => {
    it('should generate secure tokens', () => {
      const token1 = service.generateToken();
      const token2 = service.generateToken();

      expect(token1).not.toBe(token2);
      expect(token1.length).toBeGreaterThan(20);
    });

    it('should generate tokens of specified length', () => {
      const token = service.generateToken(16);
      // Base64url encoding of 16 bytes = ~22 characters
      expect(token.length).toBeGreaterThanOrEqual(20);
    });

    it('should generate unique IDs', () => {
      const id1 = service.generateId('user');
      const id2 = service.generateId('user');

      expect(id1).not.toBe(id2);
      expect(id1.startsWith('user_')).toBe(true);
    });
  });

  describe('Secure Comparison', () => {
    it('should match identical strings', () => {
      expect(service.secureCompare('test', 'test')).toBe(true);
    });

    it('should not match different strings', () => {
      expect(service.secureCompare('test', 'TEST')).toBe(false);
      expect(service.secureCompare('test', 'test1')).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(service.secureCompare('', '')).toBe(true);
      expect(service.secureCompare('', 'test')).toBe(false);
    });
  });

  describe('Key Rotation', () => {
    it('should rotate keys', () => {
      const oldKeyId = service.getKeyManager().getCurrentKeyId();
      const newKeyId = service.rotateKey();

      expect(newKeyId).not.toBe(oldKeyId);
      expect(service.getKeyManager().getCurrentKeyId()).toBe(newKeyId);
    });

    it('should decrypt with old keys', () => {
      const plaintext = 'Test data';
      const oldKeyId = service.getKeyManager().getCurrentKeyId();
      const encrypted = service.encrypt(plaintext, undefined, oldKeyId);

      service.rotateKey();

      // Should still be able to decrypt with old key
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });
});

describe('InMemoryKeyManager', () => {
  it('should create with random key if not provided', () => {
    const manager = new InMemoryKeyManager();
    const key = manager.getKey();

    expect(key.length).toBe(32);
  });

  it('should create with provided string key', () => {
    const manager = new InMemoryKeyManager('my-secret-password');
    const key = manager.getKey();

    expect(key.length).toBe(32);
  });

  it('should create with provided buffer key', () => {
    const keyBuffer = Buffer.alloc(32, 0x42);
    const manager = new InMemoryKeyManager(keyBuffer);

    expect(manager.getKey()).toEqual(keyBuffer);
  });

  it('should rotate keys', () => {
    const manager = new InMemoryKeyManager();
    const oldKeyId = manager.getCurrentKeyId();
    
    const newKeyId = manager.rotateKey();
    
    expect(newKeyId).not.toBe(oldKeyId);
    expect(manager.getCurrentKeyId()).toBe(newKeyId);
    
    // Old key should still be accessible
    expect(manager.getKey(oldKeyId)).toBeDefined();
  });

  it('should list all keys', () => {
    const manager = new InMemoryKeyManager();
    manager.rotateKey();
    manager.rotateKey();

    const keys = manager.listKeys();
    expect(keys.length).toBe(3);
  });

  it('should throw for non-existent key', () => {
    const manager = new InMemoryKeyManager();
    
    expect(() => {
      manager.getKey('non-existent-key');
    }).toThrow();
  });
});
