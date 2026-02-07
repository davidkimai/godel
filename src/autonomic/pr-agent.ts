/**
 * PR Agent
 * 
 * Submits fixes as pull requests to the repository.
 * Handles branch creation, commit, and PR creation.
 */

import { logger } from '../utils/logger';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  PRTask,
  PRResult,
  PRAgent as IPRAgent,
  GitService,
  GitHubAPI,
} from './types';

// ============================================================================
// Git Service Implementation
// ============================================================================

class LocalGitService implements GitService {
  async checkoutBranch(branch: string): Promise<void> {
    try {
      // Try to checkout existing branch
      execSync(`git checkout ${branch}`, { stdio: 'pipe' });
    } catch {
      // Branch doesn't exist, create it
      execSync(`git checkout -b ${branch}`, { stdio: 'pipe' });
    }
  }

  async writeFile(file: string, content: string): Promise<void> {
    writeFileSync(file, content, 'utf-8');
  }

  async add(file: string): Promise<void> {
    execSync(`git add "${file}"`, { stdio: 'pipe' });
  }

  async commit(message: string): Promise<void> {
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
  }

  async push(branch: string): Promise<void> {
    try {
      execSync(`git push -u origin ${branch}`, { stdio: 'pipe' });
    } catch (error) {
      logger.warn('autonomic-pr-agent', `Push may have failed: ${error}`);
      throw error;
    }
  }
}

// ============================================================================
// GitHub API Implementation
// ============================================================================

class GitHubCLI implements GitHubAPI {
  async createPullRequest(options: {
    title: string;
    body: string;
    head: string;
    base: string;
    labels?: string[];
  }): Promise<{ number: number; html_url: string }> {
    try {
      // Check if gh CLI is available
      execSync('which gh', { stdio: 'pipe' });
      
      let cmd = `gh pr create --title "${options.title.replace(/"/g, '\\"')}" --body "${options.body.replace(/"/g, '\\"')}" --head "${options.head}" --base "${options.base}"`;
      
      if (options.labels && options.labels.length > 0) {
        cmd += ` --label "${options.labels.join(',')}"`;
      }
      
      const result = execSync(cmd, { 
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      
      // Extract PR URL from output
      const urlMatch = result.match(/(https:\/\/github\.com\/[^\s]+)/);
      const prUrl = urlMatch ? urlMatch[1] : '';
      
      // Extract PR number from URL
      const numberMatch = prUrl.match(/\/pull\/(\d+)$/);
      const prNumber = numberMatch ? parseInt(numberMatch[1], 10) : 0;
      
      return {
        number: prNumber,
        html_url: prUrl,
      };
    } catch (error) {
      logger.error('autonomic-pr-agent', `Failed to create PR: ${error}`);
      throw new Error(`GitHub PR creation failed: ${error}`);
    }
  }
}

// ============================================================================
// PR Agent Implementation
// ============================================================================

export class PRAgent implements IPRAgent {
  private git: GitService;
  private github: GitHubAPI;

  constructor(git?: GitService, github?: GitHubAPI) {
    this.git = git || new LocalGitService();
    this.github = github || new GitHubCLI();
  }

  async submitFix(task: PRTask): Promise<PRResult> {
    logger.info('autonomic-pr-agent', `📤 Submitting PR for fix ${task.fix.id}`);

    const branchName = task.branch || `autonomic/fix-${task.fix.errorId.slice(0, 8)}`;
    
    // Store original branch to return to
    let originalBranch: string;
    try {
      originalBranch = execSync('git branch --show-current', { 
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();
    } catch {
      originalBranch = 'main';
    }

    try {
      // Create branch
      logger.debug('autonomic-pr-agent', `Creating branch: ${branchName}`);
      await this.git.checkoutBranch(branchName);

      // Apply changes
      for (const change of task.fix.fileChanges) {
        logger.debug('autonomic-pr-agent', `Writing file: ${change.file}`);
        await this.git.writeFile(change.file, change.modified);
        await this.git.add(change.file);
      }

      // Commit
      const commitMessage = this.buildCommitMessage(task);
      logger.debug('autonomic-pr-agent', 'Creating commit');
      await this.git.commit(commitMessage);

      // Push
      logger.debug('autonomic-pr-agent', `Pushing to origin/${branchName}`);
      await this.git.push(branchName);

      // Create PR
      logger.debug('autonomic-pr-agent', 'Creating pull request');
      const pr = await this.github.createPullRequest({
        title: `🤖 Autonomic Fix: ${this.truncate(task.error.message, 50)}`,
        body: this.buildPRBody(task),
        head: branchName,
        base: 'main',
        labels: ['autonomic', 'bug-fix', 'auto-generated'],
      });

      logger.info('autonomic-pr-agent', `✅ PR created: ${pr.html_url}`);

      return {
        prNumber: pr.number,
        prUrl: pr.html_url,
        branch: branchName,
      };
    } catch (error) {
      logger.error('autonomic-pr-agent', `PR submission failed: ${error}`);
      throw error;
    } finally {
      // Return to original branch
      try {
        execSync(`git checkout ${originalBranch}`, { stdio: 'ignore' });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private buildCommitMessage(task: PRTask): string {
    const lines = [
      `fix: ${this.truncate(task.error.message, 72)}`,
      '',
      'Autonomic fix generated by Godel Maintenance Team.',
      '',
      `Error ID: ${task.fix.errorId}`,
      `Error Type: ${task.error.errorType}`,
      '',
      'Changes:',
      ...task.fix.fileChanges.map(c => `- ${c.file}`),
    ];
    
    return lines.join('\n');
  }

  private buildPRBody(task: PRTask): string {
    const changesSection = task.fix.fileChanges.map(c => {
      const fileName = c.file;
      const diffIndented = c.diff.split('\n').map(line => '    ' + line).join('\n');
      return [
        `- ${'`'}${fileName}${'`'}`,
        '  - Diff:',
        '    ```diff',
        diffIndented,
        '    ```',
      ].join('\n');
    }).join('\n');

    return `## 🤖 Autonomic Bug Fix

This PR was automatically generated by the Godel Maintenance Team to fix a detected error.

### Error Details
| Field | Value |
|-------|-------|
| **Error ID** | ${task.fix.errorId} |
| **Error Type** | ${task.error.errorType} |
| **Source** | ${task.error.source} |
| **Severity** | ${task.error.severity} |

### Error Message
\`\`\`
${task.error.message}
\`\`\`

### Fix Description
${task.fix.description}

### Files Changed
${changesSection}

### Verification
- [x] Reproduction test created
- [x] Fix resolves the error
- [x] Test passes after fix
- [ ] Human review completed

### Testing
To verify this fix:
\`\`\`bash
# Checkout the branch
git checkout ${task.branch || `autonomic/fix-${task.fix.errorId.slice(0, 8)}`}

# Run the reproduction test
npm test -- --testPathPattern="${task.fix.errorId.slice(0, 8)}"
\`\`\`

---
*This PR was created by [Godel-on-Godel](https://github.com/davidkimai/godel/blob/main/src/autonomic/). Please review carefully before merging.*`;
  }

  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
  }
}

export default PRAgent;
