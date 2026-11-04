/* Minimal self-contained UTF-8 ZIP writer (stored, uncompressed). No remote dependencies. */
(function (root) {
  "use strict";
  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function u16(a, off, n) { a[off] = n & 255; a[off + 1] = (n >>> 8) & 255; }
  function u32(a, off, n) { u16(a, off, n); u16(a, off + 2, n >>> 16); }
  function stamp(date) {
    const year = Math.max(1980, date.getFullYear());
    return {time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >>> 1), date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()};
  }
  function makeZip(entries, date = new Date()) {
    if (entries.length > 65535) throw Error("Too many files for this ZIP format");
    const locals = [], centrals = [];
    let offset = 0;
    const tm = stamp(date);
    for (const entry of entries) {
      const name = encoder.encode(entry.name);
      const bytes = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
      if (name.byteLength > 65535 || bytes.byteLength > 0xffffffff) throw Error("ZIP entry is too large");
      const crc = crc32(bytes);
      const local = new Uint8Array(30 + name.length + bytes.length);
      u32(local, 0, 0x04034b50); u16(local, 4, 20); u16(local, 6, 0x0800);
      u16(local, 8, 0); u16(local, 10, tm.time); u16(local, 12, tm.date);
      u32(local, 14, crc); u32(local, 18, bytes.length); u32(local, 22, bytes.length);
      u16(local, 26, name.length); u16(local, 28, 0);
      local.set(name, 30); local.set(bytes, 30 + name.length);
      const central = new Uint8Array(46 + name.length);
      u32(central, 0, 0x02014b50); u16(central, 4, 20); u16(central, 6, 20);
      u16(central, 8, 0x0800); u16(central, 10, 0);
      u16(central, 12, tm.time); u16(central, 14, tm.date);
      u32(central, 16, crc); u32(central, 20, bytes.length); u32(central, 24, bytes.length);
      u16(central, 28, name.length); u16(central, 30, 0); u16(central, 32, 0);
      u16(central, 34, 0); u16(central, 36, 0); u32(central, 38, 0);
      u32(central, 42, offset);
      central.set(name, 46);
      locals.push(local); centrals.push(central);
      offset += local.length;
      if (offset > 0xffffffff) throw Error("ZIP exceeds 4GB");
    }
    const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
    if (offset + centralSize > 0xffffffff) throw Error("ZIP exceeds 4GB");
    const end = new Uint8Array(22);
    u32(end, 0, 0x06054b50); u16(end, 4, 0); u16(end, 6, 0);
    u16(end, 8, entries.length); u16(end, 10, entries.length);
    u32(end, 12, centralSize); u32(end, 16, offset); u16(end, 20, 0);
    return new Blob([...locals, ...centrals, end], {type: "application/zip"});
  }
  root.GNSZip = {makeZip};
})(typeof globalThis !== "undefined" ? globalThis : this);
