// The sync code is the only key to a user's synced data. Three values are
// derived from it, so the server never sees the code itself:
//   - syncId: which sync space to use (part of the URL)
//   - token:  proves the right to read and write it (the server keeps only its hash)
//   - key:    AES-GCM key; every item is encrypted before it leaves the browser

const CODE_BYTES = 20;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O, U
const SALT = new TextEncoder().encode("cv-forge-sync-v1");
const FORMAT_VERSION = 1;
const IV_BYTES = 12;

export type SyncKeys = { syncId: string; token: string; key: CryptoKey };

function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(text: string): Uint8Array<ArrayBuffer> | null {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) return null;
    value = ((value << 5) | digit) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** A new random sync code, grouped for reading: `K7QD-9M2X-…`. */
export function generateSyncCode(): string {
  return formatSyncCode(toBase32(crypto.getRandomValues(new Uint8Array(CODE_BYTES))));
}

function formatSyncCode(compact: string): string {
  return compact.match(/.{1,4}/g)!.join("-");
}

/**
 * Reads a code as typed or pasted: any case, with or without dashes and
 * spaces, with the letters people confuse for digits. Returns the canonical
 * form, or null when it is not a sync code.
 */
export function parseSyncCode(input: string): string | null {
  const compact = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  const length = Math.ceil((CODE_BYTES * 8) / 5);
  if (compact.length !== length || !fromBase32(compact)) return null;
  return formatSyncCode(compact);
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function deriveSyncKeys(code: string): Promise<SyncKeys> {
  const canonical = parseSyncCode(code);
  if (!canonical) throw new Error("Invalid sync code.");
  const secret = fromBase32(canonical.replace(/-/g, ""))!;
  const material = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveBits", "deriveKey"]);
  const params = (label: string): HkdfParams => ({ name: "HKDF", hash: "SHA-256", salt: SALT, info: new TextEncoder().encode(label) });

  const id = new Uint8Array(await crypto.subtle.deriveBits(params("sync id"), material, 128));
  const token = new Uint8Array(await crypto.subtle.deriveBits(params("auth token"), material, 256));
  const key = await crypto.subtle.deriveKey(params("encryption key"), material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  return {
    syncId: [...id].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    token: base64url(token),
    key
  };
}

async function pipe(bytes: Uint8Array, transform: GenericTransformStream): Promise<Uint8Array> {
  const stream = new Response(bytes as BodyInit).body!.pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Compresses and encrypts `value`. The item id is bound as associated data,
 * so the server cannot pass one item's data off as another's.
 */
export async function encryptItem(key: CryptoKey, id: string, value: unknown): Promise<string> {
  const plain = await pipe(new TextEncoder().encode(JSON.stringify(value)), new CompressionStream("gzip"));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) }, key, plain as BufferSource)
  );
  const out = new Uint8Array(1 + IV_BYTES + cipher.length);
  out[0] = FORMAT_VERSION;
  out.set(iv, 1);
  out.set(cipher, 1 + IV_BYTES);
  return base64url(out);
}

export async function decryptItem(key: CryptoKey, id: string, blob: string): Promise<unknown> {
  const bytes = fromBase64url(blob);
  if (bytes[0] !== FORMAT_VERSION) throw new Error("Synced data uses an unknown format. Update the app.");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.subarray(1, 1 + IV_BYTES), additionalData: new TextEncoder().encode(id) },
    key,
    bytes.subarray(1 + IV_BYTES)
  );
  const json = await pipe(new Uint8Array(plain), new DecompressionStream("gzip"));
  return JSON.parse(new TextDecoder().decode(json));
}
