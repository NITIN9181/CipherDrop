import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import { getAuditTrail } from '../services/audit-db';
import { logger } from '../services/logger';

export const auditRouter = Router();

/**
 * GET /api/secrets/:id/audit
 * Returns the audit log event chain and optional proof of destruction.
 */
auditRouter.get('/:id/audit', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const events = await getAuditTrail(id);

    // If no events found, return 404
    if (events.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'No audit trail found for this secret.' });
      return;
    }

    // Check if the secret has been consumed/destroyed
    const consumedEvent = events.find(event => event.event_type === 'SECRET_CONSUMED');
    
    let proof = undefined;
    if (consumedEvent) {
      // Build proof-of-destruction
      const eventChainHash = createHash('sha256')
        .update(JSON.stringify(events))
        .digest('hex');

      proof = {
        id,
        destroyed_at: consumedEvent.timestamp,
        event_chain_hash: eventChainHash,
      };
    }

    res.status(200).json({
      events,
      proof,
    });
  } catch (err) {
    logger.error({ err, secretId: id }, 'Failed to fetch audit log');
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to retrieve audit trail.' });
  }
});
