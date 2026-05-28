/**
 * Edge-runtime token encryption for OAuth credentials at rest.
 *
 * Runs under Cloudflare Workers / Next.js Edge, so it relies exclusively on
 * the Web Crypto API (`crypto.subtle`) and standard byte primitives — no
 * `node:crypto`, no `Buffer`. The master key is provided as a 64-character
 * hex string (32 bytes) in `ENCRYPTION_MASTER_KEY`. We derive an AES-GCM
 * CryptoKey from it once per request and pair every ciphertext with a fresh
 * 96-bit IV (the GCM-recommended size).
 *
 * Storage layout in `public.platform_connections`:
 *   encrypted_access_token  → base64(ciphertext || gcm_tag)
 *   encrypted_refresh_token → base64(ciphertext || gcm_tag) | null
 *   encryption_iv           → base64(iv)
 *
 * The IV does NOT need to be secret, only unique per ciphertext + key. When
 * a refresh token is rotated we re-encrypt with a fresh IV and overwrite
 * both fields atomically; never reuse an IV with the same key.
 */

const ALGO = "AES-GCM";
const IV_BYTE_LENGTH = 12; // 96 bits, per NIST SP 800-38D §5.2.1.1
const KEY_BYTE_LENGTH = 32; // AES-256

function getMasterKeyHex(): string {
  const hex = process.env.ENCRYPTION_MASTER_KEY;
  if (!hex) {
    throw new Error(
      "ENCRYPTION_MASTER_KEY missing. Generate one with " +
        "`openssl rand -hex 32` and add it to the Cloudflare Pages " +
        "project (Settings → Environment Variables → Encrypted)."
    );
  }
  if (hex.length !== KEY_BYTE_LENGTH * 2) {
    throw new Error(
      `ENCRYPTION_MASTER_KEY must be a ${KEY_BYTE_LENGTH * 2}-character hex ` +
        `string (32 bytes); got ${hex.length} characters.`
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("ENCRYPTION_MASTER_KEY must be hex-encoded (0-9, a-f).");
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  // btoa is available in Edge/Workers; it requires a binary string.
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

let cachedKey: CryptoKey | null = null;

/**
 * SubtleCrypto APIs expect `BufferSource` (= ArrayBuffer-backed views).
 * Under recent TS lib.dom typings `Uint8Array<ArrayBufferLike>` (the
 * default from `new Uint8Array()`) is no longer assignable, so wrap with
 * `.buffer as ArrayBuffer` to give the compiler the narrow type it wants.
 */
function asArrayBuffer(view: Uint8Array): ArrayBuffer {
  // Slice forces a fresh ArrayBuffer (vs ArrayBufferLike / SharedArrayBuffer)
  // which is what crypto.subtle requires under strict TS lib types.
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength
  ) as ArrayBuffer;
}

async function getCryptoKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const rawKey = hexToBytes(getMasterKeyHex());
  cachedKey = await crypto.subtle.importKey(
    "raw",
    asArrayBuffer(rawKey),
    { name: ALGO, length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return cachedKey;
}

export type EncryptedPayload = {
  /** base64(ciphertext || 16-byte gcm auth tag) */
  ciphertext: string;
  /** base64(12-byte IV) */
  iv: string;
};

/**
 * Encrypt a UTF-8 plaintext (e.g. an OAuth access token) with AES-256-GCM
 * under the master key. Returns base64 ciphertext + base64 IV; both must be
 * persisted together to decrypt later.
 */
export async function encryptToken(plaintext: string): Promise<EncryptedPayload> {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptToken: plaintext must be a non-empty string");
  }
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
  const data = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: ALGO, iv: asArrayBuffer(iv) },
    key,
    asArrayBuffer(data)
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(cipherBuf)),
    iv: bytesToBase64(iv),
  };
}

/**
 * Reverse of {@link encryptToken}. Throws on any tampering — AES-GCM rejects
 * mismatched auth tags, which surfaces as an "OperationError" from the
 * SubtleCrypto layer. Callers should treat any throw here as "credential
 * unrecoverable, force user to reconnect."
 */
export async function decryptToken(payload: EncryptedPayload): Promise<string> {
  if (!payload?.ciphertext || !payload?.iv) {
    throw new Error("decryptToken: ciphertext and iv are required");
  }
  const key = await getCryptoKey();
  const iv = base64ToBytes(payload.iv);
  const cipher = base64ToBytes(payload.ciphertext);
  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: ALGO, iv: asArrayBuffer(iv) },
      key,
      asArrayBuffer(cipher)
    );
    return new TextDecoder().decode(plainBuf);
  } catch (err) {
    throw new Error(
      "Failed to decrypt stored credential — the master key may have " +
        "rotated, or the ciphertext is corrupted. User must reconnect."
    );
  }
}

/**
 * Helper that returns the last 4 characters of a token for the UI "key hint"
 * column. Never log or persist anything longer than this from a real token.
 */
export function tokenHint(token: string): string {
  if (!token || token.length < 4) return "••••";
  return `••••${token.slice(-4)}`;
}
