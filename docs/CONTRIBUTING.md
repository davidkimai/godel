# Contributing to Dash

First off, thank you for considering contributing to Dash! It's people like you that make Dash such a great tool.

> **Note:** This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## 🤝 Code of Conduct

This project and everyone participating in it is governed by the Dash Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the maintainers.

### Our Standards

- **Be respectful** - Treat everyone with respect. Healthy debate is encouraged, but harassment is not tolerated.
- **Be constructive** - Provide constructive feedback and be open to receiving it.
- **Be inclusive** - Welcome newcomers and help them learn. Diversity makes us stronger.
- **Be professional** - Keep discussions focused on the project and avoid off-topic debates.

## 🐛 How to Contribute

### Reporting Bugs

Before creating bug reports, please check the existing issues to see if the problem has already been reported. When you are creating a bug report, please include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples to demonstrate the steps**
- **Describe the behavior you observed and what behavior you expected**
- **Include code samples or terminal output if relevant**

```markdown
**Description:**
A clear description of the bug.

**Steps to Reproduce:**
1. Run `dash agents spawn "test"`
2. See error

**Expected Behavior:**
Agent should spawn successfully.

**Actual Behavior:**
Error: Connection refused

**Environment:**
- OS: macOS 14.0
- Node: v20.0.0
- Dash: 1.0.0
```

### Suggesting Features

Feature requests are welcome! Please provide the following information:

- **Use a clear and descriptive title**
- **Provide a step-by-step description of the suggested feature**
- **Provide specific examples to demonstrate the feature**
- **Explain why this feature would be useful**

### Contributing Documentation

Documentation improvements are always welcome! This includes:

- Fixing typos or unclear explanations
- Adding examples or tutorials
- Improving API documentation
- Translating documentation

## 🛠️ Development Setup

### Prerequisites

- Node.js 18+ 
- npm 9+ or pnpm
- Git

### Setup Steps

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/dash.git
   cd dash
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Run tests**
   ```bash
   npm test
   ```

5. **Link for local testing**
   ```bash
   npm link
   # Now you can use `dash` command globally
   ```

### Development Workflow

```bash
# Watch mode for development
npm run dev

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Type checking
npm run typecheck

# Run all quality checks
npm run quality
```

### Project Structure

```
dash/
├── src/
│   ├── cli/          # CLI command implementations
│   ├── core/         # Core orchestration logic
│   ├── agents/       # Agent management
│   ├── tasks/        # Task management
│   └── utils/        # Utilities
├── tests/            # Test files
├── docs/             # Documentation
└── dist/             # Compiled output
```

## 🔄 Pull Request Process

1. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make your changes**
   - Write clear, concise code
   - Add tests for new functionality
   - Update documentation as needed

3. **Ensure quality**
   ```bash
   npm run quality
   ```

4. **Commit your changes**
   - Follow our commit message conventions (see below)
   - Keep commits focused and atomic

5. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request**
   - Fill out the PR template completely
   - Link any related issues
   - Request review from maintainers

### PR Review Process

- All PRs require at least one review from a maintainer
- CI checks must pass before merging
- Address review feedback promptly and professionally
- Maintainers may request changes or provide feedback

## 📝 Commit Message Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `style` | Code style changes (formatting, semicolons, etc) |
| `refactor` | Code refactoring |
| `perf` | Performance improvements |
| `test` | Adding or updating tests |
| `chore` | Build process or auxiliary tool changes |

### Examples

```bash
# Feature
feat(agents): add support for custom agent templates

# Bug fix
fix(tasks): resolve race condition in task assignment

# Documentation
docs(readme): update installation instructions

# Refactoring
refactor(core): simplify agent orchestration logic

# Tests
test(quality): add tests for budget enforcement
```

### Scope

The scope should be the area of the codebase affected:

- `agents` - Agent management
- `tasks` - Task management
- `cli` - CLI commands
- `core` - Core orchestration
- `quality` - Quality checks
- `tests` - Test infrastructure
- `docs` - Documentation

## 🧪 Testing Guidelines

- Write tests for all new functionality
- Maintain or improve code coverage
- Use descriptive test names
- Follow the existing test patterns

```typescript
// Good test example
describe('AgentManager', () => {
  describe('spawn', () => {
    it('should create a new agent with the given task', async () => {
      // Test implementation
    });

    it('should throw if task is empty', async () => {
      // Test implementation
    });
  });
});
```

## 🎯 Release Process

1. Version bumps are handled by maintainers
2. Releases follow [Semantic Versioning](https://semver.org/)
3. Changelog is updated with each release

## 💬 Getting Help

- **GitHub Discussions** - For questions and ideas
- **GitHub Issues** - For bug reports and feature requests
- **Discord** - Join our community (coming soon!)

## 🙏 Thank You!

Your contributions make Dash better for everyone. We appreciate your time and effort!

---

*This contributing guide is adapted from the [Atom Contributing Guide](https://github.com/atom/atom/blob/master/CONTRIBUTING.md).*
