---
name: deployment
description: Automate deployment workflows for web applications, APIs, and services. Use when deploying to production, staging, or development environments. Handles version management, health checks, rollback procedures, and deployment verification.
metadata:
  author: godel-team
  version: "1.0.0"
  category: devops
---

# Deployment Skill

This skill provides comprehensive deployment automation for various platforms and environments.

## When to Use

- User asks to "deploy", "ship", "release", or "push to production"
- Setting up CI/CD pipelines
- Managing multi-environment deployments (dev, staging, prod)
- Need to rollback a failed deployment
- Verifying deployment health and status
- Configuring deployment environments

## Steps

1. Analyze deployment requirements
   - Target environment (dev/staging/production)
   - Application type (web/API/service)
   - Current version and desired version
   - Dependencies and prerequisites

2. Pre-deployment checks
   - Verify all tests pass
   - Check deployment permissions
   - Ensure database migrations are ready
   - Verify environment variables are configured

3. Prepare deployment package
   - Build application artifacts
   - Generate changelog from commits
   - Tag release version
   - Upload to artifact repository

4. Execute deployment
   - Deploy to target environment
   - Run database migrations
   - Update load balancer configuration
   - Verify deployment success

5. Post-deployment verification
   - Run smoke tests
   - Check application health endpoints
   - Monitor error rates
   - Verify critical functionality

6. Handle rollback if needed
   - Identify failure conditions
   - Execute rollback procedure
   - Verify rollback success
   - Document incident

## Tools Available

- `check_status`: Check current deployment status
- `deploy_service`: Deploy service to environment
- `run_tests`: Execute pre-deployment tests
- `verify_deployment`: Post-deployment health checks
- `rollback`: Revert to previous version
- `generate_changelog`: Create release notes

## Examples

### Example 1: Deploy API to Production

User: "Deploy the user-service API to production"

Assistant: I'll deploy the user-service API to production following our deployment workflow.

Input: deploy user-service to production
Steps:
1. Run tests - PASSED
2. Build Docker image - user-service:v2.3.1
3. Deploy to staging - SUCCESS
4. Run smoke tests - PASSED
5. Deploy to production - SUCCESS
6. Verify health check - PASSED
Output: Successfully deployed user-service v2.3.1 to production

### Example 2: Rollback Failed Deployment

User: "The payment service is failing, roll it back"

Assistant: I'll immediately rollback the payment service to the last known good version.

Input: rollback payment-service
Steps:
1. Check current deployment - v3.0.0 (failing)
2. Identify last stable version - v2.9.4
3. Execute rollback - In progress
4. Verify rollback success - Health check passed
5. Monitor error rates - Normal
Output: Successfully rolled back payment-service to v2.9.4

## Best Practices

- Always deploy to staging first
- Never deploy on Fridays without approval
- Keep rollback window under 5 minutes
- Document all deployment changes
- Monitor metrics for 30 minutes post-deployment

## References

- [Deployment Checklist](references/deployment-checklist.md)
- [Rollback Procedures](references/rollback-procedures.md)
- [Environment Configuration](references/environments.md)
