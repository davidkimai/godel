/**
 * Validation Module Tests
 *
 * Comprehensive tests for the validation module including:
 * - validate() function
 * - validateSafe() function
 * - validatePartial() function
 * - ValidationError class
 * - NotFoundError class
 */

import { z } from 'zod';
import {
  validate,
  validateSafe,
  validatePartial,
  ValidationError,
  NotFoundError,
} from '../../src/validation/index';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Validation Module', () => {
  describe('validate()', () => {
    const testSchema = z.object({
      name: z.string().min(1),
      age: z.number().int().positive(),
      email: z.string().email(),
    });

    it('should validate valid data', () => {
      const data = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
      };

      const result = validate(testSchema, data);

      expect(result).toEqual(data);
    });

    it('should throw ValidationError for invalid data', () => {
      const data = {
        name: '',
        age: -5,
        email: 'invalid-email',
      };

      expect(() => validate(testSchema, data)).toThrow(ValidationError);
    });

    it('should include detailed issues in ValidationError', () => {
      const data = {
        name: '',
        age: -5,
        email: 'invalid',
      };

      try {
        validate(testSchema, data);
        fail('Expected ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.issues).toBeDefined();
        expect(error.issues.length).toBeGreaterThan(0);
        expect(error.statusCode).toBe(400);
      }
    });

    it('should handle nested object validation', () => {
      const nestedSchema = z.object({
        user: z.object({
          profile: z.object({
            name: z.string(),
          }),
        }),
      });

      const data = {
        user: {
          profile: {
            name: 'John',
          },
        },
      };

      const result = validate(nestedSchema, data);
      expect(result.user.profile.name).toBe('John');
    });

    it('should handle array validation', () => {
      const arraySchema = z.object({
        tags: z.array(z.string()).min(1),
      });

      const data = { tags: ['tag1', 'tag2'] };
      const result = validate(arraySchema, data);

      expect(result.tags).toHaveLength(2);
    });

    it('should handle optional fields', () => {
      const optionalSchema = z.object({
        name: z.string(),
        description: z.string().optional(),
      });

      const dataWithoutOptional = { name: 'Test' };
      const dataWithOptional = { name: 'Test', description: 'Desc' };

      expect(validate(optionalSchema, dataWithoutOptional)).toEqual(dataWithoutOptional);
      expect(validate(optionalSchema, dataWithOptional)).toEqual(dataWithOptional);
    });
  });

  describe('validateSafe()', () => {
    const testSchema = z.object({
      id: z.string().uuid(),
      count: z.number().int(),
    });

    it('should return success result for valid data', () => {
      const data = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        count: 42,
      };

      const result = validateSafe(testSchema, data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(data);
      }
    });

    it('should return error result for invalid data', () => {
      const data = {
        id: 'not-a-uuid',
        count: 'not-a-number',
      };

      const result = validateSafe(testSchema, data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toBeDefined();
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it('should not throw on invalid data', () => {
      const data = { id: 'invalid' };

      expect(() => validateSafe(testSchema, data)).not.toThrow();
    });
  });

  describe('validatePartial()', () => {
    const testSchema = z.object({
      name: z.string().min(1),
      age: z.number().positive(),
      email: z.string().email(),
    });

    it('should validate partial updates', () => {
      const partialData = {
        name: 'Updated Name',
      };

      const result = validatePartial(testSchema, partialData);

      expect(result.name).toBe('Updated Name');
    });

    it('should allow multiple fields in partial update', () => {
      const partialData = {
        name: 'John',
        age: 25,
      };

      const result = validatePartial(testSchema, partialData);

      expect(result.name).toBe('John');
      expect(result.age).toBe(25);
    });

    it('should throw for invalid partial data', () => {
      const invalidData = {
        age: -5,
      };

      expect(() => validatePartial(testSchema, invalidData)).toThrow(ValidationError);
    });

    it('should return empty object for empty input', () => {
      const result = validatePartial(testSchema, {});

      expect(result).toEqual({});
    });
  });

  describe('ValidationError', () => {
    it('should create error with message and issues', () => {
      const issues = [
        { path: 'name', message: 'Required' },
        { path: 'age', message: 'Must be positive' },
      ];

      const error = new ValidationError('Validation failed', issues);

      expect(error.message).toBe('Validation failed');
      expect(error.issues).toEqual(issues);
      expect(error.statusCode).toBe(400);
    });

    it('should allow custom status code', () => {
      const error = new ValidationError('Validation failed', [], 422);

      expect(error.statusCode).toBe(422);
    });

    it('should serialize to JSON correctly', () => {
      const issues = [{ path: 'email', message: 'Invalid email' }];
      const error = new ValidationError('Validation failed', issues);

      const json = error.toJSON();

      expect(json).toEqual({
        error: 'ValidationError',
        message: 'Validation failed',
        issues,
      });
    });

    it('should have correct name property', () => {
      const error = new ValidationError('Test', []);

      expect(error.name).toBe('ValidationError');
    });
  });

  describe('NotFoundError', () => {
    it('should create error with resource and id', () => {
      const error = new NotFoundError('User', '123');

      expect(error.resource).toBe('User');
      expect(error.id).toBe('123');
      expect(error.message).toBe('User not found: 123');
    });

    it('should have correct name property', () => {
      const error = new NotFoundError('Agent', 'abc');

      expect(error.name).toBe('NotFoundError');
    });

    it('should handle different resource types', () => {
      const resources = ['Agent', 'Swarm', 'Session', 'Task'];

      resources.forEach((resource) => {
        const error = new NotFoundError(resource, 'test-id');
        expect(error.resource).toBe(resource);
        expect(error.message).toContain(resource);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle null data', () => {
      const schema = z.object({ name: z.string() });

      expect(() => validate(schema, null)).toThrow(ValidationError);
    });

    it('should handle undefined data', () => {
      const schema = z.object({ name: z.string() });

      expect(() => validate(schema, undefined)).toThrow(ValidationError);
    });

    it('should handle empty object', () => {
      const schema = z.object({ name: z.string().optional() });

      const result = validate(schema, {});
      expect(result).toEqual({});
    });

    it('should handle complex nested schemas', () => {
      const complexSchema = z.object({
        user: z.object({
          profile: z.object({
            settings: z.object({
              notifications: z.boolean(),
            }),
          }),
        }),
        metadata: z.record(z.unknown()),
      });

      const data = {
        user: {
          profile: {
            settings: {
              notifications: true,
            },
          },
        },
        metadata: { key: 'value' },
      };

      const result = validate(complexSchema, data);
      expect(result.user.profile.settings.notifications).toBe(true);
    });

    it('should provide correct path in nested validation errors', () => {
      const nestedSchema = z.object({
        level1: z.object({
          level2: z.object({
            value: z.number(),
          }),
        }),
      });

      const data = {
        level1: {
          level2: {
            value: 'not-a-number',
          },
        },
      };

      try {
        validate(nestedSchema, data);
        fail('Expected ValidationError');
      } catch (error) {
        if (error instanceof ValidationError) {
          const pathIssue = error.issues.find((i) => i.path.includes('value'));
          expect(pathIssue).toBeDefined();
          expect(pathIssue?.path).toContain('level1');
          expect(pathIssue?.path).toContain('level2');
        }
      }
    });
  });
});
