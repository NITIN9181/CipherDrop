import React, { useState, useEffect } from 'react';

interface ShareLinkProps {
  url: string;
  expiresAt: string;
  ttl: string;
  onReset: () => void;
}

export const ShareLink: React.FC<ShareLinkProps> = ({ url, expiresAt, ttl, onReset }) => {
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = +new Date(expiresAt) - +new Date();
      if (difference <= 0) {
        setTimeLeft('EXPIRED');
        return;
      }

      const hours = Math.floor(difference / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      let timeString = '';
      if (hours > 0) timeString += `${hours}h `;
      if (minutes > 0 || hours > 0) timeString += `${minutes}m `;
      timeString += `${seconds}s`;

      setTimeLeft(timeString);
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  return (
    <div className="panel panel--success animate-fade-up">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <span className="badge badge--active">✓ SECURE</span>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', margin: 0 }}>
          Secret Encrypted
        </h2>
      </div>

      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
        Your secret has been encrypted browser-side. Share this secure URL with the recipient:
      </p>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', width: '100%' }}>
        <input
          type="text"
          readOnly
          value={url}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            background: 'var(--color-bg-subtle)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-sm)',
            flexGrow: 1,
            outline: 'none',
            textOverflow: 'ellipsis',
          }}
        />
        <button onClick={handleCopy} className="btn-secondary" style={{ whiteSpace: 'nowrap', minWidth: '130px' }}>
          {copied ? '✓ COPIED' : 'COPY LINK'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
        <div>
          <span className="label">Expires In</span>
          <span className="badge badge--warning" style={{ fontSize: 'var(--text-sm)', padding: 'var(--space-1) var(--space-2)' }}>
            {timeLeft}
          </span>
        </div>
        <div>
          <span className="label">Access Rule</span>
          <span className="badge badge--active" style={{ fontSize: 'var(--text-sm)', padding: 'var(--space-1) var(--space-2)' }}>
            {ttl === 'once' ? 'ONE-TIME VIEW' : 'EXPIRING TTL'}
          </span>
        </div>
      </div>

      <div style={{ border: '1px solid var(--color-warning-dim)', background: 'rgba(251, 191, 36, 0.05)', padding: 'var(--space-4)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-6)' }}>
        <span className="label" style={{ color: 'var(--color-warning)', fontWeight: 500 }}>⚠️ Cryptographic Notice</span>
        <p style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--color-warning)', lineHeight: '1.4', margin: 0 }}>
          The decryption key exists ONLY in the URL fragment (#key=...). It is never sent to the server. If you lose this link, the data is unrecoverable.
        </p>
      </div>

      <button onClick={onReset} className="btn-primary" style={{ width: '100%' }}>
        Create Another Secret
      </button>
    </div>
  );
};
export default ShareLink;
