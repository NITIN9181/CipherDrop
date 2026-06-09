CREATE TABLE IF NOT EXISTS audit_events (
  id           SERIAL PRIMARY KEY,
  event_type   TEXT NOT NULL,
  secret_id    UUID NOT NULL,
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_hash      TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_secret_id ON audit_events(secret_id);
