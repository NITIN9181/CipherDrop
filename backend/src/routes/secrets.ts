import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { redis } from '../services/redis';
import { writeAuditEvent } from '../services/audit-db';
import { logger } from '../services/logger';

export const secretsRouter = Router();

const createSecretSchema = z.object({
  payload: z.string().min(1, 'Payload cannot be empty').max(102400, 'Payload cannot exceed 100KB'),
  ttl: z.enum(['1h', '24h', '7d', 'once']),
});

const ttlSecondsMap = {
  '1h': 3600,
  '24h': 86400,
  '7d': 604800,
  'once': 3600,
};

// Helper to extract client details for auditing
function getClientDetails(req: Request) {
  const rawIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
  const ip = rawIp.split(',')[0].trim();
  const userAgent = req.headers['user-agent'] || '';
  return { ip, userAgent };
}

/**
 * POST /api/secrets
 * Store an encrypted payload. Key is NEVER sent to backend.
 */
secretsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = createSecretSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation Error', details: parsed.error.format() });
    return;
  }

  const { payload, ttl } = parsed.data;
  const id = randomUUID();
  const seconds = ttlSecondsMap[ttl];
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + seconds * 1000).toISOString();

  try {
    const data = JSON.stringify({ payload, created_at: createdAt });
    
    const pipeline = redis.pipeline();
    pipeline.set(`secret:${id}`, data, 'EX', seconds);
    
    if (ttl === 'once') {
      pipeline.set(`secret:${id}:one-time`, '1', 'EX', seconds);
    }
    
    await pipeline.exec();

    // Audit Event
    const { ip, userAgent } = getClientDetails(req);
    await writeAuditEvent('SECRET_CREATED', id, ip, userAgent);

    res.status(201).json({ id, expires_at: expiresAt });
  } catch (err) {
    logger.error({ err, secretId: id }, 'Failed to create secret');
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to store ciphertext payload.' });
  }
});

/**
 * GET /api/secrets/:id
 * Retrieve secret ciphertext payload.
 */
secretsRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const data = await redis.get(`secret:${id}`);
    
    if (!data) {
      // Check if it was consumed previously
      const consumed = await redis.get(`secret:${id}:consumed`);
      if (consumed) {
        res.status(410).json({ error: 'Gone', message: 'Secret has already been consumed and destroyed.' });
      } else {
        res.status(404).json({ error: 'Not Found', message: 'Secret not found or expired.' });
      }
      return;
    }

    const { payload } = JSON.parse(data);
    const isOneTime = await redis.exists(`secret:${id}:one-time`);

    // Audit Event
    const { ip, userAgent } = getClientDetails(req);
    await writeAuditEvent('SECRET_FETCHED', id, ip, userAgent);

    res.status(200).json({ payload, is_one_time: isOneTime === 1 });
  } catch (err) {
    logger.error({ err, secretId: id }, 'Failed to fetch secret');
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to retrieve ciphertext payload.' });
  }
});

/**
 * DELETE /api/secrets/:id
 * Explicit destruction of secret.
 */
secretsRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const pipeline = redis.pipeline();
    pipeline.del(`secret:${id}`);
    pipeline.del(`secret:${id}:one-time`);
    pipeline.set(`secret:${id}:consumed`, '1', 'EX', 86400); // 24h tombstone
    await pipeline.exec();

    // Audit Event
    const { ip, userAgent } = getClientDetails(req);
    await writeAuditEvent('SECRET_CONSUMED', id, ip, userAgent);

    res.status(204).send();
  } catch (err) {
    logger.error({ err, secretId: id }, 'Failed to delete secret');
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to destroy secret.' });
  }
});
