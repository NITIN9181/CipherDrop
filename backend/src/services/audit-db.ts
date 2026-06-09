import { Pool } from 'pg';
import { createHash } from 'crypto';
import { logger } from './logger';

const databaseUrl = process.env.DATABASE_URL || 'postgresql://cipherdrop:localdev@localhost:5432/cipherdrop';

logger.info({ databaseUrl }, 'Initializing PostgreSQL database connection pool');

export const pool = new Pool({
  connectionString: databaseUrl,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error occurred');
});

/**
 * Computes a SHA-256 hash of a string, returning a hex encoded string.
 */
export function hashValue(val: string): string {
  return createHash('sha256').update(val).digest('hex');
}

export interface AuditEvent {
  event_type: 'SECRET_CREATED' | 'SECRET_FETCHED' | 'SECRET_CONSUMED';
  secret_id: string;
  timestamp: string; // ISO 8601 string
  ip_hash: string;
  user_agent_hash: string;
}

/**
 * Defensive schema initialization with retries for container startup
 */
export async function initDatabase(): Promise<void> {
  let retries = 5;
  while (retries > 0) {
    try {
      // Test query to ensure DB is responsive
      await pool.query('SELECT 1');
      logger.info('Database connection established successfully');

      await pool.query(`
        CREATE TABLE IF NOT EXISTS audit_events (
          id           SERIAL PRIMARY KEY,
          event_type   TEXT NOT NULL,
          secret_id    UUID NOT NULL,
          timestamp    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          ip_hash      TEXT NOT NULL,
          user_agent_hash TEXT NOT NULL
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_audit_secret_id ON audit_events(secret_id);
      `);
      logger.info('Database schema checked/initialized successfully');
      return;
    } catch (err) {
      retries--;
      logger.warn({ err, retries }, 'Database connection failed, retrying in 2 seconds...');
      if (retries === 0) {
        logger.error('Database connection retries exhausted. Schema initialization failed.');
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

/**
 * Writes an audit event with SHA-256 hashed IP and User-Agent values.
 */
export async function writeAuditEvent(
  eventType: 'SECRET_CREATED' | 'SECRET_FETCHED' | 'SECRET_CONSUMED',
  secretId: string,
  rawIp: string,
  rawUserAgent: string
): Promise<void> {
  const ipHash = hashValue(rawIp || '');
  const userAgentHash = hashValue(rawUserAgent || '');
  
  try {
    await pool.query(
      `INSERT INTO audit_events (event_type, secret_id, ip_hash, user_agent_hash)
       VALUES ($1, $2, $3, $4)`,
      [eventType, secretId, ipHash, userAgentHash]
    );
    logger.info({ eventType, secretId }, 'Audit event successfully written');
  } catch (err) {
    logger.error({ err, eventType, secretId }, 'Failed to write audit event');
  }
}

/**
 * Retrieves the event trail for a secret, ordered chronologically.
 */
export async function getAuditTrail(secretId: string): Promise<AuditEvent[]> {
  const result = await pool.query(
    `SELECT event_type, secret_id, timestamp, ip_hash, user_agent_hash
     FROM audit_events
     WHERE secret_id = $1
     ORDER BY timestamp ASC`,
    [secretId]
  );

  return result.rows.map((row) => ({
    event_type: row.event_type as 'SECRET_CREATED' | 'SECRET_FETCHED' | 'SECRET_CONSUMED',
    secret_id: row.secret_id,
    timestamp: row.timestamp.toISOString(),
    ip_hash: row.ip_hash,
    user_agent_hash: row.user_agent_hash,
  }));
}
