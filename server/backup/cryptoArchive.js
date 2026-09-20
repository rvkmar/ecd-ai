/**
 * D107 — AES-256-GCM for scheduled backups.
 * Key comes from ECD_BACKUP_ENCRYPTION_KEY (host/.env / secret manager) —
 * never hardcoded in docker-compose.yml.
 */
import crypto from "crypto";

const MAGIC = Buffer.from("ECDB");
const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Buffer | null}
 */
export function parseBackupEncryptionKey(env = process.env) {
  const raw = (env.ECD_BACKUP_ENCRYPTION_KEY || "").trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  const asB64 = Buffer.from(raw, "base64");
  if (asB64.length === 32) return asB64;
  // Passphrase → stable 32-byte key (ops may use a long secret string).
  if (Buffer.byteLength(raw, "utf8") >= 32) {
    return crypto.createHash("sha256").update(raw, "utf8").digest();
  }
  return null;
}

/**
 * @param {Buffer} plaintext
 * @param {Buffer} key 32 bytes
 * @returns {Buffer}
 */
export function encryptBackupBlob(plaintext, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("Backup encryption key must be 32 bytes");
  }
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), iv, tag, ciphertext]);
}

/**
 * @param {Buffer} blob
 * @param {Buffer} key
 * @returns {Buffer}
 */
export function decryptBackupBlob(blob, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("Backup encryption key must be 32 bytes");
  }
  if (!Buffer.isBuffer(blob) || blob.length < MAGIC.length + 1 + IV_LEN + TAG_LEN) {
    throw new Error("Backup blob too short");
  }
  if (!blob.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Backup blob missing ECDB magic");
  }
  const version = blob[MAGIC.length];
  if (version !== VERSION) {
    throw new Error(`Unsupported backup blob version ${version}`);
  }
  let o = MAGIC.length + 1;
  const iv = blob.subarray(o, o + IV_LEN);
  o += IV_LEN;
  const tag = blob.subarray(o, o + TAG_LEN);
  o += TAG_LEN;
  const ciphertext = blob.subarray(o);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
