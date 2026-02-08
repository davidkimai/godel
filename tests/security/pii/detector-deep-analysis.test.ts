/**
 * Comprehensive PII Detection Analysis Tests
 * Deep testing of all PII patterns, edge cases, and known issues
 */

import { PIIDetector, createPIIDetector } from '../../../src/security/pii/detector';

describe('PII Detection Deep Analysis', () => {
  let detector: PIIDetector;

  beforeEach(() => {
    detector = createPIIDetector();
  });

  // Store results for report generation
  const testResults: any = {
    summary: { totalTests: 0, passed: 0, failed: 0 },
    byType: {},
    failures: [],
  };

  afterAll(() => {
    // Calculate summary statistics
    const accuracy = testResults.summary.totalTests > 0 
      ? ((testResults.summary.passed / testResults.summary.totalTests) * 100).toFixed(1)
      : '0.0';
    
    console.log('\n' + '═'.repeat(70));
    console.log('PII DETECTION DEEP ANALYSIS RESULTS');
    console.log('═'.repeat(70));
    console.log(`Total tests: ${testResults.summary.totalTests}`);
    console.log(`Passed: ${testResults.summary.passed}`);
    console.log(`Failed: ${testResults.summary.failed}`);
    console.log(`Accuracy: ${accuracy}%`);
    console.log('═'.repeat(70));
  });

  describe('SSN Format Testing', () => {
    const ssnTests = [
      { name: 'Standard with dashes', input: 'SSN: 123-45-6789', shouldDetect: true },
      { name: 'With spaces', input: 'ID: 123 45 6789', shouldDetect: true },
      { name: 'With dots', input: 'Tax ID: 123.45.6789', shouldDetect: true },
      { name: 'Without dashes', input: 'ID: 123456789', shouldDetect: true },
      { name: 'Without dashes (different number)', input: 'SSN 987654321', shouldDetect: true },
      { name: 'Invalid: 000 area', input: '000-12-3456', shouldDetect: false },
      { name: 'Invalid: 00 group', input: '123-00-4567', shouldDetect: false },
      { name: 'Invalid: 0000 serial', input: '123-45-0000', shouldDetect: false },
      { name: 'Invalid: 666 area', input: '666-12-3456', shouldDetect: false },
      { name: 'Invalid: 9xx area', input: '900-12-3456', shouldDetect: false },
      { name: 'Invalid: 999 area', input: '999-12-3456', shouldDetect: false },
    ];

    ssnTests.forEach(({ name, input, shouldDetect }) => {
      it(`${name}: "${input}"`, () => {
        const result = detector.scan(input);
        const ssnDetected = result.detections.some(d => d.type === 'ssn');
        
        testResults.summary.totalTests++;
        if (ssnDetected === shouldDetect) {
          testResults.summary.passed++;
        } else {
          testResults.summary.failed++;
          testResults.failures.push({
            type: 'ssn',
            test: name,
            input,
            expected: shouldDetect ? 'detected' : 'not detected',
            actual: ssnDetected ? 'detected' : 'not detected',
          });
        }
        
        expect(ssnDetected).toBe(shouldDetect);
      });
    });
  });

  describe('Credit Card Format Testing', () => {
    // Valid test card numbers (pass Luhn check)
    const validVisa = '4532015112830366';
    const validMasterCard = '5425233430109903';
    const validAmex = '374245455400126';
    const validDiscover = '6011514433546201';
    const invalidCard = '4532015112830367'; // Fails Luhn

    const ccTests = [
      { name: 'Visa (valid)', input: `Card: ${validVisa}`, cardType: 'credit_card' },
      { name: 'MasterCard (valid)', input: `Payment: ${validMasterCard}`, cardType: 'credit_card' },
      { name: 'Amex (valid)', input: `Card: ${validAmex}`, cardType: 'credit_card' },
      { name: 'Discover (valid)', input: `Card: ${validDiscover}`, cardType: 'credit_card' },
      { name: 'Invalid (fails Luhn)', input: `Card: ${invalidCard}`, cardType: null },
      { name: 'Visa with spaces', input: '4532 0151 1283 0366', cardType: 'credit_card' },
      { name: 'Visa with dashes', input: '4532-0151-1283-0366', cardType: 'credit_card' },
    ];

    ccTests.forEach(({ name, input, cardType }) => {
      it(`${name}: should detect as ${cardType || 'nothing'}`, () => {
        const result = detector.scan(input);
        const detection = result.detections[0];
        
        testResults.summary.totalTests++;
        
        if (cardType === null) {
          // Should not detect anything
          if (result.detections.length === 0) {
            testResults.summary.passed++;
          } else {
            testResults.summary.failed++;
            testResults.failures.push({
              type: 'credit_card',
              test: name,
              input,
              expected: 'no detection',
              actual: `detected as ${detection?.type}`,
            });
          }
          expect(result.detections.length).toBe(0);
        } else {
          // Should detect as credit_card
          if (detection?.type === cardType) {
            testResults.summary.passed++;
          } else {
            testResults.summary.failed++;
            testResults.failures.push({
              type: 'credit_card',
              test: name,
              input,
              expected: cardType,
              actual: detection?.type || 'not detected',
            });
          }
          expect(detection?.type).toBe(cardType);
        }
      });
    });

    it('should prioritize credit_card over bank_account for valid cards', () => {
      const input = `Card: ${validVisa}`;
      const result = detector.scan(input);
      
      testResults.summary.totalTests++;
      
      // Should detect as credit_card, NOT bank_account
      const hasCreditCard = result.detections.some(d => d.type === 'credit_card');
      const hasBankAccount = result.detections.some(d => d.type === 'bank_account');
      
      if (hasCreditCard && !hasBankAccount) {
        testResults.summary.passed++;
      } else {
        testResults.summary.failed++;
        testResults.failures.push({
          type: 'credit_card',
          test: 'Priority over bank_account',
          input,
          expected: 'credit_card only',
          actual: hasBankAccount ? 'detected as bank_account' : 'not detected',
        });
      }
      
      expect(hasCreditCard).toBe(true);
      expect(hasBankAccount).toBe(false);
    });
  });

  describe('Email Format Testing', () => {
    const emailTests = [
      { name: 'Standard', input: 'john.doe@example.com', shouldDetect: true },
      { name: 'With plus', input: 'user+tag@example.com', shouldDetect: true },
      { name: 'With numbers', input: 'user123@test456.org', shouldDetect: true },
      { name: 'Subdomain', input: 'admin@mail.company.co.uk', shouldDetect: true },
      { name: 'Long TLD', input: 'user@site.museum', shouldDetect: true },
      { name: 'Invalid: no @', input: 'invalid.email.com', shouldDetect: false },
      { name: 'Invalid: no domain', input: 'user@', shouldDetect: false },
      { name: 'Invalid: no local', input: '@example.com', shouldDetect: false },
    ];

    emailTests.forEach(({ name, input, shouldDetect }) => {
      it(`${name}: "${input}"`, () => {
        const result = detector.scan(input);
        const emailDetected = result.detections.some(d => d.type === 'email');
        
        testResults.summary.totalTests++;
        if (emailDetected === shouldDetect) {
          testResults.summary.passed++;
        } else {
          testResults.summary.failed++;
          testResults.failures.push({
            type: 'email',
            test: name,
            input,
            expected: shouldDetect ? 'detected' : 'not detected',
            actual: emailDetected ? 'detected' : 'not detected',
          });
        }
        
        expect(emailDetected).toBe(shouldDetect);
      });
    });
  });

  describe('Phone Number Format Testing', () => {
    const phoneTests = [
      { name: 'Standard with dashes', input: '555-123-4567', shouldDetect: true },
      { name: 'With dots', input: '555.123.4567', shouldDetect: true },
      { name: 'With spaces', input: '555 123 4567', shouldDetect: true },
      { name: 'Formatted (555)', input: '(555) 123-4567', shouldDetect: true },
      { name: 'With +1 country code', input: '+1 555-123-4567', shouldDetect: true },
      { name: 'With +1 no space', input: '+15551234567', shouldDetect: true },
      { name: 'With 1 prefix', input: '1-555-123-4567', shouldDetect: true },
    ];

    phoneTests.forEach(({ name, input, shouldDetect }) => {
      it(`${name}: "${input}"`, () => {
        const result = detector.scan(input);
        const phoneDetected = result.detections.some(d => d.type === 'phone');
        
        testResults.summary.totalTests++;
        if (phoneDetected === shouldDetect) {
          testResults.summary.passed++;
        } else {
          testResults.summary.failed++;
          testResults.failures.push({
            type: 'phone',
            test: name,
            input,
            expected: shouldDetect ? 'detected' : 'not detected',
            actual: phoneDetected ? 'detected' : 'not detected',
          });
        }
        
        expect(phoneDetected).toBe(shouldDetect);
      });
    });
  });

  describe('Bank Account Testing', () => {
    const bankTests = [
      { name: '8 digits', input: 'Account: 12345678', shouldDetect: true },
      { name: '10 digits', input: 'Account: 1234567890', shouldDetect: true },
      { name: '12 digits', input: 'Account: 123456789012', shouldDetect: true },
      { name: '17 digits', input: 'Account: 12345678901234567', shouldDetect: true },
      { name: '7 digits (too short)', input: 'ID: 1234567', shouldDetect: false },
      { name: '18 digits (too long)', input: 'ID: 123456789012345678', shouldDetect: false },
    ];

    bankTests.forEach(({ name, input, shouldDetect }) => {
      it(`${name}: "${input}"`, () => {
        const result = detector.scan(input);
        const bankDetected = result.detections.some(d => d.type === 'bank_account');
        
        testResults.summary.totalTests++;
        if (bankDetected === shouldDetect) {
          testResults.summary.passed++;
        } else {
          testResults.summary.failed++;
          testResults.failures.push({
            type: 'bank_account',
            test: name,
            input,
            expected: shouldDetect ? 'detected' : 'not detected',
            actual: bankDetected ? 'detected' : 'not detected',
          });
        }
        
        expect(bankDetected).toBe(shouldDetect);
      });
    });
  });

  describe('False Positive Testing', () => {
    const falsePositiveTests = [
      { name: 'Regular 5-digit number', input: 'The number is 12345', types: [] },
      { name: 'Year', input: 'Year: 2024', types: [] },
      { name: 'Small number', input: 'Count: 123', types: [] },
      { name: 'Version string', input: 'Version 1.2.3.4', types: ['ip_address'] },
      { name: 'Long order number', input: 'Order #123456789012', types: ['bank_account'] },
    ];

    falsePositiveTests.forEach(({ name, input, types }) => {
      it(`${name}: "${input}"`, () => {
        const result = detector.scan(input);
        const detectedTypes = result.detections.map(d => d.type);
        
        testResults.summary.totalTests++;
        
        // Check if only expected types are detected
        const unexpected = detectedTypes.filter(t => !types.includes(t));
        const missing = types.filter(t => !detectedTypes.includes(t));
        
        if (unexpected.length === 0 && missing.length === 0) {
          testResults.summary.passed++;
        } else {
          testResults.summary.failed++;
          testResults.failures.push({
            type: 'false_positive',
            test: name,
            input,
            expected: types.join(', ') || 'none',
            actual: detectedTypes.join(', ') || 'none',
          });
        }
        
        expect(unexpected).toEqual([]);
      });
    });
  });

  describe('Severity and Risk Scoring', () => {
    it('should assign correct severity levels', () => {
      const testCases = [
        { input: 'test@example.com', type: 'email', expectedSeverity: 'medium' },
        { input: 'SSN: 123-45-6789', type: 'ssn', expectedSeverity: 'critical' },
        { input: 'Card: 4532015112830366', type: 'credit_card', expectedSeverity: 'critical' },
        { input: 'password: secret123', type: 'password', expectedSeverity: 'critical' },
        { input: '192.168.1.1', type: 'ip_address', expectedSeverity: 'low' },
      ];

      testCases.forEach(({ input, type, expectedSeverity }) => {
        const result = detector.scan(input);
        const detection = result.detections.find(d => d.type === type);
        
        testResults.summary.totalTests++;
        
        if (detection?.severity === expectedSeverity) {
          testResults.summary.passed++;
        } else {
          testResults.summary.failed++;
          testResults.failures.push({
            type: 'severity',
            test: `${type} severity`,
            input,
            expected: expectedSeverity,
            actual: detection?.severity || 'not detected',
          });
        }
        
        expect(detection?.severity).toBe(expectedSeverity);
      });
    });

    it('should calculate appropriate risk scores', () => {
      const testCases = [
        { input: 'Hello world', expectedRisk: 0 },
        { input: 'Contact: test@example.com', minRisk: 10, maxRisk: 50 },
        { input: 'SSN: 123-45-6789', minRisk: 50, maxRisk: 100 },
        { input: 'Email: test@test.com, Password: secret', minRisk: 60, maxRisk: 100 },
      ];

      testCases.forEach(({ input, expectedRisk, minRisk, maxRisk }) => {
        const result = detector.scan(input);
        
        testResults.summary.totalTests++;
        
        let passed = false;
        if (expectedRisk !== undefined) {
          passed = result.riskScore === expectedRisk;
        } else if (minRisk !== undefined && maxRisk !== undefined) {
          passed = result.riskScore >= minRisk && result.riskScore <= maxRisk;
        }
        
        if (passed) {
          testResults.summary.passed++;
        } else {
          testResults.summary.failed++;
          testResults.failures.push({
            type: 'risk_score',
            test: 'Risk score calculation',
            input,
            expected: expectedRisk !== undefined ? String(expectedRisk) : `${minRisk}-${maxRisk}`,
            actual: String(result.riskScore),
          });
        }
        
        if (expectedRisk !== undefined) {
          expect(result.riskScore).toBe(expectedRisk);
        } else if (minRisk !== undefined && maxRisk !== undefined) {
          expect(result.riskScore).toBeGreaterThanOrEqual(minRisk);
          expect(result.riskScore).toBeLessThanOrEqual(maxRisk);
        }
      });
    });
  });

  describe('API Key and Token Detection', () => {
    const tokenTests = [
      { name: 'Generic API key', input: 'api_key=sk_test_1234567890abcdef', type: 'api_key' },
      { name: 'AWS Access Key', input: 'AKIAIOSFODNN7EXAMPLE', type: 'api_key' },
      { name: 'GitHub token', input: 'ghp_1234567890abcdef1234567890abcdef123456', type: 'token' },
      { name: 'Slack token', input: 'xoxb-1234567890123-1234567890123-abc123', type: 'token' },
      { name: 'JWT token', input: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c', type: 'token' },
    ];

    tokenTests.forEach(({ name, input, type }) => {
      it(`${name}: should detect as ${type}`, () => {
        const result = detector.scan(input);
        const detection = result.detections.find(d => d.type === type);
        
        testResults.summary.totalTests++;
        
        if (detection) {
          testResults.summary.passed++;
        } else {
          testResults.summary.failed++;
          testResults.failures.push({
            type: 'token',
            test: name,
            input,
            expected: type,
            actual: result.detections.map(d => d.type).join(', ') || 'not detected',
          });
        }
        
        expect(detection).toBeDefined();
      });
    });
  });
});
