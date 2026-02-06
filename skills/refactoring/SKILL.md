---
name: refactoring
description: Restructure existing code to improve internal quality without changing external behavior. Use when code has technical debt, poor readability, duplication, or needs modernization. Includes code cleanup, pattern migration, and architecture improvements.
metadata:
  author: godel-team
  version: "1.0.0"
  category: maintenance
---

# Refactoring Skill

This skill provides systematic approaches to refactoring code while preserving behavior and improving maintainability.

## When to Use

- User asks to "refactor", "clean up", or "restructure code"
- Code has duplication that needs extraction
- Methods or classes are too large/complex
- Migrating to new patterns or frameworks
- Improving code readability and naming
- Breaking down tight coupling
- Modernizing legacy code
- Preparing code for testing

## Steps

1. Understand the current code
   - Read and analyze the existing implementation
   - Identify the code's responsibilities
   - Document current behavior (inputs/outputs)
   - Note any quirks or special cases

2. Ensure test coverage
   - Verify existing tests cover current behavior
   - Add characterization tests if needed
   - Run tests to establish baseline
   - Ensure tests pass before refactoring

3. Identify refactoring opportunities
   - Find code duplication
   - Spot long methods/functions
   - Identify unclear naming
   - Find tight coupling
   - Note missing abstractions

4. Plan the refactoring
   - Choose appropriate refactoring technique
   - Plan small, incremental steps
   - Identify rollback strategy
   - Estimate risk level

5. Execute refactoring
   - Make small, focused changes
   - Run tests after each change
   - Commit frequently
   - Document significant decisions

6. Verify behavior preservation
   - Run full test suite
   - Check for any behavioral changes
   - Review with static analysis
   - Performance test if needed

7. Review and improve
   - Verify code readability
   - Check for new refactoring opportunities
   - Update documentation
   - Share learnings with team

## Refactoring Techniques

### Extract Method/Function
When: Code block does one thing and has a clear name
```typescript
// Before
function processOrder(order) {
  // validate
  if (!order.items || order.items.length === 0) {
    throw new Error('Invalid order');
  }
  // calculate total
  let total = 0;
  for (const item of order.items) {
    total += item.price * item.quantity;
  }
  // ... more code
}

// After
function processOrder(order) {
  validateOrder(order);
  const total = calculateOrderTotal(order);
  // ... more code
}
```

### Rename Variable/Function
When: Name doesn't clearly describe purpose
- Be descriptive but not verbose
- Use domain terminology
- Avoid abbreviations

### Replace Conditional with Polymorphism
When: Switch statements on type codes
- Create base class/interface
- Extract each case to subclass
- Eliminate conditional logic

### Introduce Parameter Object
When: Method has many related parameters
- Group related parameters into object
- Improves readability and extensibility

### Move Method/Field
When: Feature envy - method uses more of another class
- Place behavior with data it operates on
- Reduces coupling

## Tools Available

- `analyze_code`: Identify refactoring opportunities
- `extract_method`: Safely extract code blocks
- `rename_symbol`: Rename with references update
- `inline_variable`: Replace variable with expression
- `move_method`: Relocate methods between classes
- `run_tests`: Verify behavior preservation

## Examples

### Example 1: Extract Service from Controller

User: "This controller is doing too much, refactor it"

Assistant: I'll refactor the controller by extracting business logic into a service.

Input: Refactor OrderController
Analysis:
- Current: 450 lines
- Responsibilities: validation, business logic, database, email
- Cyclomatic complexity: 24 (too high)

Refactoring Plan:
1. Extract OrderService class
2. Move validation to OrderValidator
3. Extract Email notification to OrderNotifier
4. Keep controller as thin HTTP layer

Steps:
1. Create OrderService with business logic
2. Move database operations to repository
3. Extract email logic to OrderNotifier
4. Update controller to use services
5. Run all tests - PASS
6. Verify no behavior changes

Result:
- OrderController: 450 → 80 lines
- New OrderService: 200 lines
- New OrderValidator: 60 lines
- New OrderNotifier: 70 lines
- Test coverage: 78% → 85%
- Cyclomatic complexity: 24 → 8

### Example 2: Remove Duplication

User: "These two functions look very similar"

Assistant: I'll identify and extract the common logic to remove duplication.

Input: Refactor duplicate code in payment handlers
Analysis:
Found duplication between:
- processCreditCard()
- processDebitCard()

Common code (85% similar):
- Input validation
- Fraud check
- Transaction logging
- Receipt generation

Refactoring:
1. Extract common flow to processPayment()
2. Keep card-specific logic separate
3. Use strategy pattern for card type differences

```typescript
// Before
function processCreditCard(payment) {
  validatePayment(payment);
  checkFraud(payment);
  const result = chargeCreditCard(payment);
  logTransaction(result);
  sendReceipt(result);
  return result;
}

function processDebitCard(payment) {
  validatePayment(payment);
  checkFraud(payment);
  const result = chargeDebitCard(payment);
  logTransaction(result);
  sendReceipt(result);
  return result;
}

// After
function processPayment(payment, charger) {
  validatePayment(payment);
  checkFraud(payment);
  const result = charger(payment);
  logTransaction(result);
  sendReceipt(result);
  return result;
}

// Usage
processPayment(payment, chargeCreditCard);
processPayment(payment, chargeDebitCard);
```

Result: Removed 40 lines of duplicate code

## Refactoring Checklist

### Before Starting
- [ ] Tests exist and pass
- [ ] Behavior is well understood
- [ ] Rollback plan is ready
- [ ] Time is allocated for verification

### During Refactoring
- [ ] Make small, focused changes
- [ ] Run tests frequently
- [ ] Commit after each step
- [ ] Stop if tests fail unexpectedly

### After Refactoring
- [ ] All tests pass
- [ ] No behavioral changes
- [ ] Code is more readable
- [ ] Documentation updated
- [ ] Team informed of changes

## Safety Rules

1. **Never refactor without tests** - Characterization tests are acceptable
2. **One refactoring at a time** - Don't mix behavior changes with refactoring
3. **Commit after each step** - Easy rollback if things go wrong
4. **Keep changes small** - Large refactorings are risky
5. **Stop when tests fail** - Debug before continuing

## References

- [Refactoring Patterns](references/refactoring-patterns.md)
- [Martin Fowler's Refactoring](references/fowler-refactoring.md)
- [Code Smells Catalog](references/code-smells.md)
- [Legacy Code Strategies](references/working-with-legacy.md)
