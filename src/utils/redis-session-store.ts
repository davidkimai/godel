import { logger } from '../integrations/utils/logger';
import Redis from 'ioredis';

// Redis client for sessions
let redisClient: Redis | null = null;

async function getRedisClient(): Promise<Redis> {
  if (!redisClient) {
    redisClient = new Redis(process.env['REDIS_URL'] || 'redis://localhost:6379');
    
    redisClient.on('error', (err: Error) => {
      logger.error('Redis session error', { error: err.message });
    });
    
    await redisClient.connect();
  }
  
  return redisClient;
}

export interface SessionData {
  id: string;
  userId: string;
  data: Record<string, any>;
  createdAt: Date;
  expiresAt: Date;
}

export class RedisSessionStore {
  private keyPrefix = 'session:';
  private defaultTtl = 24 * 60 * 60; // 24 hours

  async create(userId: string, data: Record<string, any> = {}): Promise<SessionData> {
    const redis = await getRedisClient();
    
    const session: SessionData = {
      id: this.generateSessionId(),
      userId,
      data,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.defaultTtl * 1000)
    };

    const key = this.keyPrefix + session.id;
    await redis.setex(
      key,
      this.defaultTtl,
      JSON.stringify(session)
    );

    logger.debug('Session created', { sessionId: session.id, userId });
    return session;
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const redis = await getRedisClient();
    
    const key = this.keyPrefix + sessionId;
    const data = await redis.get(key);
    
    if (!data) {
      return null;
    }

    const session: SessionData = JSON.parse(data);
    
    // Check expiration
    if (new Date(session.expiresAt) < new Date()) {
      await this.destroy(sessionId);
      return null;
    }

    return session;
  }

  async update(sessionId: string, data: Record<string, any>): Promise<void> {
    const redis = await getRedisClient();
    
    const existing = await this.get(sessionId);
    if (!existing) {
      throw new Error('Session not found');
    }

    const updated = {
      ...existing,
      data: { ...existing.data, ...data }
    };

    const key = this.keyPrefix + sessionId;
    const ttl = Math.floor((new Date(existing.expiresAt).getTime() - Date.now()) / 1000);
    
    await redis.setex(key, Math.max(ttl, 60), JSON.stringify(updated));
    
    logger.debug('Session updated', { sessionId });
  }

  async destroy(sessionId: string): Promise<void> {
    const redis = await getRedisClient();
    
    const key = this.keyPrefix + sessionId;
    await redis.del(key);
    
    logger.debug('Session destroyed', { sessionId });
  }

  async getUserSessions(userId: string): Promise<SessionData[]> {
    // Note: In production, you'd use Redis SCAN or maintain a user:sessions index
    // For now, this is a placeholder
    logger.warn('getUserSessions not fully implemented - requires Redis SCAN');
    return [];
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  async shutdown(): Promise<void> {
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
      logger.info('Redis session store shutdown');
    }
  }
}

// Singleton
let store: RedisSessionStore | null = null;

export function getRedisSessionStore(): RedisSessionStore {
  if (!store) {
    store = new RedisSessionStore();
  }
  return store;
}
