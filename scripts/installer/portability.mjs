import { link, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { localPortability } from '@runeditrun/rer/portability';
import { normalizeArchive } from './normalize-archive.mjs';

// The seed owns non-portable consent; Base owns verified atomic data transfer.
export function willowPortability() {
 const transfer = localPortability({ database: 'willow', buckets: { files: 'FILES' },
  policy: { product: 'people/willow', excludeTables: ['wl_identity_token_health'],
   buckets: { files: { prefix: 'sha256/' } },
   requiredConfiguration: ['OWNER_EMAIL', 'SESSION_SECRET', 'SETUP_TOKEN', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'] },
  transient: ['local runtime caches and logs'] });
 return { ...transfer,
  async export(context) {
   await mkdir(dirname(context.path), { recursive: true, mode: 0o700 });
   const scratch = await mkdtemp(join(dirname(context.path), '.willow-export-'));
   let prepared;
   try {
    const result = await transfer.export({ ...context, path: join(scratch, 'source.rer') });
    prepared = await normalizeArchive(join(scratch, 'source.rer'), { directory: scratch });
    // Publish complete, verified bytes atomically; never replace an existing backup.
    await link(prepared.path, context.path);
    return { ...result, output: relative(context.root, context.path),
     contentHash: prepared.report.importedContentHash, archiveHash: prepared.report.importedArchiveHash };
   } finally { await prepared?.cleanup(); await rm(scratch, { recursive: true, force: true }); }
  },
  async import(context) {
   const prepared = await normalizeArchive(context.path, { legacy: !!context.legacyRecovery });
   try {
    const result = await transfer.import({ ...context, path: prepared.path });
    const normalization = prepared.report;
    context.store.report(`Connection authority normalized on import: ${normalization.disabled.join(', ') || 'already off'}. Owner reauthorization required for notices, OIDC and model connections.`);
    return { ...result, input: relative(context.root, context.path), connectionNormalization: normalization };
   } finally { await prepared.cleanup(); }
  },
 };
}
