const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

/** Incremental CRC state; start with 0xffffffff and finish with XOR 0xffffffff. */
export function updateZipCrc32(crc: number, bytes: Uint8Array): number {
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return crc >>> 0;
}

/** Store-only ZIP of arbitrary bytes, with UTF-8 names and CRC32 checksums. */
export function exportZip(files: [string, Uint8Array][]): Uint8Array {
  const entries = files.map(([name, data]) => (
    { name: encoder.encode(name), data, crc: (updateZipCrc32(0xffffffff, data) ^ 0xffffffff) >>> 0, offset: 0 }
  ));
  if (entries.length > 0xffff || entries.some(entry => entry.name.length > 0xffff)) {
    throw new RangeError('Export exceeds ZIP entry count or filename size limit');
  }
  const localSize = entries.reduce((sum, entry) => sum + 30 + entry.name.length + entry.data.length, 0);
  const directorySize = entries.reduce((sum, entry) => sum + 46 + entry.name.length, 0);
  if (localSize + directorySize + 22 > 0xffffffff) throw new RangeError('Employee workbook exceeds ZIP size limit');
  const bytes = new Uint8Array(localSize + directorySize + 22);
  const view = new DataView(bytes.buffer);
  let position = 0;
  const u16 = (value: number) => { view.setUint16(position, value, true); position += 2; };
  const u32 = (value: number) => { view.setUint32(position, value, true); position += 4; };
  const write = (value: Uint8Array) => { bytes.set(value, position); position += value.length; };
  for (const entry of entries) {
    entry.offset = position;
    u32(0x04034b50); u16(20); u16(0x0800); u16(0); u16(0); u16(33);
    u32(entry.crc); u32(entry.data.length); u32(entry.data.length);
    u16(entry.name.length); u16(0); write(entry.name); write(entry.data);
  }
  for (const entry of entries) {
    u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(0); u16(0); u16(33);
    u32(entry.crc); u32(entry.data.length); u32(entry.data.length);
    u16(entry.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(entry.offset);
    write(entry.name);
  }
  u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length);
  u32(directorySize); u32(localSize); u16(0);
  return bytes;
}
