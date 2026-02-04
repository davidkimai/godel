"use strict";
/**
 * Redis Fallback System
 *
 * Provides resilient Redis operations with automatic fallback to in-memory storage
 * when Redis is unavailable. Features:
 * - Automatic failover to in-memory cache
 * - Event queuing for replay when Redis recovers
 * - Health monitoring and auto-recovery detection
 * - Graceful degradation without data loss
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisFallback = exports.FallbackState = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const events_1 = require("events");
const logger_1 = require("../utils/logger");
var FallbackState;
(function (FallbackState) {
    FallbackState["CONNECTED"] = "connected";
    FallbackState["FALLBACK"] = "fallback";
    FallbackState["RECOVERING"] = "recovering";
    FallbackState["DISCONNECTED"] = "disconnected";
})(FallbackState || (exports.FallbackState = FallbackState = {}));
class RedisFallback extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.redis = null;
        this.state = FallbackState.DISCONNECTED;
        this.eventQueue = [];
        this.inMemoryCache = new Map();
        this.memoryExpiry = new Map();
        this.stats = {
            replayedEvents: 0,
            droppedEvents: 0,
            failedConnections: 0,
        };
        this.lastError = null;
        this.lastRecovery = null;
        this.config = {
            redis: config.redis,
            fallbackEnabled: config.fallbackEnabled ?? true,
            maxQueueSize: config.maxQueueSize ?? 10000,
            recoveryCheckIntervalMs: config.recoveryCheckIntervalMs ?? 5000,
            connectionTimeoutMs: config.connectionTimeoutMs ?? 5000,
            replayBatchSize: config.replayBatchSize ?? 100,
        };
    }
    /**
     * Initialize the Redis connection with fallback
     */
    async initialize() {
        await this.connect();
        this.startRecoveryMonitoring();
    }
    /**
     * Connect to Redis with fallback handling
     */
    async connect() {
        if (this.redis) {
            await this.redis.quit().catch(() => { });
        }
        this.redis = new ioredis_1.default({
            ...this.config.redis,
            retryStrategy: (times) => {
                const delay = Math.min(times * 100, 3000);
                if (times > 3) {
                    this.enterFallbackMode('Connection failed after 3 retries');
                    return null; // Stop retrying
                }
                return delay;
            },
            connectTimeout: this.config.connectionTimeoutMs,
            maxRetriesPerRequest: 3,
        });
        this.setupEventHandlers();
        try {
            await this.redis.ping();
            this.state = FallbackState.CONNECTED;
            this.lastError = null;
            this.emit('connected');
            logger_1.logger.info('Redis fallback: Connected to Redis');
            // Replay queued events if any
            await this.replayQueuedEvents();
        }
        catch (error) {
            this.stats.failedConnections++;
            this.enterFallbackMode(error.message);
        }
    }
    /**
     * Set up Redis event handlers
     */
    setupEventHandlers() {
        if (!this.redis)
            return;
        this.redis.on('connect', () => {
            if (this.state === FallbackState.FALLBACK) {
                this.attemptRecovery();
            }
        });
        this.redis.on('error', (error) => {
            this.lastError = error.message;
            if (this.state === FallbackState.CONNECTED) {
                this.enterFallbackMode(error.message);
            }
        });
        this.redis.on('close', () => {
            if (this.state === FallbackState.CONNECTED) {
                this.enterFallbackMode('Connection closed');
            }
        });
    }
    /**
     * Enter fallback mode
     */
    enterFallbackMode(reason) {
        if (this.state === FallbackState.FALLBACK)
            return;
        this.state = FallbackState.FALLBACK;
        this.lastError = reason;
        this.emit('fallback', reason);
        logger_1.logger.warn('Redis fallback: Entering fallback mode', { reason });
    }
    /**
     * Attempt to recover Redis connection
     */
    async attemptRecovery() {
        if (this.state !== FallbackState.FALLBACK)
            return;
        this.state = FallbackState.RECOVERING;
        logger_1.logger.info('Redis fallback: Attempting recovery...');
        try {
            if (this.redis) {
                await this.redis.ping();
                this.state = FallbackState.CONNECTED;
                this.lastRecovery = new Date();
                this.lastError = null;
                this.emit('recovered');
                logger_1.logger.info('Redis fallback: Recovered successfully');
                await this.replayQueuedEvents();
            }
        }
        catch (error) {
            this.state = FallbackState.FALLBACK;
            logger_1.logger.warn('Redis fallback: Recovery failed', { error: error.message });
        }
    }
    /**
     * Start background recovery monitoring
     */
    startRecoveryMonitoring() {
        if (!this.config.fallbackEnabled)
            return;
        this.recoveryCheckInterval = setInterval(async () => {
            if (this.state === FallbackState.FALLBACK) {
                await this.attemptRecovery();
            }
        }, this.config.recoveryCheckIntervalMs);
    }
    /**
     * Replay queued events when Redis is available
     */
    async replayQueuedEvents() {
        if (!this.redis || this.eventQueue.length === 0)
            return;
        const batch = this.eventQueue.splice(0, this.config.replayBatchSize);
        logger_1.logger.info(`Redis fallback: Replaying ${batch.length} events`);
        for (const event of batch) {
            try {
                await this.redis.publish(event.channel, event.message);
                this.stats.replayedEvents++;
            }
            catch (error) {
                // Put back in queue if it fails
                event.attempts++;
                if (event.attempts < 3) {
                    this.eventQueue.unshift(event);
                }
                else {
                    this.stats.droppedEvents++;
                    logger_1.logger.error('Redis fallback: Dropping event after max retries', { eventId: event.id });
                }
            }
        }
        // Continue replaying if more events exist
        if (this.eventQueue.length > 0) {
            setImmediate(() => this.replayQueuedEvents());
        }
    }
    /**
     * Get a value from Redis or fallback cache
     */
    async get(key) {
        if (this.state === FallbackState.CONNECTED && this.redis) {
            try {
                return await this.redis.get(key);
            }
            catch {
                // Fall through to memory cache
            }
        }
        // Check memory cache
        const value = this.inMemoryCache.get(key);
        const expiry = this.memoryExpiry.get(key);
        if (value && expiry && Date.now() < expiry) {
            return value;
        }
        // Expired or not found
        this.inMemoryCache.delete(key);
        this.memoryExpiry.delete(key);
        return null;
    }
    /**
     * Set a value in Redis with fallback to memory cache
     */
    async set(key, value, ttlSeconds) {
        if (this.state === FallbackState.CONNECTED && this.redis) {
            try {
                if (ttlSeconds) {
                    await this.redis.setex(key, ttlSeconds, value);
                }
                else {
                    await this.redis.set(key, value);
                }
                return;
            }
            catch {
                // Fall through to memory cache
            }
        }
        // Store in memory cache
        this.inMemoryCache.set(key, value);
        if (ttlSeconds) {
            this.memoryExpiry.set(key, Date.now() + (ttlSeconds * 1000));
        }
    }
    /**
     * Delete a key from Redis and memory cache
     */
    async del(key) {
        if (this.state === FallbackState.CONNECTED && this.redis) {
            try {
                await this.redis.del(key);
            }
            catch {
                // Continue to clean memory cache
            }
        }
        this.inMemoryCache.delete(key);
        this.memoryExpiry.delete(key);
    }
    /**
     * Publish an event with queueing for replay
     */
    async publish(channel, message) {
        if (this.state === FallbackState.CONNECTED && this.redis) {
            try {
                await this.redis.publish(channel, message);
                return;
            }
            catch {
                // Fall through to queue
            }
        }
        if (!this.config.fallbackEnabled) {
            throw new Error('Redis unavailable and fallback disabled');
        }
        // Queue for later replay
        if (this.eventQueue.length >= this.config.maxQueueSize) {
            this.stats.droppedEvents++;
            this.eventQueue.shift(); // Remove oldest
        }
        const event = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            channel,
            message,
            timestamp: Date.now(),
            attempts: 0,
        };
        this.eventQueue.push(event);
        this.emit('queued', event);
    }
    /**
     * Execute a Redis command with automatic fallback
     */
    async execute(operation, fallback) {
        if (this.state === FallbackState.CONNECTED && this.redis) {
            try {
                return await operation(this.redis);
            }
            catch (error) {
                logger_1.logger.warn('Redis fallback: Operation failed, using fallback', { error: error.message });
            }
        }
        return fallback;
    }
    /**
     * Get current fallback statistics
     */
    getStats() {
        return {
            isConnected: this.state === FallbackState.CONNECTED,
            isInFallbackMode: this.state === FallbackState.FALLBACK,
            queuedEvents: this.eventQueue.length,
            replayedEvents: this.stats.replayedEvents,
            droppedEvents: this.stats.droppedEvents,
            failedConnections: this.stats.failedConnections,
            lastError: this.lastError,
            lastRecovery: this.lastRecovery,
        };
    }
    /**
     * Get current connection state
     */
    getState() {
        return this.state;
    }
    /**
     * Force recovery attempt
     */
    async forceRecovery() {
        await this.attemptRecovery();
        return this.state === FallbackState.CONNECTED;
    }
    /**
     * Shutdown the fallback system
     */
    async shutdown() {
        if (this.recoveryCheckInterval) {
            clearInterval(this.recoveryCheckInterval);
        }
        if (this.redis) {
            await this.redis.quit().catch(() => { });
        }
        this.removeAllListeners();
        logger_1.logger.info('Redis fallback: Shutdown complete');
    }
}
exports.RedisFallback = RedisFallback;
exports.default = RedisFallback;
