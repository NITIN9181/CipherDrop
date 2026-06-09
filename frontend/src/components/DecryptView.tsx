import React, { useState, useEffect } from 'react';
import { importKeyFromBase64Url, decodePayload, decrypt } from '../lib/crypto';
import AuditLog from './AuditLog';

type ViewStatus = 'decrypting' | 'revealed' | 'invalid-link' | 'tombstone' | 'decryption-failed';

export const DecryptView: React.FC = () => {
  const [status, setStatus] = useState<ViewStatus>('decrypting');
  const [plaintext, setPlaintext] = useState('');
  const [scrambleText, setScrambleText] = useState('▓▒░▓▒░▓');
  const [secretId, setSecretId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [refreshAudit, setRefreshAudit] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Extract secret ID from path
    const pathParts = window.location.pathname.split('/');
    const sIndex = pathParts.indexOf('s');
    const id = sIndex !== -1 && pathParts[sIndex + 1] ? pathParts[sIndex + 1] : '';
    setSecretId(id);

    // 2. Extract key from hash fragment
    const hash = window.location.hash;
    const keyParam = hash ? new URLSearchParams(hash.slice(1)).get('key') : null;

    if (!id || !keyParam) {
      setStatus('invalid-link');
      return;
    }

    // Start cipher scramble animation
    const chars = '▓▒░Xk2$@#9!d3cr.yp..';
    const scrambleInterval = setInterval(() => {
      let result = '';
      for (let i = 0; i < 12; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
      }
      setScrambleText(result);
    }, 50);

    // Perform API fetch and decryption
    const performDecryption = async () => {
      try {
        const apiUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:3001';
        
        // 3. Fetch ciphertext payload from API
        const response = await fetch(`${apiUrl}/api/secrets/${id}`);
        
        if (!response.ok) {
          if (response.status === 404 || response.status === 410) {
            setStatus('tombstone');
          } else {
            throw new Error(`Server returned status ${response.status}`);
          }
          clearInterval(scrambleInterval);
          return;
        }

        const { payload, is_one_time } = await response.json();

        // 4. Import key from base64url parameter
        const cryptoKey = await importKeyFromBase64Url(keyParam);

        // 5. Decode payload (contains iv + ciphertext)
        const { iv, ciphertext } = decodePayload(payload);

        // 6. Decrypt ciphertext (may throw DOMException if tag mismatched/tampered)
        const decryptedPlaintext = await decrypt(cryptoKey, iv, ciphertext);

        // Allow scramble animation to run for at least 500ms for premium visual effect
        setTimeout(async () => {
          clearInterval(scrambleInterval);
          setPlaintext(decryptedPlaintext);
          setStatus('revealed');
          // Trigger audit refresh
          setRefreshAudit(prev => prev + 1);

          // If one-time view, destroy it immediately in the background
          if (is_one_time) {
            try {
              await fetch(`${apiUrl}/api/secrets/${id}`, {
                method: 'DELETE',
              });
              setRefreshAudit(prev => prev + 1);
            } catch (err) {
              console.error('Failed to auto-destroy one-time secret:', err);
            }
          }
        }, 500);

      } catch (err: any) {
        clearInterval(scrambleInterval);
        console.error('Decryption failed:', err);
        setErrorMessage(err.message || 'Decryption failed due to an unexpected cryptographic error.');
        setStatus('decryption-failed');
        setRefreshAudit(prev => prev + 1);
      }
    };

    performDecryption();

    return () => clearInterval(scrambleInterval);
  }, []);

  const handleDestroy = async () => {
    if (!secretId) return;
    try {
      const apiUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:3001';
      await fetch(`${apiUrl}/api/secrets/${secretId}`, {
        method: 'DELETE',
      });
      setStatus('tombstone');
      setRefreshAudit(prev => prev + 1);
    } catch (err) {
      console.error('Failed to destroy secret:', err);
    }
  };

  return (
    <div className="animate-fade-up">
      {status === 'decrypting' && (
        <div className="panel" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
          <div className="scramble-effect" style={{ fontSize: 'var(--text-3xl)', marginBottom: 'var(--space-4)', letterSpacing: '2px' }}>
            {scrambleText}
          </div>
          <span className="label">Decrypting Payload...</span>
        </div>
      )}

      {status === 'revealed' && (
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-4)' }}>
            <span className="badge badge--warning">⚠️ EPHEMERAL SECRET</span>
            <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', margin: 0, color: 'var(--color-text-secondary)' }}>
              This Secret Will Self-Destruct
            </h2>
          </div>
          
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-4)' }}>
            Read carefully. Once you close this window or click "Destroy Now", it cannot be retrieved.
          </p>

          <div className="plaintext-reveal" style={{ marginBottom: 'var(--space-6)' }}>
            {plaintext}
          </div>

          <button onClick={handleDestroy} className="btn-destroy" style={{ width: '100%' }}>
            I've copied this — destroy now
          </button>
        </div>
      )}

      {status === 'invalid-link' && (
        <div className="panel" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
          <div style={{ fontSize: '2.5rem', opacity: 0.2, marginBottom: 'var(--space-4)' }}>⚠️</div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xl)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', color: 'var(--color-danger)', marginBottom: 'var(--space-4)' }}>
            Invalid Link
          </h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            The URL fragment is missing the required cryptographic decryption key parameter.
          </p>
        </div>
      )}

      {status === 'tombstone' && (
        <div className="tombstone">
          <div className="tombstone-icon">░</div>
          <h2 className="tombstone-title">Secret Destroyed</h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', maxWidth: '500px', margin: '0 auto var(--space-6)' }}>
            This payload no longer exists. It was either viewed once and self-destructed, or its TTL expired before retrieval.
          </p>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
            ID: {secretId} · CONSUMED
          </div>
        </div>
      )}

      {status === 'decryption-failed' && (
        <div className="panel" style={{ padding: 'var(--space-12)', border: '1px solid var(--color-danger)' }}>
          <div style={{ fontSize: '2.5rem', color: 'var(--color-danger)', marginBottom: 'var(--space-4)', textAlign: 'center' }}>⚠️</div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', color: 'var(--color-danger)', marginBottom: 'var(--space-4)', textAlign: 'center' }}>
            Decryption Failed
          </h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)', textAlign: 'center' }}>
            The payload could not be decrypted. This typically indicates a key mismatch (incorrect link) or a tampered payload.
          </p>
          {errorMessage && (
            <pre style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', color: 'var(--color-danger)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {errorMessage}
            </pre>
          )}
        </div>
      )}

      {/* Render Audit Trail if we have a secret ID */}
      {secretId && (
        <AuditLog secretId={secretId} refreshTrigger={refreshAudit} />
      )}
    </div>
  );
};
export default DecryptView;
