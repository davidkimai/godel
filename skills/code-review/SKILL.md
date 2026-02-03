---
name: code-review
description: Conduct thorough code reviews to ensure code quality, maintainability, and adherence to best practices. Use when reviewing pull requests, analyzing code changes, or providing feedback on implementation approaches.
metadata:
  author: dash-team
  version: "1.0.0"
  category: quality
---

# Code Review Skill

This skill provides a structured approach to code reviews, ensuring consistent quality and actionable feedback.

## When to Use

- User asks to "review code", "check PR", or "review pull request"
- Analyzing code for bugs, security issues, or performance problems
- Providing feedback on architectural decisions
- Ensuring code follows team standards
- Mentoring developers through code feedback
- Validating test coverage

## Steps

1. Understand the context
   - Read PR description and linked issues
   - Review related documentation
   - Understand the business requirements
   - Check the scope of changes

2. Review for correctness
   - Verify logic implementation
   - Check edge cases handling
   - Validate error handling
   - Ensure proper input validation

3. Review for maintainability
   - Check code readability
   - Verify naming conventions
   - Assess function/class sizes
   - Review comments and documentation

4. Review for performance
   - Identify algorithmic complexity issues
   - Check for unnecessary computations
   - Review database query efficiency
   - Assess memory usage

5. Review for security
   - Check for injection vulnerabilities
   - Validate authentication/authorization
   - Review data sanitization
   - Check for secrets in code

6. Review for testing
   - Verify test coverage
   - Check test quality
   - Look for missing test cases
   - Validate test assertions

7. Provide constructive feedback
   - Categorize issues (blocking, major, minor)
   - Suggest improvements with examples
   - Acknowledge good practices
   - Summarize overall assessment

## Tools Available

- `read_file`: Read code files for review
- `analyze_diff`: Analyze code changes
- `check_coverage`: Verify test coverage
- `run_linter`: Check code style
- `find_bugs`: Static analysis for common issues
- `check_security`: Security vulnerability scan

## Examples

### Example 1: Review API Endpoint Changes

User: "Review this PR that adds a new user registration endpoint"

Assistant: I'll review the user registration endpoint implementation.

Input: Review PR #123 - User Registration API
Analysis:
- Files changed: 5
- Lines added: 240
- Test coverage: 78%

Findings:
✅ Good: Proper input validation using schema
✅ Good: Transaction handling for database operations
⚠️ Minor: Missing rate limiting on endpoint
❌ Major: Password logged in plaintext (line 45)
✅ Good: Comprehensive error handling

Recommendations:
1. Remove password logging immediately (security)
2. Add rate limiting middleware (100 req/min)
3. Increase test coverage to 90%+

Overall: Changes requested - fix security issue before merge

### Example 2: Quick Style Review

User: "Quick review of this refactor PR"

Assistant: I'll do a quick review focusing on style and maintainability.

Input: Review refactor PR - Extract service layer
Analysis:
- Files changed: 12
- Lines removed: 350
- Lines added: 280

Findings:
✅ Good: Clear separation of concerns
✅ Good: Consistent naming conventions
⚠️ Minor: One function exceeds 50 lines
✅ Good: Updated tests appropriately
✅ Good: Removed duplicate code

Recommendations:
1. Split `processOrder` function into smaller units
2. Add docstring to new service methods

Overall: Approved with minor suggestions

## Review Checklist

### Must Check
- [ ] No secrets or credentials in code
- [ ] Proper error handling
- [ ] Input validation present
- [ ] Tests added/updated
- [ ] No obvious security vulnerabilities

### Should Check
- [ ] Code is readable and well-named
- [ ] Functions are focused and small
- [ ] No code duplication
- [ ] Comments explain why, not what
- [ ] Documentation updated

### Nice to Check
- [ ] Performance optimizations
- [ ] Edge cases covered
- [ ] Logging appropriate
- [ ] Consistent with codebase style

## References

- [Code Review Guidelines](references/code-review-guidelines.md)
- [Security Checklist](references/security-checklist.md)
- [Performance Patterns](references/performance-patterns.md)
