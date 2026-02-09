import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  ResourceTranslator,
  ResourceLimits,
  createResourceTranslator,
} from '../../src/kubernetes/resource-translator';

describe('ResourceTranslator', () => {
  let translator: ResourceTranslator;

  beforeEach(() => {
    translator = new ResourceTranslator();
  });

  describe('CPU Conversion', () => {
    it('should convert whole cores to millicores', () => {
      expect(translator.cpuToMillicores(1)).toBe('1000m');
      expect(translator.cpuToMillicores(2)).toBe('2000m');
      expect(translator.cpuToMillicores(4)).toBe('4000m');
    });

    it('should convert fractional cores to millicores', () => {
      expect(translator.cpuToMillicores(0.5)).toBe('500m');
      expect(translator.cpuToMillicores(0.25)).toBe('250m');
      expect(translator.cpuToMillicores(1.5)).toBe('1500m');
    });

    it('should round millicores to nearest integer', () => {
      expect(translator.cpuToMillicores(0.333)).toBe('333m');
      expect(translator.cpuToMillicores(0.999)).toBe('999m');
    });

    it('should handle zero cores', () => {
      expect(translator.cpuToMillicores(0)).toBe('0m');
    });

    it('should throw error for negative cores', () => {
      expect(() => translator.cpuToMillicores(-1)).toThrow('CPU cores must be non-negative');
      expect(() => translator.cpuToMillicores(-0.5)).toThrow('CPU cores must be non-negative');
    });
  });

  describe('Memory Conversion', () => {
    describe('memoryToK8sFormat', () => {
      it('should convert Gi to Kubernetes format', () => {
        expect(translator.memoryToK8sFormat('1Gi')).toBe('1Gi');
        expect(translator.memoryToK8sFormat('2Gi')).toBe('2Gi');
        expect(translator.memoryToK8sFormat('16Gi')).toBe('16Gi');
      });

      it('should convert Mi to Kubernetes format', () => {
        expect(translator.memoryToK8sFormat('512Mi')).toBe('512Mi');
        expect(translator.memoryToK8sFormat('1024Mi')).toBe('1024Mi');
      });

      it('should pass through bytes', () => {
        expect(translator.memoryToK8sFormat('1073741824')).toBe('1073741824');
        expect(translator.memoryToK8sFormat('536870912')).toBe('536870912');
      });

      it('should handle Ki, Ti, Pi, Ei units', () => {
        expect(translator.memoryToK8sFormat('1024Ki')).toBe('1024Ki');
        expect(translator.memoryToK8sFormat('1Ti')).toBe('1Ti');
      });

      it('should handle whitespace', () => {
        expect(translator.memoryToK8sFormat('  1Gi  ')).toBe('1Gi');
      });

      it('should throw error for empty string', () => {
        expect(() => translator.memoryToK8sFormat('')).toThrow('Memory value cannot be empty');
        expect(() => translator.memoryToK8sFormat('   ')).toThrow('Memory value cannot be empty');
      });

      it('should throw error for invalid format', () => {
        expect(() => translator.memoryToK8sFormat('abc')).toThrow('Invalid memory format: abc');
        expect(() => translator.memoryToK8sFormat('1 GB')).toThrow('Invalid memory format: 1 GB');
      });

      it('should throw error for negative values', () => {
        expect(() => translator.memoryToK8sFormat('-1Gi')).toThrow('Memory value must be non-negative');
      });
    });

    describe('memoryToBytes', () => {
      it('should convert Gi to bytes', () => {
        expect(translator.memoryToBytes('1Gi')).toBe(1073741824);
        expect(translator.memoryToBytes('2Gi')).toBe(2147483648);
      });

      it('should convert Mi to bytes', () => {
        expect(translator.memoryToBytes('512Mi')).toBe(536870912);
        expect(translator.memoryToBytes('1024Mi')).toBe(1073741824);
      });

      it('should convert Ki to bytes', () => {
        expect(translator.memoryToBytes('1024Ki')).toBe(1048576);
      });

      it('should pass through bytes', () => {
        expect(translator.memoryToBytes('1073741824')).toBe(1073741824);
      });

      it('should handle decimal values', () => {
        expect(translator.memoryToBytes('1.5Gi')).toBe(1610612736);
        expect(translator.memoryToBytes('0.5Gi')).toBe(536870912);
      });
    });
  });

  describe('Disk Conversion', () => {
    it('should convert disk storage to ephemeral storage format', () => {
      expect(translator.diskToK8sFormat('10Gi')).toBe('10Gi');
      expect(translator.diskToK8sFormat('100Mi')).toBe('100Mi');
    });

    it('should handle bytes for disk', () => {
      expect(translator.diskToK8sFormat('10737418240')).toBe('10737418240');
    });
  });

  describe('Kata Overhead', () => {
    it('should not add overhead when disabled', () => {
      const limits: ResourceLimits = {
        cpu: 1,
        memory: '1Gi',
        disk: '10Gi',
      };

      const result = translator.addKataOverhead(limits);
      
      expect(result.cpu).toBe(1);
      expect(result.memory).toBe('1Gi');
      expect(result.disk).toBe('10Gi');
    });

    it('should add Kata overhead when enabled', () => {
      const kataTranslator = new ResourceTranslator({
        enableKataOverhead: true,
      });

      const limits: ResourceLimits = {
        cpu: 1,
        memory: '1Gi',
        disk: '10Gi',
      };

      const result = kataTranslator.addKataOverhead(limits);
      
      // Default overhead: 250m CPU, 256Mi memory, 100Mi storage
      expect(result.cpu).toBe(1.25); // 1 core + 0.25 overhead
      expect(result.memory).toBe(`${1073741824 + 268435456}`); // 1Gi + 256Mi in bytes
      expect(result.disk).toBe(`${10737418240 + 104857600}`); // 10Gi + 100Mi in bytes
    });

    it('should handle custom Kata overhead', () => {
      const kataTranslator = new ResourceTranslator({
        enableKataOverhead: true,
        kataOverhead: {
          cpuMillicores: 500,
          memoryBytes: 536870912, // 512 MiB
          storageBytes: 209715200, // 200 MiB
        },
      });

      const limits: ResourceLimits = {
        cpu: 2,
        memory: '4Gi',
      };

      const result = kataTranslator.addKataOverhead(limits);
      
      expect(result.cpu).toBe(2.5); // 2 cores + 0.5 overhead
      expect(result.memory).toBe(`${4294967296 + 536870912}`); // 4Gi + 512Mi
    });

    it('should handle missing values when overhead is enabled', () => {
      const kataTranslator = new ResourceTranslator({
        enableKataOverhead: true,
      });

      const limits: ResourceLimits = {
        cpu: 1,
      };

      const result = kataTranslator.addKataOverhead(limits);
      
      expect(result.cpu).toBe(1.25);
      expect(result.memory).toBeUndefined();
      expect(result.disk).toBeUndefined();
    });
  });

  describe('Translation', () => {
    it('should translate basic resource limits', () => {
      const limits: ResourceLimits = {
        cpu: 1,
        memory: '1Gi',
      };

      const result = translator.translate(limits);

      expect(result.limits.cpu).toBe('1000m');
      expect(result.limits.memory).toBe('1Gi');
      expect(result.requests?.cpu).toBe('500m');
      expect(result.requests?.memory).toBe('536870912');
    });

    it('should translate resources with disk', () => {
      const limits: ResourceLimits = {
        cpu: 2,
        memory: '4Gi',
        disk: '20Gi',
      };

      const result = translator.translate(limits);

      expect(result.limits.cpu).toBe('2000m');
      expect(result.limits.memory).toBe('4Gi');
      expect(result.limits.ephemeralStorage).toBe('20Gi');
      expect(result.requests?.ephemeralStorage).toBe('20Gi');
    });

    it('should apply Kata overhead in translation', () => {
      const kataTranslator = new ResourceTranslator({
        enableKataOverhead: true,
      });

      const limits: ResourceLimits = {
        cpu: 1,
        memory: '1Gi',
      };

      const result = kataTranslator.translate(limits);

      // Limits should include overhead
      expect(result.limits.cpu).toBe('1250m'); // 1000m + 250m overhead
      expect(result.requests?.cpu).toBe('500m'); // Requests based on original limit
    });

    it('should use defaults when limits are not provided', () => {
      const result = translator.translate({});

      expect(result.limits.cpu).toBe('1000m');
      expect(result.limits.memory).toBe('512Mi');
      expect(result.requests?.cpu).toBe('500m');
      expect(result.requests?.memory).toBe('268435456'); // 256Mi (512Mi / 2)
    });

    it('should respect custom request ratio', () => {
      const ratioTranslator = new ResourceTranslator({
        requestRatio: 0.8,
      });

      const limits: ResourceLimits = {
        cpu: 2,
        memory: '1Gi',
      };

      const result = ratioTranslator.translate(limits);

      expect(result.requests?.cpu).toBe('1600m'); // 2000m * 0.8
      expect(result.requests?.memory).toBe('858993459'); // ~1Gi * 0.8
    });
  });

  describe('Reverse Conversion', () => {
    describe('millicoresToCores', () => {
      it('should convert millicores to cores', () => {
        expect(translator.millicoresToCores('1000m')).toBe(1);
        expect(translator.millicoresToCores('500m')).toBe(0.5);
        expect(translator.millicoresToCores('2000m')).toBe(2);
      });

      it('should throw error for invalid format', () => {
        expect(() => translator.millicoresToCores('1000')).toThrow('Invalid millicores format: 1000');
        expect(() => translator.millicoresToCores('abc')).toThrow('Invalid millicores format: abc');
      });
    });
  });

  describe('Utility Functions', () => {
    describe('bytesToHumanReadable', () => {
      it('should format bytes to human-readable', () => {
        expect(translator.bytesToHumanReadable(0)).toBe('0');
        expect(translator.bytesToHumanReadable(512)).toBe('512');
        expect(translator.bytesToHumanReadable(1024)).toBe('1Ki');
        expect(translator.bytesToHumanReadable(1048576)).toBe('1Mi');
        expect(translator.bytesToHumanReadable(1073741824)).toBe('1Gi');
      });

      it('should format with decimal places when needed', () => {
        expect(translator.bytesToHumanReadable(1536)).toBe('1.50Ki');
        expect(translator.bytesToHumanReadable(1610612736)).toBe('1.50Gi');
      });

      it('should handle large values', () => {
        expect(translator.bytesToHumanReadable(1099511627776)).toBe('1Ti');
        expect(translator.bytesToHumanReadable(1125899906842624)).toBe('1Pi');
      });

      it('should throw error for negative bytes', () => {
        expect(() => translator.bytesToHumanReadable(-1)).toThrow('Bytes must be non-negative');
      });
    });
  });

  describe('Configuration', () => {
    it('should get current configuration', () => {
      const config = translator.getConfig();
      
      expect(config.enableKataOverhead).toBe(false);
      expect(config.requestRatio).toBe(0.5);
      expect(config.kataOverhead.cpuMillicores).toBe(250);
      expect(config.kataOverhead.memoryBytes).toBe(268435456);
      expect(config.kataOverhead.storageBytes).toBe(104857600);
    });

    it('should update configuration', () => {
      translator.updateConfig({
        enableKataOverhead: true,
        requestRatio: 0.75,
      });

      const config = translator.getConfig();
      expect(config.enableKataOverhead).toBe(true);
      expect(config.requestRatio).toBe(0.75);
    });

    it('should update Kata overhead configuration', () => {
      translator.updateConfig({
        kataOverhead: {
          cpuMillicores: 300,
          memoryBytes: 524288000,
        },
      });

      const config = translator.getConfig();
      expect(config.kataOverhead.cpuMillicores).toBe(300);
      expect(config.kataOverhead.memoryBytes).toBe(524288000);
      // Other values should remain unchanged
      expect(config.kataOverhead.storageBytes).toBe(104857600);
    });
  });

  describe('Factory Function', () => {
    it('should create translator with default config', () => {
      const t = createResourceTranslator();
      expect(t).toBeInstanceOf(ResourceTranslator);
      expect(t.getConfig().enableKataOverhead).toBe(false);
    });

    it('should create translator with custom config', () => {
      const t = createResourceTranslator({
        enableKataOverhead: true,
        requestRatio: 0.9,
      });
      expect(t.getConfig().enableKataOverhead).toBe(true);
      expect(t.getConfig().requestRatio).toBe(0.9);
    });
  });
});
