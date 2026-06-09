import { Request, Response, NextFunction } from 'express';
import { redis } from '../services/redis';
import { hashValue } from '../services/audit-db';
import { logger } from '../services/logger';

export async function rateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
  const rawIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const clientIp = rawIp.split(',')[0].trim();
  const ipHash = hashValue(clientIp);

  const windowMinute = Math.floor(Date.now() / 60000);
  const key = `ratelimit:${ipHash}:${windowMinute}`;

  try {
    const pipeline = redis.multi();
    pipeline.incr(key);
    pipeline.expire(key, 60);
    const results = await pipeline.exec();

    if (!results || results.length === 0) {
      next();
      return;
    }

    // ioredis returns array of [error, result]
    const count = results[0][1] as number;

    if (count > 10) {
      const secondsLeft = 60 - (Math.floor(Date.now() / 1000) % 60);
      res.setHeader('Retry-After', secondsLeft.toString());
      logger.warn({ ipHash, count }, 'Rate limit exceeded');
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
      });
      return;
    }

    next();
  } catch (err) {
    logger.error({ err, ipHash }, 'Rate limiter Redis execution failed');
    // Fail-open to not block users in case of Redis issues
    next();
  }
}
