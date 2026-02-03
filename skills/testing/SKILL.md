---
name: testing
description: Design and implement comprehensive test strategies including unit tests, integration tests, and end-to-end tests. Use when creating test suites, improving test coverage, debugging test failures, or establishing testing patterns.
metadata:
  author: dash-team
  version: "1.0.0"
  category: quality
---

# Testing Skill

This skill provides structured approaches to testing software at all levels, from unit tests to end-to-end scenarios.

## When to Use

- User asks to "write tests", "add test coverage", or "create test suite"
- Debugging failing tests
- Setting up testing frameworks and infrastructure
- Designing test strategies for new features
- Refactoring to improve testability
- Analyzing test coverage reports
- Creating test data and fixtures

## Steps

1. Analyze the code under test
   - Understand the functionality
   - Identify boundaries and interfaces
   - Note dependencies and side effects
   - Determine test pyramid distribution

2. Design test cases
   - Happy path scenarios
   - Error and edge cases
   - Boundary value analysis
   - State transitions (if applicable)

3. Set up test environment
   - Configure test framework
   - Set up test database/fixtures
   - Mock external dependencies
   - Configure test runners

4. Write unit tests
   - Test one thing per test
   - Use descriptive test names
   - Follow Arrange-Act-Assert pattern
   - Mock external dependencies

5. Write integration tests
   - Test component interactions
   - Verify database operations
   - Test API contracts
   - Check message queue handling

6. Write end-to-end tests (if needed)
   - Test complete user flows
   - Verify UI interactions
   - Test critical business scenarios
   - Keep E2E tests minimal

7. Ensure test quality
   - Verify test independence
   - Check for flakiness
   - Ensure fast execution
   - Validate meaningful assertions

## Tools Available

- `generate_tests`: Auto-generate test cases
- `run_tests`: Execute test suite
- `check_coverage`: Analyze code coverage
- `mock_dependencies`: Create test doubles
- `debug_test`: Investigate test failures
- `benchmark`: Performance test functions

## Examples

### Example 1: Write Unit Tests for Service

User: "Write unit tests for the payment processing service"

Assistant: I'll create comprehensive unit tests for the payment service.

Input: Test payment service
Steps:
1. Analyze payment service methods
   - processPayment()
   - refundPayment()
   - validateCard()

2. Generate test cases
   processPayment:
   - Valid payment succeeds
   - Insufficient funds fails
   - Invalid card number fails
   - Expired card fails
   - Network error retries

   refundPayment:
   - Valid refund succeeds
   - Already refunded fails
   - Non-existent transaction fails

3. Write tests
   ```typescript
   describe('PaymentService', () => {
     describe('processPayment', () => {
       it('should process valid payment successfully', async () => {
         // Arrange
         const payment = createValidPayment();
         mockPaymentGateway.success();
         
         // Act
         const result = await service.processPayment(payment);
         
         // Assert
         expect(result.status).toBe('success');
         expect(result.transactionId).toBeDefined();
       });
       
       it('should reject payment with insufficient funds', async () => {
         const payment = createValidPayment();
         mockPaymentGateway.insufficientFunds();
         
         await expect(service.processPayment(payment))
           .rejects.toThrow(InsufficientFundsError);
       });
       // ... more tests
     });
   });
   ```

4. Coverage: 94% statements, 91% branches

Output: Created 15 unit tests with 94% coverage

### Example 2: Debug Failing Test

User: "This test is flaky and sometimes fails in CI"

Assistant: I'll investigate the flaky test to identify and fix the root cause.

Input: Debug flaky test - user-registration.test.ts
Analysis:
- Test: "should send welcome email after registration"
- Failure rate: ~20%
- Error: Timeout waiting for email service

Investigation:
1. Check test implementation
   - Uses real email service (problematic)
   - No timeout configuration
   - Depends on network

2. Root cause
   - External dependency not mocked
   - Async operation timing issues
   - No retry logic

Fix:
1. Mock email service
2. Use fake timers for async assertions
3. Add explicit timeout (5s)
4. Verify async completion

Result: Test now passes consistently (100 runs)

## Testing Principles

### AAA Pattern
- **Arrange**: Set up preconditions and inputs
- **Act**: Execute the code under test
- **Assert**: Verify the expected outcomes

### F.I.R.S.T. Principles
- **Fast**: Tests should run quickly
- **Independent**: No test should depend on another
- **Repeatable**: Same results every time
- **Self-validating**: Pass/fail without interpretation
- **Timely**: Write tests before or with code

### Test Pyramid
- 70% Unit tests (fast, isolated)
- 20% Integration tests (service boundaries)
- 10% E2E tests (critical paths only)

## Common Patterns

### Testing Async Code
```typescript
// Use async/await
it('should fetch data', async () => {
  const result = await service.fetchData();
  expect(result).toEqual(expected);
});

// Use fake timers for timeouts
jest.useFakeTimers();
it('should timeout', () => {
  const promise = service.fetchWithTimeout();
  jest.advanceTimersByTime(5000);
  expect(promise).rejects.toThrow('Timeout');
});
```

### Mocking Dependencies
```typescript
// Mock external services
jest.mock('./email-service');

// Partial mocks
jest.spyOn(service, 'method').mockResolvedValue(mockData);

// Restore after test
afterEach(() => jest.restoreAllMocks());
```

## References

- [Testing Best Practices](references/testing-best-practices.md)
- [Mocking Guide](references/mocking-guide.md)
- [Test Data Factories](references/test-factories.md)
- [CI/CD Testing](references/ci-testing.md)
