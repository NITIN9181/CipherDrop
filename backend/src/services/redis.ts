import Redis from 'ioredis';
import { logger } from './logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

logger.info({ redisUrl }, 'Initializing Redis connection');

export const redis = new Redis(redisUrl);

redis.on('connect', () => {
  logger.info('Redis connection established successfully');
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error occurred');
});
