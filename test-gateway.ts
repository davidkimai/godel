/**
 * Test script for OpenClaw Gateway WebSocket connection
 * Tests the real gateway protocol with proper authentication
 */

import WebSocket from 'ws';
import crypto from 'crypto';
import { createHmac } from 'crypto';

const GATEWAY_URL = process.env['OPENCLAW_GATEWAY_URL'] || 'ws://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env['OPENCLAW_GATEWAY_TOKEN'] || '';

console.log('Testing OpenClaw Gateway connection...');
console.log(`URL: ${GATEWAY_URL}`);
console.log(`Token: ${GATEWAY_TOKEN ? '*** (' + GATEWAY_TOKEN.length + ' chars)' : 'NOT SET'}`);

// Store challenge for signing
let currentChallenge: { nonce: string; ts: number } | null = null;

function generateDeviceId(): string {
  // Generate a stable device ID based on hostname and user
  const hostname = require('os').hostname();
  const username = require('os').userInfo().username;
  return createHmac('sha256', 'dash-device')
    .update(`${hostname}-${username}`)
    .digest('hex')
    .substring(0, 32);
}

function generateKeypair(): { publicKey: string; privateKey: string } {
  // Generate a simple keypair for testing
  const privateKey = crypto.randomBytes(32).toString('hex');
  const publicKey = createHmac('sha256', privateKey).update('public').digest('hex');
  return { publicKey, privateKey };
}

function signWithPrivateKey(privateKey: string, message: string): string {
  // Sign the message with the private key
  return createHmac('sha256', privateKey).update(message).digest('hex');
}

function testConnectionWithoutDevice() {
  return new Promise((resolve, reject) => {
    console.log('\n=== Test 1: Connect without device identity ===');
    
    const ws = new WebSocket(GATEWAY_URL);
    
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error('Connection timeout'));
    }, 15000);

    ws.on('open', () => {
      console.log('WebSocket connected, waiting for challenge...');
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received:', JSON.stringify(message, null, 2));
        
        if (message.type === 'event' && message.event === 'connect.challenge') {
          currentChallenge = message.payload;
          
          // Try without device identity (local loopback might auto-approve)
          const connectRequest = {
            type: 'req',
            id: 'test-connect-1',
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: 'cli',
                mode: 'cli',
                platform: 'macos',
                version: '2.0.0',
              },
              role: 'operator',
              scopes: ['operator.read', 'operator.write'],
              caps: [],
              commands: [],
              permissions: {},
              auth: {
                token: GATEWAY_TOKEN,
              },
              locale: 'en-US',
              userAgent: 'dash-cli/2.0.0',
              // No device - let gateway auto-approve for local
            },
          };
          
          console.log('Sending connect request (no device):', JSON.stringify(connectRequest, null, 2));
          ws.send(JSON.stringify(connectRequest));
        }
        
        if (message.type === 'res' && message.id === 'test-connect-1') {
          clearTimeout(timeout);
          if (message.ok) {
            console.log('✅ Authentication successful without device!');
            ws.close();
            resolve(message.payload);
          } else {
            console.log('❌ Authentication failed:', message.error);
            ws.close();
            reject(new Error(`Auth failed: ${message.error?.message}`));
          }
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      console.error('WebSocket error:', error.message);
      reject(error);
    });

    ws.on('close', (code, reason) => {
      console.log(`Connection closed: ${code} ${reason}`);
    });
  });
}

function testConnectionWithDevice() {
  return new Promise((resolve, reject) => {
    console.log('\n=== Test 2: Connect with device identity ===');
    
    const ws = new WebSocket(GATEWAY_URL);
    
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error('Connection timeout'));
    }, 15000);

    ws.on('open', () => {
      console.log('WebSocket connected, waiting for challenge...');
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received:', JSON.stringify(message, null, 2));
        
        if (message.type === 'event' && message.event === 'connect.challenge') {
          currentChallenge = message.payload;
          
          const deviceId = generateDeviceId();
          const keypair = generateKeypair();
          
          // Sign the nonce with the device's private key
          const signature = signWithPrivateKey(keypair.privateKey, currentChallenge.nonce);
          
          const connectRequest = {
            type: 'req',
            id: 'test-connect-2',
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: 'cli',
                mode: 'cli',
                platform: 'macos',
                version: '2.0.0',
              },
              role: 'operator',
              scopes: ['operator.read', 'operator.write'],
              caps: [],
              commands: [],
              permissions: {},
              auth: {
                token: GATEWAY_TOKEN,
              },
              locale: 'en-US',
              userAgent: 'dash-cli/2.0.0',
              device: {
                id: deviceId,
                publicKey: keypair.publicKey,
                signature: signature,
                signedAt: Date.now(),
                nonce: currentChallenge.nonce,
              },
            },
          };
          
          console.log('Sending connect request (with device):', JSON.stringify(connectRequest, null, 2));
          ws.send(JSON.stringify(connectRequest));
        }
        
        if (message.type === 'res' && message.id === 'test-connect-2') {
          clearTimeout(timeout);
          if (message.ok) {
            console.log('✅ Authentication successful with device!');
            
            // Try sessions_list
            setTimeout(() => {
              const listRequest = {
                type: 'req',
                id: 'test-list-1',
                method: 'sessions_list',
                params: {},
              };
              console.log('Sending sessions_list request...');
              ws.send(JSON.stringify(listRequest));
            }, 500);
          } else {
            console.log('❌ Authentication failed:', message.error);
            ws.close();
            reject(new Error(`Auth failed: ${message.error?.message}`));
          }
        }
        
        if (message.type === 'res' && message.id === 'test-list-1') {
          console.log('✅ Sessions list response:', JSON.stringify(message.payload, null, 2));
          ws.close();
          resolve(message.payload);
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      console.error('WebSocket error:', error.message);
      reject(error);
    });

    ws.on('close', (code, reason) => {
      console.log(`Connection closed: ${code} ${reason}`);
    });
  });
}

// Run tests
async function main() {
  try {
    // Try without device first (local connections might auto-approve)
    await testConnectionWithoutDevice();
  } catch (error) {
    console.log('Test 1 failed, trying with device...');
    try {
      await testConnectionWithDevice();
    } catch (error2) {
      console.log('\n❌ All tests failed');
      process.exit(1);
    }
  }
}

main()
  .then(() => {
    console.log('\n✅ Gateway connection test PASSED');
    process.exit(0);
  })
  .catch((error) => {
    console.log('\n❌ Gateway connection test FAILED:', error.message);
    process.exit(1);
  });
