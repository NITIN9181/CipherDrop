import React, { useState, useEffect } from 'react';

interface AuditEvent {
  event_type: 'SECRET_CREATED' | 'SECRET_FETCHED' | 'SECRET_CONSUMED';
  secret_id: string;
  timestamp: string;
  ip_hash: string;
  user_agent_hash: string;
}

interface ProofBlob {
  id: string;
  destroyed_at: string;
  event_chain_hash: string;
}

interface AuditLogProps {
  secretId: string;
  refreshTrigger: number;
}

export const AuditLog: React.FC<AuditLogProps> = ({ secretId, refreshTrigger }) => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [proof, setProof] = useState<ProofBlob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAuditLog = async () => {
      try {
        const apiUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:3001';
        const response = await fetch(`${apiUrl}/api/secrets/${secretId}/audit`);
        
        if (!response.ok) {
          if (response.status === 404) {
            // No audit events yet, which is possible if DB is slow or it's a 404 secret
            setLoading(false);
            return;
          }
          throw new Error(`Server returned status ${response.status}`);
        }

        const data = await response.json();
        setEvents(data.events || []);
        setProof(data.proof || null);
      } catch (err: any) {
        console.error('Failed to fetch audit log:', err);
        setError(err.message || 'Failed to retrieve audit events.');
      } finally {
        setLoading(false);
      }
    };

    fetchAuditLog();
  }, [secretId, refreshTrigger]);

  const handleDownloadProof = () => {
    if (!proof) return;

    const fileContent = JSON.stringify({
      proof_of_destruction: proof,
      audit_events: events,
      verification_algorithm: 'SHA-256'
    }, null, 2);

    const blob = new Blob([fileContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `proof-of-destruction-${secretId.substring(0, 8)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div style={{ marginTop: 'var(--space-8)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
        Loading audit events...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ marginTop: 'var(--space-8)', border: '1px solid var(--color-border)', padding: 'var(--space-4)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
        Audit Trail Unavailable: {error}
      </div>
    );
  }

  if (events.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: 'var(--space-10)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-6)' }} className="animate-fade-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', margin: 0, color: 'var(--color-text-secondary)' }}>
          Audit Trail <span style={{ color: 'var(--color-text-tertiary)' }}>— secret:{secretId.substring(0, 8)}...</span>
        </h3>
        {proof && (
          <span className="badge badge--consumed">TOMBSTONED</span>
        )}
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-surface)', marginBottom: 'var(--space-4)' }}>
        <table className="audit-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>#</th>
              <th>Timestamp</th>
              <th>Event</th>
              <th>IP Hash (SHA-256)</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event, idx) => {
              const eventClass = 
                event.event_type === 'SECRET_CREATED' ? 'audit-event--created' :
                event.event_type === 'SECRET_CONSUMED' ? 'audit-event--consumed' :
                'audit-event--fetched';

              return (
                <tr key={idx}>
                  <td>{(idx + 1).toString().padStart(3, '0')}</td>
                  <td>{event.timestamp}</td>
                  <td className={eventClass}>{event.event_type}</td>
                  <td title={`UA Hash: ${event.user_agent_hash}`}>
                    {event.ip_hash.substring(0, 16)}...
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {proof ? (
        <button
          onClick={handleDownloadProof}
          className="btn-secondary"
          style={{ width: '100%', padding: 'var(--space-3)' }}
        >
          Download Proof of Destruction ↓
        </button>
      ) : (
        <div style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          Proof of destruction available after secret consumption.
        </div>
      )}
    </div>
  );
};
export default AuditLog;
