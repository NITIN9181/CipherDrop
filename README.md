# CipherDrop

**Zero-knowledge ephemeral secret sharing.**

The server stores ciphertext. The decryption key never leaves the browser. The two halves are architecturally separated by the HTTP specification itself.

```
┌─────────────────────────────────────────────────────────────────┐
│  SENDER BROWSER                      RECIPIENT BROWSER          │
│                                                                 │
│  plaintext                           #key=<base64url>           │
│      │                                     │  (fragment — never │
│      ▼                                     │   sent to server)  │
│  generateKey() ──── key ───────────────────┘                    │
│      │                                                          │
│  encrypt(key, plaintext)                                        │
│      │                                                          │
│      ├── { iv, ciphertext }                                     │
│      │         │                                                │
│      │   POST /api/secrets ──────────────► Redis               │
│      │         │          payload (blob)        secret:{id}     │
│      │    { id, expires_at }                    TTL-bounded     │
│      │                                                          │
│  Share URL:  /s/{id}#key={base64url-key}                        │
│                   │          │                                  │
│                   │          └─── never transmitted ──────────► │
│                   │                                             │
│              GET /api/secrets/{id} ◄────────────────────────── │
│                   │          ciphertext blob                    │
│                   │                                             │
│                   └──────────────────── decrypt(key, payload) ► │
│                                                   │             │
│                                              plaintext          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Demo

<video src="https://raw.githubusercontent.com/NITIN9181/CipherDrop/main/asset/2026-06-09%2011-32-11.mp4" controls width="100%"></video>

---

## Security Guarantee

**The server is architecturally incapable of reading any secret stored within it.**

The decryption key is embedded exclusively in the URL fragment (`#key=…`). Per [RFC 3986 §3.5](https://datatracker.ietf.org/doc/html/rfc3986#section-3.5), fragment identifiers are browser-local constructs and are never included in HTTP requests — not by policy, but by protocol. No proxy, CDN, load balancer, or server process receives the fragment, and therefore no process outside the recipient's browser can decrypt the stored ciphertext.

---

## Quick Start

```bash
git clone https://github.com/NITIN9181/CipherDrop.git
cd CipherDrop
docker-compose up
```

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:4321      |
| Backend  | http://localhost:3001      |
| Redis    | localhost:6379 (internal)  |
| Postgres | localhost:5432 (internal)  |

Requires Docker and Docker Compose. No other local dependencies.

---

## How It Works

**Sending a secret:**

1. The browser generates a fresh AES-256-GCM key via `crypto.subtle.generateKey()`.
2. The plaintext is encoded as UTF-8 and encrypted with a randomly generated 12-byte IV.
3. The IV and ciphertext are concatenated and base64-encoded into a single transport blob.
4. `POST /api/secrets` stores the blob in Redis under a UUIDv4 key with the selected TTL. The decryption key is not sent.
5. The frontend constructs the share URL: `/s/{id}#key={base64url-encoded-key}`.
6. The key is exported via `crypto.subtle.exportKey('raw', ...)` and encoded as base64url (URL-safe, no padding).

**Receiving a secret:**

7. The recipient's browser parses `location.hash` locally — the fragment is never transmitted.
8. `GET /api/secrets/:id` retrieves the ciphertext blob.
9. The key is imported via `crypto.subtle.importKey()` with `usages: ['decrypt']`.
10. `crypto.subtle.decrypt()` decrypts the payload; GCM tag verification happens automatically.
11. On confirmation, `DELETE /api/secrets/:id` removes the blob from Redis and writes a tombstone.

---

## Tech Stack

| Layer    | Technology                                         |
|----------|----------------------------------------------------|
| Frontend | Astro (SSR) + React islands + TypeScript           |
| Backend  | Node.js + Express + TypeScript + Zod + Pino        |
| Crypto   | Web Crypto API (`SubtleCrypto`) — zero dependencies |
| Storage  | Redis 7 (secret blobs, TTL) + PostgreSQL 16 (audit) |
| Testing  | Vitest (unit) + Playwright (E2E)                   |

---

## API Reference

### `POST /api/secrets`

Store an encrypted blob.

```json
// Request
{
  "payload": "<base64-encoded iv+ciphertext>",
  "ttl": "1h" | "24h" | "7d" | "once"
}

// Response 201
{
  "id": "a3f9e2c1-4b5d-4e6f-8a7b-9c0d1e2f3a4b",
  "expires_at": "2024-01-16T14:32:01Z"
}

// Errors
// 400 — invalid payload or ttl
// 429 — rate limit exceeded (10 req/60s per IP)
```

---

### `GET /api/secrets/:id`

Retrieve a ciphertext blob by ID.

```json
// Response 200
{
  "payload": "<base64-encoded iv+ciphertext>"
}

// Errors
// 404 — secret not found (never existed or TTL expired)
// 410 — secret was consumed (explicit DELETE was called)
```

---

### `DELETE /api/secrets/:id`

Explicitly destroy a secret after decryption. Writes a tombstone so subsequent `GET` requests return `410` rather than `404`.

```
// Response 204 No Content
```

---

### `GET /api/secrets/:id/audit`

Return the immutable audit event chain for a secret.

```json
// Response 200
{
  "events": [
    {
      "event_type": "SECRET_CREATED",
      "secret_id": "a3f9e2c1-...",
      "timestamp": "2024-01-15T14:32:01Z",
      "ip_hash": "7f3a9b2c...",
      "user_agent_hash": "d4e5f6a7..."
    },
    {
      "event_type": "SECRET_FETCHED",
      "secret_id": "a3f9e2c1-...",
      "timestamp": "2024-01-15T14:33:44Z",
      "ip_hash": "9b2c4d5e...",
      "user_agent_hash": "f8a9b0c1..."
    },
    {
      "event_type": "SECRET_CONSUMED",
      "secret_id": "a3f9e2c1-...",
      "timestamp": "2024-01-15T14:33:45Z",
      "ip_hash": "9b2c4d5e...",
      "user_agent_hash": "f8a9b0c1..."
    }
  ],
  "proof": {
    "id": "a3f9e2c1-...",
    "destroyed_at": "2024-01-15T14:33:45Z",
    "event_chain_hash": "sha256:e3b0c44298fc..."
  }
}
```

The `proof` field is present only when a `SECRET_CONSUMED` event exists. It is downloadable as a signed JSON blob from the audit UI.

---

## Security Model

- **The decryption key never appears in any HTTP request.** URL, body, header, cookie — none. The fragment is browser-only by specification.
- **AES-256-GCM exclusively.** No CBC (no authentication), no CTR, no ECB. GCM provides authenticated encryption; ciphertext tampering is detected automatically on decryption.
- **Fresh 12-byte IV per encryption.** Generated via `crypto.getRandomValues()`. IV reuse in GCM is catastrophic — this is enforced at the call site, not by convention.
- **Raw IP addresses are never persisted.** Audit events store SHA-256 hashes of the client IP and User-Agent. The hash is one-way; the original IP cannot be recovered.
- **One-time secrets are tombstoned on consumption.** After `DELETE /api/secrets/:id`, a `secret:{id}:consumed` key is written to Redis with a 24-hour TTL. Subsequent `GET` requests return `410 Gone`, distinguishing consumed secrets from never-existed ones.
- **Secret IDs are UUIDv4.** Sequential enumeration is not possible.
- **Rate limiting on creation.** 10 `POST /api/secrets` requests per IP per 60-second sliding window, enforced in Redis. Exceeds return `429` with a `Retry-After` header.
- **Security headers on all responses.** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy`, `Strict-Transport-Security`.
- **No plaintext in server logs.** Structured logging via Pino. Log fields are limited to `secret_id`, event types, and HTTP status codes.

---

## Development

### Running tests

Start the full stack first:

```bash
docker-compose up -d
```

**Unit tests** (SubtleCrypto engine, run in jsdom for Web Crypto availability):

```bash
cd frontend
npx vitest run
```

**E2E tests** (Playwright, requires the full docker-compose stack):

```bash
npx playwright test
```

### Zero-knowledge network test

`tests/e2e/zero-knowledge.spec.ts` intercepts all outgoing network requests via `page.on('request')` and asserts that no request URL, body, or header contains the base64url-encoded decryption key. This is the most important test in the suite. It must pass before any build is considered correct.

### Environment variables

The backend reads configuration exclusively from the environment. See `docker-compose.yml` for the local defaults. For custom deployments:

| Variable       | Description                          |
|----------------|--------------------------------------|
| `REDIS_URL`    | Redis connection string              |
| `DATABASE_URL` | PostgreSQL connection string         |
| `PORT`         | Backend listen port (default: 3001)  |
| `PUBLIC_API_URL` | API base URL, read by Astro frontend |

No secrets are hardcoded anywhere in the codebase.

---

## License

MIT
