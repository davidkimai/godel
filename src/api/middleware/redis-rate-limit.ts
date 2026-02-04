import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { createClient } from 'redis';
import { logger } from '../../utils/logger';

// Redis client
let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient(): Promise<ReturnType<typeof createClient>> {
  if (!redisClient) {
    redisClient = createClient({
      url: process.env['REDIS_URL'] || 'redis://localhost:6379'
    });
    
    redisClient.on('error', (err) => {
      logger.error('Redis error', { error: err.message });
    });
    
    await redisClient.connect();
  }
  
  return redisClient;
}

// Rate limiter instances
const limiters: Map<string, RateLimiterRedis> = new Map();

interface RateLimitConfig {
  keyPrefix: string;
  points: number;
  duration: number;
}

// Tier configurations
const TIER_CONFIGS: Record<string, RateLimitConfig> = {
  anonymous: {
    keyPrefix: 'ratelimit:anon',
    points: 30,      // 30 requests
    duration: 60     // per minute
  },
  authenticated: {
    keyPrefix: 'ratelimit:auth',
    points: 1000,    // 1000 requests
    duration: 60     // per minute
  },
  admin: {
    keyPrefix: 'ratelimit:admin',
    points: 10000,   // 10000 requests
    duration: 60     // per minute
  }
};

async function getRateLimiter(tier: string): Promise<RateLimiterRedis> {
  if (limiters.has(tier)) {
    return limiters.get(tier)!;
  }
  
  const config = TIER_CONFIGS[tier] || TIER_CONFIGS.anonymous;
  const redis = await getRedisClient();
  
  const limiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: config.keyPrefix,
    points: config.points,
    duration: config.duration
  });
  
  limiters.set(tier, limiter);
  return limiter;
}

export async function rateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Determine tier
    let tier = 'anonymous';
    const apiKey = (request as any).apiKey;
    
    if (apiKey) {
      tier = apiKey.scopes?.includes('admin') ? 'admin' : 'authenticated';
    }
    
    // Create key based on IP + tier
    const ip = request.ip;
    const key = `${tier}:${ip}`;
    
    const limiter = await getRateLimiter(tier);
    const result = await limiter.consume(key);
    
    // Set rate limit headers
    reply.header('X-RateLimit-Limit', limiter.points);
    reply.header('X-RateLimit-Remaining', result.remainingPoints);
    reply.header('X-RateLimit-Reset', new Date(Date.now() + result.msBeforeNext));
    reply.header('X-RateLimit-Tier', tier);
    
  } catch (rejRes) {
    // Rate limit exceeded
    const msBeforeNext = (rejRes as any).msBeforeNext || 60000;
    const retryAfter = Math.ceil(msBeforeNext / 1000);
    
    logger.warn('Rate limit exceeded', { 
      ip: request.ip,
      path: request.url 
    });
    
    reply
      .header('Retry-After', retryAfter)
      .header('X-RateLimit-Remaining', 0)
      .status(429)
      .send({
        error: 'Too many requests',
        retryAfter
      });
  }
}

// Graceful shutdown
export async function shutdownRateLimiters(): Promise<void> {
  limiters.clear();
  
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
  
  logger.info('Rate limiters shutdown');
}
