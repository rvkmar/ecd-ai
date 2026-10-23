// Minimal ZIP read/write on Node zlib. No extra package: the CI audit
// stays on the existing tree. Supports stored and deflate entries, UTF-8
// names, and rejects encryption, ZIP64, path traversal, and expansion
// past the caller's limits (zip bombs).

import { crc32, deflateRawSync, inflateRawSync } from "zlib";

export const ZIP_LIMITS = Object.freeze({
  maxBytes: 8 * 1024 * 1024,
  maxEntries: 100,
  maxUncompressed: 32 * 1024 * 1024,
  maxFileUncompressed: 8 * 1024 * 1024,
  // Claimed expansion above this, once the entry is larger than 64 KiB,
  // is refused before inflate. inflateRawSync also gets maxOutputLength.
  maxRatio: 100,
  ratioFloor: 64 * 1024,
});

export class ZipError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ZipError";
    this.status = status;
  }
}

function dosDateTime(date = new Date()) {
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, dosDate };
}

function assertSafeZipName(name) {
  if (typeof name !== "string" || name.length === 0) {
    throw new ZipError("Zip entry name is empty.");
  }
  if (name.includes("\0")) {
    throw new ZipError("Zip entry name is not allowed.");
  }
  const normalized = name.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    throw new ZipError(`Zip entry path is absolute: ${name}`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === "..")) {
    throw new ZipError(`Zip entry path escapes the archive: ${name}`);
  }
  return normalized;
}

function findEocd(buf) {
  const min = Math.max(0, buf.length - (22 + 65535));
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) !== 0x06054b50) continue;
    const commentLen = buf.readUInt16LE(i + 20);
    if (i + 22 + commentLen === buf.length) return i;
  }
  throw new ZipError("Not a zip archive.");
}

function readCentralDirectory(buf, limits) {
  const eocd = findEocd(buf);
  const disk = buf.readUInt16LE(eocd + 4);
  const cdDisk = buf.readUInt16LE(eocd + 6);
  const entriesOnDisk = buf.readUInt16LE(eocd + 8);
  const totalEntries = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);

  if (disk !== 0 || cdDisk !== 0) {
    throw new ZipError("Multi-disk zip archives are not accepted.");
  }
  if (
    entriesOnDisk === 0xffff ||
    totalEntries === 0xffff ||
    cdSize === 0xffffffff ||
    cdOffset === 0xffffffff
  ) {
    throw new ZipError("ZIP64 archives are not accepted.");
  }
  if (totalEntries !== entriesOnDisk) {
    throw new ZipError("Zip central directory count is inconsistent.");
  }
  if (totalEntries > limits.maxEntries) {
    throw new ZipError(
      `Zip has ${totalEntries} entries; the limit is ${limits.maxEntries}.`
    );
  }
  if (cdOffset + cdSize > buf.length) {
    throw new ZipError("Zip central directory is truncated.");
  }

  const entries = [];
  let p = cdOffset;
  const end = cdOffset + cdSize;
  for (let n = 0; n < totalEntries; n++) {
    if (p + 46 > end) throw new ZipError("Zip central directory is truncated.");
    if (buf.readUInt32LE(p) !== 0x02014b50) {
      throw new ZipError("Zip central directory is damaged.");
    }
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const nameStart = p + 46;
    const nameEnd = nameStart + nameLen;
    if (nameEnd + extraLen + commentLen > end) {
      throw new ZipError("Zip central directory is truncated.");
    }
    if (compSize === 0xffffffff || uncompSize === 0xffffffff || localOff === 0xffffffff) {
      throw new ZipError("ZIP64 archives are not accepted.");
    }
    const name = buf.slice(nameStart, nameEnd).toString("utf8");
    entries.push({ flags, method, crc, compSize, uncompSize, name, localOff });
    p = nameEnd + extraLen + commentLen;
  }
  return entries;
}

function inflateEntry(comp, uncompSize, limits) {
  if (uncompSize > limits.maxFileUncompressed) {
    throw new ZipError("A zip entry exceeds the uncompressed size limit.");
  }
  if (
    comp.length > 0 &&
    uncompSize > limits.ratioFloor &&
    uncompSize / comp.length > limits.maxRatio
  ) {
    throw new ZipError("Zip entry expands too far for its compressed size.");
  }
  let raw;
  try {
    raw = inflateRawSync(comp, { maxOutputLength: limits.maxFileUncompressed });
  } catch (err) {
    throw new ZipError(
      err?.code === "ERR_BUFFER_TOO_LARGE"
        ? "A zip entry exceeds the uncompressed size limit."
        : "Zip entry could not be inflated."
    );
  }
  if (raw.length !== uncompSize) {
    throw new ZipError("Zip entry size does not match its directory record.");
  }
  return raw;
}

function readEntryBytes(buf, entry, limits) {
  if (entry.flags & 0x1) {
    throw new ZipError("Encrypted zip entries are not accepted.");
  }
  if (entry.flags & 0x20) {
    throw new ZipError("Patched zip entries are not accepted.");
  }
  const off = entry.localOff;
  if (off + 30 > buf.length || buf.readUInt32LE(off) !== 0x04034b50) {
    throw new ZipError("Zip local header is missing.");
  }
  const nameLen = buf.readUInt16LE(off + 26);
  const extraLen = buf.readUInt16LE(off + 28);
  const dataStart = off + 30 + nameLen + extraLen;
  const dataEnd = dataStart + entry.compSize;
  if (dataEnd > buf.length) throw new ZipError("Zip entry is truncated.");
  const comp = buf.subarray(dataStart, dataEnd);

  let raw;
  if (entry.method === 0) {
    if (entry.uncompSize !== comp.length) {
      throw new ZipError("Stored zip entry size does not match.");
    }
    if (entry.uncompSize > limits.maxFileUncompressed) {
      throw new ZipError("A zip entry exceeds the uncompressed size limit.");
    }
    raw = Buffer.from(comp);
  } else if (entry.method === 8) {
    raw = inflateEntry(comp, entry.uncompSize, limits);
  } else {
    throw new ZipError(`Zip compression method ${entry.method} is not accepted.`);
  }

  const actual = crc32(raw) >>> 0;
  if (actual !== (entry.crc >>> 0)) {
    throw new ZipError(`Zip entry checksum failed for ${entry.name}.`);
  }
  return raw;
}

/**
 * @param {Buffer | Uint8Array} input
 * @param {Partial<typeof ZIP_LIMITS>} [limits]
 * @returns {{ name: string, data: Buffer }[]}
 */
export function unzipSafe(input, limits = ZIP_LIMITS) {
  const merged = { ...ZIP_LIMITS, ...limits };
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf.length > merged.maxBytes) {
    throw new ZipError("Zip exceeds the size limit.", 413);
  }
  if (buf.length < 22) throw new ZipError("Not a zip archive.");

  const entries = readCentralDirectory(buf, merged);
  let totalUncompressed = 0;
  const files = [];
  for (const entry of entries) {
    const name = assertSafeZipName(entry.name);
    if (name.endsWith("/")) continue;
    totalUncompressed += entry.uncompSize;
    if (totalUncompressed > merged.maxUncompressed) {
      throw new ZipError("Zip uncompressed contents exceed the size limit.");
    }
    const data = readEntryBytes(buf, entry, merged);
    files.push({ name, data });
  }
  return files;
}

/**
 * @param {Record<string, string | Buffer>} files
 * @returns {Buffer}
 */
export function zipFiles(files) {
  const names = Object.keys(files);
  if (names.length > ZIP_LIMITS.maxEntries) {
    throw new ZipError(`Zip cannot contain more than ${ZIP_LIMITS.maxEntries} files.`);
  }
  const { time, dosDate } = dosDateTime();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const name of names) {
    const safe = assertSafeZipName(name);
    const data = Buffer.isBuffer(files[name])
      ? files[name]
      : Buffer.from(String(files[name]), "utf8");
    if (data.length > ZIP_LIMITS.maxFileUncompressed) {
      throw new ZipError(`'${safe}' exceeds the uncompressed size limit.`);
    }
    let method = 8;
    let stored = deflateRawSync(data);
    if (stored.length >= data.length) {
      method = 0;
      stored = data;
    }
    const checksum = crc32(data) >>> 0;
    const nameBuf = Buffer.from(safe, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    const localBytes = Buffer.concat([local, nameBuf, stored]);
    locals.push(localBytes);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuf]));
    offset += localBytes.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, eocd]);
}
