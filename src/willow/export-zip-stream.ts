import { updateZipCrc32 } from './export-zip';

export interface ZipStreamFile {
  name: string;
  size: number;
  open: () => Promise<ReadableStream<Uint8Array>>;
}

/** Store-only ZIP streamed in file order; retains only directory metadata. */
export function exportZipStream(files: ZipStreamFile[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const entries = files.map(file => ({ ...file, nameBytes: encoder.encode(file.name), offset: 0, crc: 0 }));
  if (entries.length >= 0xffff || entries.some(file => file.nameBytes.length > 0xffff
    || !Number.isSafeInteger(file.size) || file.size < 0 || file.size >= 0xffffffff)) {
    throw new RangeError('Export exceeds standard ZIP limits');
  }
  const totalSize = entries.reduce((sum, file) => sum + 30 + 16 + 46 + file.nameBytes.length * 2 + file.size, 22);
  if (totalSize >= 0xffffffff) throw new RangeError('Export exceeds standard ZIP size limit');
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let cancelled = false;
  // Numeric fields are written little-endian; byte arrays are copied unchanged.
  function record(parts: (Uint8Array | [number, number])[]): Uint8Array {
    const result = new Uint8Array(parts.reduce((sum, part) => sum + (part instanceof Uint8Array ? part.length : part[0]), 0));
    const view = new DataView(result.buffer);
    let at = 0;
    for (const part of parts) {
      if (part instanceof Uint8Array) { result.set(part, at); at += part.length; }
      else { if (part[0] === 2) view.setUint16(at, part[1], true); else view.setUint32(at, part[1], true); at += part[0]; }
    }
    return result;
  }
  async function* archive(): AsyncGenerator<Uint8Array, void, unknown> {
    let offset = 0;
    try {
      for (const file of entries) {
        if (cancelled) return;
        file.offset = offset;
        const header = record([[4, 0x04034b50], [2, 20], [2, 0x0808], [2, 0], [2, 0], [2, 33],
          [4, 0], [4, 0], [4, 0], [2, file.nameBytes.length], [2, 0], file.nameBytes]);
        offset += header.length;
        yield header;
        if (cancelled) return;
        const source = await file.open();
        if (cancelled) { await source.cancel(); return; }
        activeReader = source.getReader();
        let size = 0;
        let crc = 0xffffffff;
        while (!cancelled) {
          const { value, done } = await activeReader.read();
          if (cancelled) return;
          if (done) break;
          size += value.length;
          if (size > file.size) throw new Error(`ZIP entry size mismatch: ${file.name}`);
          crc = updateZipCrc32(crc, value);
          offset += value.length;
          if (value.length) yield value;
        }
        activeReader.releaseLock();
        activeReader = undefined;
        if (size !== file.size) throw new Error(`ZIP entry size mismatch: ${file.name}`);
        file.crc = (crc ^ 0xffffffff) >>> 0;
        const descriptor = record([[4, 0x08074b50], [4, file.crc], [4, size], [4, size]]);
        offset += descriptor.length;
        yield descriptor;
      }
      const directoryOffset = offset;
      for (const file of entries) {
        const directory = record([[4, 0x02014b50], [2, 20], [2, 20], [2, 0x0808], [2, 0], [2, 0], [2, 33],
          [4, file.crc], [4, file.size], [4, file.size], [2, file.nameBytes.length], [2, 0], [2, 0],
          [2, 0], [2, 0], [4, 0], [4, file.offset], file.nameBytes]);
        offset += directory.length;
        yield directory;
      }
      yield record([[4, 0x06054b50], [2, 0], [2, 0], [2, entries.length], [2, entries.length],
        [4, offset - directoryOffset], [4, directoryOffset], [2, 0]]);
    } finally {
      if (activeReader) {
        try { await activeReader.cancel(); } finally { activeReader.releaseLock(); activeReader = undefined; }
      }
    }
  }
  const iterator = archive();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (!cancelled) { if (next.done) controller.close(); else controller.enqueue(next.value); }
      } catch (error) { if (!cancelled) controller.error(error); }
    },
    async cancel(reason) {
      cancelled = true;
      try { await activeReader?.cancel(reason); } finally { await iterator.return(undefined); }
    },
  }, { highWaterMark: 0 });
}
