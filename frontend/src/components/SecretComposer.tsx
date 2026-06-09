import React, { useState } from 'react';
import { generateKey, encrypt, encodePayload, exportKeyToBase64Url } from '../lib/crypto';
import ShareLink from './ShareLink';

export const SecretComposer: React.FC = () => {
  const [plaintext, setPlaintext] = useState('');
  const [ttl, setTtl] = useState<'1h' | '24h' | '7d' | 'once'>('once');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [result, setResult] = useState<{
    url: string;
    expiresAt: string;
    ttl: string;
  } | null>(null);

  const handleEncryptAndGenerate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!plaintext.trim()) {
      setError('Secret payload cannot be empty.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Generate AES-256-GCM key
      const key = await generateKey();

      // 2. Encrypt plaintext
      const { iv, ciphertext } = await encrypt(key, plaintext);

      // 3. Encode payload (iv + ciphertext) into standard base64 for transport
      const payload = encodePayload(iv, ciphertext);

      // 4. POST payload + ttl to API
      const apiUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/secrets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payload, ttl }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server responded with status ${response.status}`);
      }

      const { id, expires_at } = await response.json();

      // 5. Export key to base64url string
      const base64UrlKey = await exportKeyToBase64Url(key);

      // 6. Build the share link with the key in the hash fragment
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const shareUrl = `${origin}/s/${id}#key=${base64UrlKey}`;

      setResult({
        url: shareUrl,
        expiresAt: expires_at,
        ttl,
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while encrypting your secret.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setPlaintext('');
    setTtl('once');
    setResult(null);
    setError(null);
  };

  if (result) {
    return <ShareLink url={result.url} expiresAt={result.expiresAt} ttl={result.ttl} onReset={handleReset} />;
  }

  const isOverSoftLimit = plaintext.length > 10000;
  const isOverHardLimit = plaintext.length > 102400; // 100KB is roughly 100k chars for ASCII, let's keep it safe.

  return (
    <div className="panel animate-fade-up">
      <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)' }}>
          Create New Secret
        </h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
          Data is encrypted in your browser before transit. We never see it.
        </p>
      </div>

      <form onSubmit={handleEncryptAndGenerate}>
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <label className="label">Plaintext Payload</label>
          <textarea
            className="secret-textarea"
            placeholder="Type or paste your secret here..."
            value={plaintext}
            onChange={(e) => setPlaintext(e.target.value)}
            disabled={isLoading}
            required
            rows={10}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: isOverSoftLimit ? 'var(--color-warning)' : 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {plaintext.length.toLocaleString()} / 100,000 chars
            </span>
            {isOverSoftLimit && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)', fontFamily: 'var(--font-mono)' }}>
                ⚠️ Soft limit warning: exceeds 10,000 chars
              </span>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 'var(--space-6)' }}>
          <label className="label">Expiration Rule (TTL)</label>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="ttl-option"
              data-active={ttl === 'once'}
              onClick={() => setTtl('once')}
              disabled={isLoading}
            >
              One View ●
            </button>
            <button
              type="button"
              className="ttl-option"
              data-active={ttl === '1h'}
              onClick={() => setTtl('1h')}
              disabled={isLoading}
            >
              1 Hour
            </button>
            <button
              type="button"
              className="ttl-option"
              data-active={ttl === '24h'}
              onClick={() => setTtl('24h')}
              disabled={isLoading}
            >
              24 Hours
            </button>
            <button
              type="button"
              className="ttl-option"
              data-active={ttl === '7d'}
              onClick={() => setTtl('7d')}
              disabled={isLoading}
            >
              7 Days
            </button>
          </div>
        </div>

        {error && (
          <div style={{ border: '1px solid var(--color-danger)', background: 'var(--color-danger-dim)', padding: 'var(--space-4)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-6)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn-primary"
          style={{ width: '100%' }}
          disabled={isLoading || isOverHardLimit}
        >
          {isLoading ? 'ENCRYPTING PAYLOAD...' : 'ENCRYPT & GENERATE LINK →'}
        </button>
      </form>
    </div>
  );
};
export default SecretComposer;
