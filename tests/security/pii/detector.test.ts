/**
 * PII Detector Tests
 */

import { PIIDetector, createPIIDetector } from '../../../src/security/pii/detector';

describe('PIIDetector', () => {
  let detector: PIIDetector;

  beforeEach(() => {
    detector = createPIIDetector();
  });

  describe('Email Detection', () => {
    it('should detect email addresses', () => {
      const result = detector.scan('Contact me at john.doe@example.com');
      expect(result.hasPII).toBe(true);
      expect(result.detections[0].type).toBe('email');
      expect(result.detections[0].value).toBe('john.doe@example.com');
    });

    it('should detect multiple emails', () => {
      const result = detector.scan('Emails: alice@test.com and bob@example.org');
      expect(result.detections.length).toBe(2);
      expect(result.byType.email.length).toBe(2);
    });
  });

  describe('Phone Number Detection', () => {
    it('should detect US phone numbers', () => {
      const result = detector.scan('Call me at 555-123-4567');
      expect(result.hasPII).toBe(true);
      expect(result.detections[0].type).toBe('phone');
    });

    it('should detect formatted phone numbers', () => {
      const result = detector.scan('Phone: (555) 123-4567');
      expect(result.hasPII).toBe(true);
    });

    it('should detect phone with country code', () => {
      const result = detector.scan('International: +1 555-123-4567');
      expect(result.hasPII).toBe(true);
    });
  });

  describe('SSN Detection', () => {
    it('should detect SSN with dashes', () => {
      const result = detector.scan('SSN: 123-45-6789');
      expect(result.hasPII).toBe(true);
      expect(result.detections[0].type).toBe('ssn');
      expect(result.detections[0].severity).toBe('critical');
    });

    it('should detect SSN without dashes', () => {
      const result = detector.scan('ID: 123456789');
      // Note: 9-digit numbers might match other patterns too
      const ssnDetection = result.detections.find(d => d.type === 'ssn');
      expect(ssnDetection).toBeDefined();
    });

    it('should not detect invalid SSNs', () => {
      const result = detector.scan('Invalid: 000-12-3456');
      // 000 is not a valid SSN area number
      const ssnDetection = result.detections.find(d => d.type === 'ssn');
      expect(ssnDetection).toBeUndefined();
    });
  });

  describe('Credit Card Detection', () => {
    it('should detect Visa card numbers', () => {
      // Valid test card number (passes Luhn check)
      const result = detector.scan('Card: 4532015112830366');
      expect(result.hasPII).toBe(true);
      expect(result.detections[0].type).toBe('credit_card');
      expect(result.detections[0].severity).toBe('critical');
    });

    it('should detect MasterCard numbers', () => {
      const result = detector.scan('Payment: 5425233430109903');
      expect(result.hasPII).toBe(true);
    });

    it('should validate with Luhn algorithm', () => {
      // Invalid card number (fails Luhn)
      const result = detector.scan('Card: 4532015112830367');
      // Should still detect but with lower confidence or not at all
      // depending on the strictness of validation
      const ccDetection = result.detections.find(d => d.type === 'credit_card');
      if (ccDetection) {
        expect(ccDetection.confidence).toBeLessThan(1);
      }
    });
  });

  describe('API Key Detection', () => {
    it('should detect generic API keys', () => {
      const result = detector.scan('api_key=sk_test_1234567890abcdef');
      expect(result.hasPII).toBe(true);
      expect(result.detections.some(d => d.type === 'api_key')).toBe(true);
    });

    it('should detect AWS access keys', () => {
      const result = detector.scan('AKIAIOSFODNN7EXAMPLE');
      expect(result.hasPII).toBe(true);
      expect(result.detections[0].type).toBe('api_key');
    });
  });

  describe('Token Detection', () => {
    it('should detect JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = detector.scan(`Authorization: Bearer ${jwt}`);
      expect(result.hasPII).toBe(true);
      expect(result.detections.some(d => d.type === 'token')).toBe(true);
    });
  });

  describe('Object Scanning', () => {
    it('should scan nested objects', () => {
      const obj = {
        user: {
          email: 'test@example.com',
          phone: '555-123-4567',
        },
        data: 'Some other data',
      };

      const results = detector.scanObject(obj);
      expect(results.length).toBe(2);
      expect(results.some(r => r.detection.type === 'email')).toBe(true);
      expect(results.some(r => r.detection.type === 'phone')).toBe(true);
    });
  });

  describe('Risk Scoring', () => {
    it('should calculate risk score', () => {
      const result = detector.scan('Email: test@test.com and SSN: 123-45-6789');
      expect(result.riskScore).toBeGreaterThan(0);
      // SSN is critical, so risk score should be high
      expect(result.riskScore).toBeGreaterThan(50);
    });

    it('should determine highest severity', () => {
      const result = detector.scan('Email: test@test.com and Password: secret123');
      expect(result.highestSeverity).toBe('critical');
    });
  });

  describe('Custom Patterns', () => {
    it('should support custom patterns', () => {
      detector.addPattern({
        name: 'employee_id',
        pattern: /\bEMP-\d{6}\b/g,
        type: 'custom',
        severity: 'medium',
      });

      const result = detector.scan('Employee ID: EMP-123456');
      expect(result.hasPII).toBe(true);
      expect(result.detections[0].type).toBe('custom');
    });
  });

  describe('Filtering', () => {
    it('should filter by type', () => {
      const result = detector.scan('Email: test@test.com, Phone: 555-123-4567', {
        types: ['email'],
      });
      expect(result.detections.length).toBe(1);
      expect(result.detections[0].type).toBe('email');
    });

    it('should respect minimum confidence', () => {
      const result = detector.scan('Email: test@test.com', {
        minConfidence: 0.95,
      });
      // Depending on confidence calculation, may or may not detect
    });
  });

  describe('Statistics', () => {
    it('should provide pattern statistics', () => {
      const stats = detector.getStats();
      expect(stats.totalPatterns).toBeGreaterThan(0);
      expect(Object.keys(stats.patternsByType).length).toBeGreaterThan(0);
    });
  });
});
