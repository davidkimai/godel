"use strict";
/**
 * PostgreSQL Connection Pool
 *
 * Manages database connections with retry logic for transient failures.
 * Uses pg-pool for connection management.
 * Reads configuration from the centralized config system.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresPool = void 0;
exports.getPool = getPool;
exports.resetPool = resetPool;
const logger_1 = require("../../utils/logger");
const config_1 = require("../../config");
/**
 * Convert Dash database config to pool config
 */
function toPoolConfig(config) {
    // Parse the connection URL if provided
    let parsedUrl = null;
    try {
        parsedUrl = new URL(config.url);
    }
    catch {
        // Use individual settings if URL parsing fails
    }
    if (parsedUrl) {
        return {
            host: parsedUrl.hostname,
            port: parseInt(parsedUrl.port, 10) || 5432,
            database: parsedUrl.pathname.slice(1),
            user: decodeURIComponent(parsedUrl.username),
            password: decodeURIComponent(parsedUrl.password),
            poolSize: config.poolSize,
            minPoolSize: config.minPoolSize,
            maxPoolSize: config.maxPoolSize,
            connectionTimeoutMs: config.connectionTimeoutMs,
            idleTimeoutMs: config.idleTimeoutMs,
            acquireTimeoutMs: config.acquireTimeoutMs,
            retryAttempts: config.retryAttempts,
            retryDelayMs: config.retryDelayMs,
            ssl: config.ssl,
        };
    }
    return {
        host: 'localhost',
        port: 5432,
        database: 'dash',
        user: 'dash',
        password: 'dash',
        poolSize: config.poolSize,
        minPoolSize: config.minPoolSize,
        maxPoolSize: config.maxPoolSize,
        connectionTimeoutMs: config.connectionTimeoutMs,
        idleTimeoutMs: config.idleTimeoutMs,
        acquireTimeoutMs: config.acquireTimeoutMs,
        retryAttempts: config.retryAttempts,
        retryDelayMs: config.retryDelayMs,
        ssl: config.ssl,
    };
}
class PostgresPool {
    constructor(config) {
        this.pool = null;
        this.isConnected = false;
        this.reconnectTimer = null;
        // Will be set in initialize()
        this.config = config;
    }
    /**
     * Initialize the connection pool with retry logic
     */
    async initialize() {
        // Load configuration if not provided
        if (!this.config) {
            const dashConfig = await (0, config_1.getConfig)();
            this.config = toPoolConfig(dashConfig.database);
        }
        let attempts = 0;
        const maxAttempts = this.config.retryAttempts;
        while (attempts < maxAttempts) {
            try {
                await this.connect();
                this.isConnected = true;
                logger_1.logger.info(`PostgreSQL connected (pool: ${this.config.minPoolSize}-${this.config.maxPoolSize})`);
                return;
            }
            catch (error) {
                attempts++;
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (attempts >= maxAttempts) {
                    logger_1.logger.error(`Failed to connect to PostgreSQL after ${maxAttempts} attempts: ${errorMessage}`);
                    throw new Error(`Database connection failed: ${errorMessage}`);
                }
                logger_1.logger.warn(`PostgreSQL connection attempt ${attempts}/${maxAttempts} failed, retrying in ${this.config.retryDelayMs}ms...`);
                await this.delay(this.config.retryDelayMs);
            }
        }
    }
    /**
     * Create and connect the pool
     */
    async connect() {
        const { default: PgPool } = await Promise.resolve().then(() => __importStar(require('pg-pool')));
        const { Client } = await Promise.resolve().then(() => __importStar(require('pg')));
        this.pool = new PgPool({
            host: this.config.host,
            port: this.config.port,
            database: this.config.database,
            user: this.config.user,
            password: this.config.password,
            min: this.config.minPoolSize,
            max: this.config.maxPoolSize,
            idleTimeoutMillis: this.config.idleTimeoutMs,
            connectionTimeoutMillis: this.config.connectionTimeoutMs,
            ssl: this.config.ssl,
            Client: Client,
        });
        // Set up event handlers
        this.pool.on('error', (err) => {
            logger_1.logger.error('Unexpected PostgreSQL pool error:', err.message);
            this.isConnected = false;
            this.scheduleReconnect();
        });
        this.pool.on('connect', () => {
            this.isConnected = true;
        });
        // Test the connection
        const client = await this.pool.connect();
        try {
            await client.query('SELECT 1');
        }
        finally {
            client.release();
        }
    }
    /**
     * Schedule a reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectTimer)
            return;
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            try {
                await this.initialize();
            }
            catch (error) {
                logger_1.logger.error('Reconnection attempt failed');
            }
        }, this.config.retryDelayMs);
    }
    /**
     * Execute a query with automatic retry for transient failures
     */
    async query(text, params, retryOptions) {
        if (!this.pool) {
            throw new Error('Pool not initialized. Call initialize() first.');
        }
        const maxAttempts = retryOptions?.attempts ?? 3;
        const delayMs = retryOptions?.delayMs ?? 500;
        let attempts = 0;
        while (attempts < maxAttempts) {
            try {
                const result = await this.pool.query(text, params);
                return {
                    rows: result.rows,
                    rowCount: result.rowCount || 0,
                };
            }
            catch (error) {
                attempts++;
                // Only retry on transient errors
                if (this.isTransientError(error) && attempts < maxAttempts) {
                    logger_1.logger.warn(`Query failed with transient error, retrying (${attempts}/${maxAttempts})...`);
                    await this.delay(delayMs * attempts); // Exponential backoff
                    continue;
                }
                throw error;
            }
        }
        throw new Error('Query failed after max retries');
    }
    /**
     * Get a client from the pool for transaction handling
     */
    async getClient() {
        if (!this.pool) {
            throw new Error('Pool not initialized. Call initialize() first.');
        }
        return this.pool.connect();
    }
    /**
     * Execute a transaction with automatic rollback on error
     */
    async withTransaction(callback) {
        const client = await this.getClient();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK').catch(() => { }); // Ignore rollback errors
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * Check if error is transient and retryable
     */
    isTransientError(error) {
        if (!(error instanceof Error))
            return false;
        const transientCodes = [
            'ECONNRESET',
            'ETIMEDOUT',
            'ECONNREFUSED',
            '08000', // connection_exception
            '08003', // connection_does_not_exist
            '08006', // connection_failure
            '40001', // serialization_failure
            '40P01', // deadlock_detected
            '55P03', // lock_not_available
        ];
        const code = error.code;
        return transientCodes.includes(code || '') ||
            transientCodes.some(c => error.message.includes(c));
    }
    /**
     * Get pool statistics
     */
    getStats() {
        return {
            total: this.pool?.totalCount || 0,
            idle: this.pool?.idleCount || 0,
            waiting: this.pool?.waitingCount || 0,
            isConnected: this.isConnected,
        };
    }
    /**
     * Check if pool is healthy
     */
    async healthCheck() {
        if (!this.pool) {
            return { healthy: false, message: 'Pool not initialized' };
        }
        try {
            const client = await this.pool.connect();
            try {
                await client.query('SELECT 1');
                return { healthy: true };
            }
            finally {
                client.release();
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { healthy: false, message };
        }
    }
    /**
     * Close the pool gracefully
     */
    async close() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.isConnected = false;
            logger_1.logger.info('PostgreSQL pool closed');
        }
    }
    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.PostgresPool = PostgresPool;
// Singleton instance
let globalPool = null;
let initializationPromise = null;
/**
 * Get or create the global PostgreSQL pool
 */
async function getPool(config) {
    if (globalPool?.getStats().isConnected) {
        return globalPool;
    }
    if (initializationPromise) {
        return initializationPromise;
    }
    initializationPromise = (async () => {
        globalPool = new PostgresPool(config);
        await globalPool.initialize();
        return globalPool;
    })();
    return initializationPromise;
}
/**
 * Reset the global pool (useful for testing)
 */
async function resetPool() {
    if (globalPool) {
        await globalPool.close();
        globalPool = null;
    }
    initializationPromise = null;
}
exports.default = PostgresPool;
