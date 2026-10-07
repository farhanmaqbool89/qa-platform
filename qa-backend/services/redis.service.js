const Redis = require('ioredis');

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.init();
  }

  init() {
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = Number(process.env.REDIS_PORT) || 6379;
    const password = process.env.REDIS_PASSWORD || undefined;

    try {
      this.client = new Redis({
        host,
        port,
        password,
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        connectTimeout: 2000,
        retryStrategy(times) {
          if (times > 3) {
            return null; // Stop retrying after 3 attempts
          }
          return Math.min(times * 500, 2000);
        }
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        console.log(`[REDIS-SERVICE] ✅ Connected to Redis cluster at ${host}:${port}`);
      });

      this.client.on('error', (err) => {
        if (process.env.NODE_ENV === 'production') {
          console.error('[REDIS-SERVICE] 🚨 FATAL: Could not connect to Redis server in production mode:', err.message);
          process.exit(1);
        }
        if (this.isConnected) {
          console.warn('[REDIS-SERVICE] ⚠️ Redis connection error:', err.message);
        }
        this.isConnected = false;
      });
    } catch (e) {
      if (process.env.NODE_ENV === 'production') {
        console.error('[REDIS-SERVICE] 🚨 FATAL: Redis initialization failed in production mode:', e.message);
        process.exit(1);
      }
      console.warn('[REDIS-SERVICE] ℹ️ Operating in fallback in-memory queue mode.');
      this.isConnected = false;
    }
  }

  getConnectionOptions() {
    return {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null
    };
  }
}

module.exports = new RedisService();
