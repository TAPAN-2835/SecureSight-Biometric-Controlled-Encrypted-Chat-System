/**
 * AES-GCM Client-Side Encryption Service
 * Using Web Crypto API for secure modern encryption.
 */

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // Standard for AES-GCM

// Simple helper to convert string to Uint8Array
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Derives a CryptoKey from a plain text secret string.
 * In production, use PBKDF2 with salt.
 */
async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const keyData = encoder.encode(secret.padEnd(32).slice(0, 32)); // Ensure 256-bit key
  return await window.crypto.subtle.importKey(
    'raw',
    keyData,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts cleartext using AES-GCM.
 * Returns a Base64 string containing: IV (12 bytes) + Ciphertext + Auth Tag
 */
export async function encrypt(text: string, secret: string): Promise<string> {
  try {
    const key = await getCryptoKey(secret);
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encodedText = encoder.encode(text);

    const encryptedContent = await window.crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv,
      },
      key,
      encodedText
    );

    // Combine IV and Encrypted Content
    const combined = new Uint8Array(iv.length + encryptedContent.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedContent), iv.length);

    // Convert to Base64 for storage
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Encryption error');
  }
}

/**
 * Decrypts a Base64 string (IV + Ciphertext) using AES-GCM.
 */
export async function decrypt(base64Data: string, secret: string): Promise<string> {
  try {
    const key = await getCryptoKey(secret);
    const combined = new Uint8Array(
      atob(base64Data)
        .split('')
        .map((char) => char.charCodeAt(0))
    );

    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    const decryptedContent = await window.crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv,
      },
      key,
      ciphertext
    );

    return decoder.decode(decryptedContent);
  } catch (error) {
    console.warn('Decryption failed. Data might be unencrypted or key mismatch.');
    // If decryption fails, return a marker or original data (carefully)
    return "[ENCRYPTED MESSAGE]";
  }
}
