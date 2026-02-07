/**
 * Security Setup Example
 * 
 * Demonstrates authentication, authorization, and security features.
 */

import { GodelClient } from '@jtan15010/godel';

async function main() {
  const client = new GodelClient({
    baseUrl: process.env.GODEL_URL || 'http://localhost:7373',
    apiKey: process.env.GODEL_API_KEY
  });

  console.log('🚀 Security Setup Example\n');

  try {
    // 1. Generate API key
    console.log('1. Generating API key...');
    const apiKey = await client.auth.generateApiKey({
      name: 'example-key',
      role: 'developer',
      expiresIn: '30d'
    });
    console.log(`   ✓ Key ID: ${apiKey.id}`);
    console.log(`   Token: ${apiKey.token.substring(0, 20)}...`);
    console.log(`   Expires: ${apiKey.expiresAt}`);

    // 2. List API keys
    console.log('2. Listing API keys...');
    const keys = await client.auth.listApiKeys();
    for (const key of keys) {
      console.log(`   - ${key.id}: ${key.name} (${key.role})`);
    }

    // 3. Create custom role
    console.log('3. Creating custom role...');
    await client.auth.createRole({
      name: 'example-role',
      permissions: [
        'agents:read',
        'agents:write',
        'tasks:read',
        'tasks:write',
        'teams:read'
      ],
      restrictions: {
        maxAgents: 5,
        maxTeams: 2,
        allowedModels: ['claude-sonnet-4-5'],
        budgetLimit: 50.00
      }
    });
    console.log('   ✓ Role created');

    // 4. Assign role to key
    console.log('4. Assigning role to API key...');
    await client.auth.assignRole({
      apiKeyId: apiKey.id,
      role: 'example-role'
    });
    console.log('   ✓ Role assigned');

    // 5. Configure rate limits
    console.log('5. Configuring rate limits...');
    await client.config.setRateLimits({
      default: {
        requestsPerMinute: 60,
        tokensPerHour: 100000
      },
      byRole: {
        admin: { requestsPerMinute: 1000 },
        developer: { requestsPerMinute: 100 },
        'example-role': { requestsPerMinute: 50 }
      }
    });
    console.log('   ✓ Rate limits configured');

    // 6. Store secrets
    console.log('6. Storing secrets...');
    await client.secrets.set({
      name: 'EXAMPLE_API_KEY',
      value: 'sk-example-secret-key-123',
      scope: 'global'
    });
    console.log('   ✓ Secret stored');

    // Verify secret is not exposed
    const secretValue = await client.secrets.get('EXAMPLE_API_KEY');
    console.log(`   Retrieved: ${secretValue ? '***masked***' : 'not found'}`);

    // 7. Query audit logs
    console.log('7. Querying audit logs...');
    const auditLogs = await client.audit.query({
      since: '1h',
      limit: 5
    });
    
    console.log(`   Found ${auditLogs.length} audit entries`);
    for (const log of auditLogs) {
      console.log(`   [${log.timestamp}] ${log.action} by ${log.userId}`);
    }

    // 8. Configure content filters
    console.log('8. Configuring content filters...');
    await client.security.configureFilters({
      input: {
        piiDetection: true,
        blocklist: ['password', 'secret', 'api_key'],
        maxLength: 10000
      },
      output: {
        piiMasking: true,
        logSanitization: true
      }
    });
    console.log('   ✓ Content filters configured');

    // 9. Run security scan
    console.log('9. Running security scan...');
    const scan = await client.security.scan({
      rules: ['secrets', 'vulnerabilities'],
      scope: 'quick'
    });
    
    console.log(`   Scan complete: ${scan.issues.length} issues found`);
    for (const issue of scan.issues.slice(0, 3)) {
      console.log(`   [${issue.severity}] ${issue.message}`);
    }

    // 10. Create secure agent
    console.log('10. Creating secure agent...');
    const secureAgent = await client.agents.spawn({
      role: 'worker',
      model: 'claude-sonnet-4-5',
      security: {
        secrets: ['EXAMPLE_API_KEY'],
        sandbox: true,
        networkPolicy: 'restricted'
      }
    });
    console.log(`   ✓ Secure agent created: ${secureAgent.id}`);

    // 11. Validate input
    console.log('11. Testing input validation...');
    try {
      await client.tasks.create({
        title: 'Test task',
        input: {
          email: 'invalid-email',
          age: -5
        },
        validation: {
          schema: {
            type: 'object',
            properties: {
              email: { type: 'string', format: 'email' },
              age: { type: 'integer', minimum: 0 }
            },
            required: ['email']
          }
        }
      });
    } catch (error: any) {
      console.log(`   ✓ Validation caught error: ${error.message.substring(0, 50)}...`);
    }

    // 12. Clean up
    console.log('12. Cleaning up...');
    await client.auth.revokeApiKey(apiKey.id);
    await client.auth.deleteRole('example-role');
    await client.secrets.delete('EXAMPLE_API_KEY');
    await client.agents.terminate(secureAgent.id);
    console.log('   ✓ Security resources cleaned up');

    console.log('\n✅ Example completed successfully!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
