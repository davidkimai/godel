import { describe, it, expect, jest, afterEach } from '@jest/globals';
import type { Request, Response } from 'express';
import {
  requireAuth,
  addApiKey,
  revokeApiKey,
  registerSessionToken,
  revokeSessionToken,
} from '../../../src/api/middleware/auth';

function createMockResponse() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json };
}

describe('auth middleware', () => {
  const trackedApiKeys: string[] = [];
  const trackedSessions: string[] = [];

  afterEach(() => {
    for (const key of trackedApiKeys.splice(0)) {
      revokeApiKey(key);
    }
    for (const token of trackedSessions.splice(0)) {
      revokeSessionToken(token);
    }
  });

  it('allows configured public routes', () => {
    const req = { path: '/health' } as Request;
    const res = createMockResponse() as unknown as Response;
    const next = jest.fn();

    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects protected route without auth', () => {
    const req = { path: '/api/v1/swarms', headers: {} } as Request;
    const res = createMockResponse() as unknown as Response;
    const next = jest.fn();

    requireAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect((res as any).status).toHaveBeenCalledWith(401);
  });

  it('accepts a valid API key on protected route', () => {
    const key = 'godel_live_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    addApiKey(key);
    trackedApiKeys.push(key);

    const req = {
      path: '/api/v1/swarms',
      headers: { 'x-api-key': key },
    } as unknown as Request;
    const res = createMockResponse() as unknown as Response;
    const next = jest.fn();

    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('accepts a valid session cookie on protected route', () => {
    const token = 'godel_session_token_test';
    registerSessionToken(token, Date.now() + 60_000);
    trackedSessions.push(token);

    const req = {
      path: '/api/v1/swarms',
      headers: {},
      cookies: { session: token },
    } as unknown as Request;
    const res = createMockResponse() as unknown as Response;
    const next = jest.fn();

    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
