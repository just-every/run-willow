import { constants } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { canonicalJson, makePart, readArchive } from '@runeditrun/rer/modules/portability';
import { ArchiveVerifier, ContentVerifier, readLegacyArchive } from '@runeditrun/rer/modules/portability/format';

const connectionKeys = ['notices', 'oidc', 'model'];

/** Verify a backup and privately disable restored consent; v1 requires explicit recovery. */
export async function normalizeArchive(path, { directory = tmpdir(), legacy = false } = {}) {
  let source, output, scratch;
  const cleanup = async () => {
    if (scratch) {
      await rm(scratch, { recursive: true, force: true });
      scratch = undefined;
    }
  };
  try {
    source = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await source.stat({ bigint: true });
    if (!before.isFile() || (before.mode & 0o7777n) !== 0o600n
      || (typeof process.getuid === 'function' && before.uid !== BigInt(process.getuid()))) {
      throw new Error('Restore archive must be a private, owned regular file with mode 0600');
    }
    scratch = await mkdtemp(join(directory, 'willow-normalize-'));
    const normalizedPath = join(scratch, 'normalized.rer');
    output = await open(normalizedPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const writeRecord = async record => {
      const bytes = Buffer.from(canonicalJson(record) + '\n');
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesWritten } = await output.write(bytes, offset, bytes.length - offset);
        if (!bytesWritten) throw new Error('Restore archive write made no progress');
        offset += bytesWritten;
      }
    };
    let content, archive, closing, importedArchiveHash, importedContentHash;
    let connections = 0;
    const disabled = new Set();
    const stream = Readable.toWeb(source.createReadStream({ autoClose: false }));
    // Both readers verify content and trailing data. Only the v2 reader can
    // authenticate the original manifest binding; v1 is explicit recovery only.
    const reader = legacy ? readLegacyArchive : readArchive;
    for await (const record of reader(stream)) {
      if (record.kind === 'manifest') {
        content = new ContentVerifier(record);
        archive = new ArchiveVerifier(record);
        await writeRecord(record);
      } else if (record.kind === 'part') {
        let changed = false;
        for (const item of record.items) {
          if (item.kind !== 'row' || item.table !== 'wl_connections') continue;
          connections++;
          for (const key of connectionKeys) {
            const off = key === 'model' ? null : 0;
            if (item.row[key] !== off) { disabled.add(key); changed = true; }
          }
          item.row = { ...item.row, notices: 0, oidc: 0, model: null };
        }
        const part = changed ? await makePart(record.index, record.items) : record;
        archive.add(part);
        for (const item of part.items) content.add(item);
        await writeRecord(part);
      } else {
        closing = record;
        importedArchiveHash = archive.digest();
        importedContentHash = content.digest();
        await writeRecord({ ...record, contentHash: importedContentHash, archiveHash: importedArchiveHash });
      }
    }
    const after = await source.stat({ bigint: true });
    if (['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'mode', 'uid'].some(key => before[key] !== after[key])) {
      throw new Error('Restore archive changed while being verified');
    }
    await source.close(); source = undefined;
    await output.sync();
    await output.close(); output = undefined;
    const normalized = disabled.size > 0;
    const report = {
      normalized, connections,
      disabled: connectionKeys.filter(key => disabled.has(key)),
      ownerReauthorizationRequired: [...connectionKeys],
      sourceArchiveHash: closing.archiveHash,
      importedArchiveHash,
      importedContentHash,
    };
    return { path: normalizedPath, report, cleanup };
  } catch (error) {
    await Promise.allSettled([source?.close(), output?.close()]);
    await cleanup();
    throw error;
  }
}
