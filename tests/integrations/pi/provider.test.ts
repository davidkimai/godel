/**
 * Provider Management Tests
 *
 * Tests for the Pi provider management module.
 */

import {
  ProviderManager,
  getGlobalProviderManager,
  resetGlobalProviderManager,
  getProviderConfig,
  getAllProviderConfigs,
  isValidProvider,
  getProvidersByCapability,
  getProvidersByPriority,
  createProviderInstance,
  getProviderLatency,
  getProviderQualityScore,
  getProviderContextWindow,
  DEFAULT_PROVIDER_CHAIN,
  PROVIDER_CONFIGS,
} from '../../../src/integrations/pi/provider';
import { ProviderId, PiCapability } from '../../../src/integrations/pi/types';

describe('Provider Management', () => {
  beforeEach(() => {
    resetGlobalProviderManager();
  });

  afterEach(() => {
    resetGlobalProviderManager();
  });

  describe('ProviderManager', () => {
    it('should create a new ProviderManager', () => {
      const manager = new ProviderManager();
      expect(manager).toBeDefined();
      expect(manager.getAllConfigs()).toHaveLength(Object.keys(PROVIDER_CONFIGS).length);
    });

    it('should return global singleton', () => {
      const manager1 = getGlobalProviderManager();
      const manager2 = getGlobalProviderManager();
      expect(manager1).toBe(manager2);
    });
  });

  describe('getProviderConfig', () => {
    it('should return config for valid providers', () => {
      const anthropic = getProviderConfig('anthropic');
      expect(anthropic).toBeDefined();
      expect(anthropic?.id).toBe('anthropic');
      expect(anthropic?.name).toBe('Anthropic');
      expect(anthropic?.models).toContain('claude-sonnet-4-5');
    });

    it('should return undefined for invalid provider', () => {
      const config = getProviderConfig('invalid-provider' as ProviderId);
      expect(config).toBeUndefined();
    });
  });

  describe('getAllProviderConfigs', () => {
    it('should return all provider configs', () => {
      const configs = getAllProviderConfigs();
      expect(configs.length).toBeGreaterThanOrEqual(8);
      expect(configs.some((c) => c.id === 'anthropic')).toBe(true);
      expect(configs.some((c) => c.id === 'openai')).toBe(true);
      expect(configs.some((c) => c.id === 'google')).toBe(true);
    });
  });

  describe('isValidProvider', () => {
    it('should return true for valid providers', () => {
      expect(isValidProvider('anthropic')).toBe(true);
      expect(isValidProvider('openai')).toBe(true);
      expect(isValidProvider('google')).toBe(true);
    });

    it('should return false for invalid providers', () => {
      expect(isValidProvider('invalid')).toBe(false);
      expect(isValidProvider('')).toBe(false);
    });
  });

  describe('getProvidersByCapability', () => {
    it('should return providers with capability', () => {
      const providers = getProvidersByCapability('code-generation' as PiCapability);
      expect(providers.length).toBeGreaterThan(0);
      expect(providers.every((p) => p.capabilities.includes('code-generation' as PiCapability))).toBe(true);
    });

    it('should return empty array for unknown capability', () => {
      const providers = getProvidersByCapability('unknown-capability' as PiCapability);
      expect(providers).toHaveLength(0);
    });
  });

  describe('getProvidersByPriority', () => {
    it('should return providers sorted by priority', () => {
      const providers = getProvidersByPriority();
      expect(providers.length).toBeGreaterThan(0);

      for (let i = 1; i < providers.length; i++) {
        expect(providers[i].fallbackPriority).toBeGreaterThanOrEqual(
          providers[i - 1].fallbackPriority
        );
      }
    });
  });

  describe('createProviderInstance', () => {
    it('should create a PiInstance with correct defaults', () => {
      const instance = createProviderInstance('anthropic', 'test-123', 'ws://localhost:3000');

      expect(instance.id).toBe('test-123');
      expect(instance.provider).toBe('anthropic');
      expect(instance.endpoint).toBe('ws://localhost:3000');
      expect(instance.model).toBe('claude-sonnet-4-5');
      expect(instance.health).toBe('unknown');
      expect(instance.capacity.maxConcurrent).toBe(5);
    });
  });

  describe('getProviderLatency', () => {
    it('should return expected latency for providers', () => {
      expect(getProviderLatency('anthropic')).toBe(1500);
      expect(getProviderLatency('openai')).toBe(1200);
      expect(getProviderLatency('groq')).toBe(300);
    });

    it('should return default for unknown provider', () => {
      expect(getProviderLatency('unknown' as ProviderId)).toBe(2000);
    });
  });

  describe('getProviderQualityScore', () => {
    it('should return quality score for providers', () => {
      expect(getProviderQualityScore('anthropic')).toBe(95);
      expect(getProviderQualityScore('openai')).toBe(95);
      expect(getProviderQualityScore('google')).toBe(88);
    });

    it('should return default for unknown provider', () => {
      expect(getProviderQualityScore('unknown' as ProviderId)).toBe(50);
    });
  });

  describe('getProviderContextWindow', () => {
    it('should return context window for providers', () => {
      expect(getProviderContextWindow('anthropic')).toBe(200000);
      expect(getProviderContextWindow('openai')).toBe(128000);
      expect(getProviderContextWindow('google')).toBe(2000000);
    });

    it('should return default for unknown provider', () => {
      expect(getProviderContextWindow('unknown' as ProviderId)).toBe(4096);
    });
  });

  describe('DEFAULT_PROVIDER_CHAIN', () => {
    it('should have providers in priority order', () => {
      expect(DEFAULT_PROVIDER_CHAIN[0]).toBe('anthropic');
      expect(DEFAULT_PROVIDER_CHAIN[1]).toBe('openai');
      expect(DEFAULT_PROVIDER_CHAIN[2]).toBe('google');
    });
  });
});
