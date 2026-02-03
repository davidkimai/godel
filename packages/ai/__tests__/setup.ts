/**
 * Jest Setup File
 */

// Set longer timeout for API tests
jest.setTimeout(30000);

// Load environment variables for tests
if (process.env.ANTHROPIC_API_KEY) {
  console.log('✓ ANTHROPIC_API_KEY available');
} else {
  console.log('✗ ANTHROPIC_API_KEY not set - API tests will be skipped');
}

if (process.env.OPENAI_API_KEY) {
  console.log('✓ OPENAI_API_KEY available');
} else {
  console.log('✗ OPENAI_API_KEY not set - OpenAI tests will be skipped');
}

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment to suppress specific log levels during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  error: console.error, // Keep errors visible
};
