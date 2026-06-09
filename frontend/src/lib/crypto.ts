// SubtleCrypto engine — zero external dependencies
// Handles key generation, AES-256-GCM encryption/decryption, key export/import to base64url, and payload serialization.

// Web Crypto is global in modern browsers and Node 18+
// In SSR we can check if crypto is defined.
const webCrypto = typeof crypto !== 'undefined' ? crypto : null;

function getCrypto(): Crypto {
  if (!webCrypto) {
    throw new Error('Web Crypto API is not available in this environment');
  }
  return webCrypto;
}

// Convert Uint8Array to standard Base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert standard Base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates an AES-256-GCM key that is extractable and usable for encrypt/decrypt.
 */
export async function generateKey(): Promise<CryptoKey> {
  const api = getCrypto();
  return api.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a plaintext string using the provided AES key.
 * Generates a fresh 12-byte IV.
 */
export async function encrypt(
  key: CryptoKey,
  plaintext: string
): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const api = getCrypto();
  const iv = api.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encodedPlaintext = encoder.encode(plaintext);

  const ciphertext = await api.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer,
    },
    key,
    encodedPlaintext
  );

  return { iv, ciphertext };
}

/**
 * Decrypts an ArrayBuffer ciphertext using the key and IV, returning the plaintext.
 * Does not catch GCM tag failures (let them throw).
 */
export async function decrypt(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: ArrayBuffer
): Promise<string> {
  const api = getCrypto();
  const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
  const decrypted = await api.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBuffer,
    },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Exports a CryptoKey to raw format and encodes it as a base64url string.
 */
export async function exportKeyToBase64Url(key: CryptoKey): Promise<string> {
  const api = getCrypto();
  const rawKey = await api.subtle.exportKey('raw', key);
  const base64 = uint8ArrayToBase64(new Uint8Array(rawKey));
  
  // base64url transformation
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Reconstructs a CryptoKey from a base64url encoded string.
 */
export async function importKeyFromBase64Url(raw: string): Promise<CryptoKey> {
  const api = getCrypto();
  
  // Reverse base64url transformation
  let base64 = raw.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }

  const rawKeyBytes = base64ToUint8Array(base64);
  // Slice to concrete ArrayBuffer to satisfy TypeScript strict DOM lib types
  const rawKeyBuffer = rawKeyBytes.buffer.slice(
    rawKeyBytes.byteOffset,
    rawKeyBytes.byteOffset + rawKeyBytes.byteLength
  ) as ArrayBuffer;

  return api.subtle.importKey(
    'raw',
    rawKeyBuffer,
    { name: 'AES-GCM' },
    false, // extractable
    ['decrypt']
  );
}

/**
 * Combines iv + ciphertext into a single base64 string for transport.
 * IV is always 12 bytes.
 */
export function encodePayload(iv: Uint8Array, ciphertext: ArrayBuffer): string {
  const ciphertextBytes = new Uint8Array(ciphertext);
  const combined = new Uint8Array(iv.length + ciphertextBytes.length);
  combined.set(iv, 0);
  combined.set(ciphertextBytes, iv.length);
  return uint8ArrayToBase64(combined);
}

/**
 * Decodes base64 payload back to iv (first 12 bytes) and ciphertext (rest).
 */
export function decodePayload(payload: string): { iv: Uint8Array; ciphertext: ArrayBuffer } {
  const combined = base64ToUint8Array(payload);
  if (combined.length < 12) {
    throw new Error('Invalid payload: less than 12 bytes (IV size)');
  }
  const iv = combined.slice(0, 12);
  const ciphertextBytes = combined.slice(12);
  return {
    iv,
    ciphertext: ciphertextBytes.buffer,
  };
}
