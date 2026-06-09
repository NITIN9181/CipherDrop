import { describe, it, expect } from 'vitest';
import {
  generateKey,
  encrypt,
  decrypt,
  exportKeyToBase64Url,
  importKeyFromBase64Url,
  encodePayload,
  decodePayload,
} from './crypto';

describe('crypto client-side engine', () => {
  it('should encrypt and decrypt correctly (happy path round-trip)', async () => {
    const key = await generateKey();
    const plaintext = 'Secret Message 123';
    
    const { iv, ciphertext } = await encrypt(key, plaintext);
    expect(iv.length).toBe(12);
    expect(ciphertext.byteLength).toBeGreaterThan(0);

    const decrypted = await decrypt(key, iv, ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it('should import and export keys correctly (key export/import round-trip)', async () => {
    const key = await generateKey();
    const plaintext = 'Double-blind cryptographic transmission test';
    
    const base64UrlKey = await exportKeyToBase64Url(key);
    expect(typeof base64UrlKey).toBe('string');
    expect(base64UrlKey).not.toContain('+');
    expect(base64UrlKey).not.toContain('/');
    expect(base64UrlKey).not.toContain('=');

    const importedKey = await importKeyFromBase64Url(base64UrlKey);
    const { iv, ciphertext } = await encrypt(key, plaintext);

    // Should be able to decrypt with the imported key
    const decrypted = await decrypt(importedKey, iv, ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it('should guarantee IV uniqueness (two encryptions produce different ciphertexts)', async () => {
    const key = await generateKey();
    const plaintext = 'Repeated content';
    
    const enc1 = await encrypt(key, plaintext);
    const enc2 = await encrypt(key, plaintext);

    // IVs must be different
    expect(Array.from(enc1.iv)).not.toEqual(Array.from(enc2.iv));

    // Ciphertexts must be different
    const bytes1 = new Uint8Array(enc1.ciphertext);
    const bytes2 = new Uint8Array(enc2.ciphertext);
    expect(Array.from(bytes1)).not.toEqual(Array.from(bytes2));
  });

  it('should fail decryption if ciphertext is tampered with', async () => {
    const key = await generateKey();
    const plaintext = 'Original untampered text';
    
    const { iv, ciphertext } = await encrypt(key, plaintext);
    const tamperedCiphertext = ciphertext.slice(0); // clone ArrayBuffer
    const view = new Uint8Array(tamperedCiphertext);
    
    // Mutate exactly 1 byte
    view[0] ^= 0x01;

    // Decrypting tampered payload must throw an error (AES-GCM tag mismatch)
    await expect(decrypt(key, iv, tamperedCiphertext)).rejects.toThrow();
  });

  it('should handle empty string inputs', async () => {
    const key = await generateKey();
    const plaintext = '';
    
    const { iv, ciphertext } = await encrypt(key, plaintext);
    const decrypted = await decrypt(key, iv, ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it('should handle unicode inputs (emojis, CJK, Arabic)', async () => {
    const key = await generateKey();
    const plaintext = '🔐 👾 CJK: 🚀 繁體中文 简体中文 日本語 🚀 Arabic: السلام عليكم 🚀';
    
    const { iv, ciphertext } = await encrypt(key, plaintext);
    const decrypted = await decrypt(key, iv, ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it('should encode and decode payloads correctly (payload encode/decode round-trip)', async () => {
    const key = await generateKey();
    const plaintext = 'Serialization payload test';
    const { iv, ciphertext } = await encrypt(key, plaintext);

    const payload = encodePayload(iv, ciphertext);
    expect(typeof payload).toBe('string');

    const decoded = decodePayload(payload);
    expect(Array.from(decoded.iv)).toEqual(Array.from(iv));
    expect(decoded.ciphertext.byteLength).toBe(ciphertext.byteLength);

    const decrypted = await decrypt(key, decoded.iv, decoded.ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it('should throw when decoding an invalid payload', () => {
    expect(() => decodePayload('c2hvcnQ=')).toThrow(); // Base64 of 'short' (5 bytes), less than 12
  });
});
