/**
 * Mock for @godel/ai
 */

export const getModel = jest.fn();
export const execute = jest.fn().mockResolvedValue({
  success: true,
  response: { content: 'mock response' },
});
export const registerProvider = jest.fn();
export const modelResolver = {
  resolveModel: jest.fn().mockReturnValue({ id: 'mock-model' }),
};
export const failover = {
  execute: jest.fn(),
};
export const AVAILABLE_MODELS = [];

export class CostTracker {
  track = jest.fn();
  getReport = jest.fn().mockReturnValue({});
}

export class ModelResolver {
  resolveModel = jest.fn().mockReturnValue({ id: 'mock-model' });
}

export class ProviderFailover {
  execute = jest.fn();
}
