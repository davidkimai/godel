/**
 * Simple test for the GatewayClient
 */

import { GatewayClient } from './src/integrations/openclaw/GatewayClient';

async function test() {
  console.log('Testing GatewayClient connection...\n');

  const client = new GatewayClient(
    {
      host: '127.0.0.1',
      port: 18789,
      token: process.env['OPENCLAW_GATEWAY_TOKEN'],
    },
    {
      autoReconnect: true,
      subscriptions: ['agent', 'chat', 'presence', 'tick'],
    }
  );

  // Listen for events
  client.on('authenticated', (payload: unknown) => {
    console.log('✅ Authenticated!');
    const p = payload as Record<string, unknown>;
    const server = p['server'] as Record<string, string> | undefined;
    console.log('Server version:', server?.['version']);
    console.log('Connection ID:', server?.['connId']);
  });

  client.on('error', (error: unknown) => {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  });

  try {
    console.log('1. Connecting to gateway...');
    await client.connect();
    
    console.log('2. Connected! Testing sessions_list...');
    const sessions = await client.sessionsList();
    console.log('3. Sessions:', sessions.length, 'found');
    
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

test();
