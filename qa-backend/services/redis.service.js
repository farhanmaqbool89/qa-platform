const Redis = require('ioredis');

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.init();
  }

  parseRedisConfig() {
    let host = process.env.REDIS_HOST || '127.0.0.1';
    let port = Number(process.env.REDIS_PORT) || 6379;
    let password = process.env.REDIS_PASSWORD || undefined;

    if (process.env.REDIS_URL) {
      try {
        const parsed = new URL(process.env.REDIS_URL);
        host = parsed.hostname || host;
        port = Number(parsed.port) || port;
        if (parsed.password) password = parsed.password;
      } catch (e) {}
    }
    return { host, port, password };
  }

  init() {
    const { host, port, password } = this.parseRedisConfig();

    try {
      this.client = new Redis({
        host,
        port,
        password,
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        connectTimeout: 5000,
        retryStrategy(times) {
          if (times > 5) {
            return null;
          }
          return Math.min(times * 500, 2000);
        }
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        console.log(`[REDIS-SERVICE] ? Connected to Redis at ${host}:${port}`);
      });

      this.client.on('error', (err) => {
        if (process.env.NODE_ENV === 'production' && !this.isConnected) {
          console.warn('[REDIS-SERVICE] ?? Redis connection error:', err.message);
        } else if (this.isConnected) {
          console.warn('[REDIS-SERVICE] ?? Redis connection error:', err.message);
        }
        this.isConnected = false;
      });
    } catch (e) {
      console.warn('[REDIS-SERVICE] ?? Operating in fallback in-memory queue mode:', e.message);
      this.isConnected = false;
    }
  }

  getConnectionOptions() {
    const { host, port, password } = this.parseRedisConfig();
    return {
      host,
      port,
      password,
      maxRetriesPerRequest: null
    };
  }
}

module.exports = new RedisService();
