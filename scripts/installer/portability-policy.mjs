import { PortabilityError } from '@runeditrun/rer/modules/portability';
// Connection consent belongs to the running installation, never to an archive.
// Keep business/history rows untouched; archived settings need fresh owner consent.
export default {
 product: 'people/willow',
 excludeTables: ['wl_identity_token_health'],
 buckets: { files: { prefix: 'sha256/' } },
 requiredConfiguration: ['OWNER_EMAIL', 'SESSION_SECRET', 'SETUP_TOKEN', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'],
 exportRow(table, row) {
  return table === 'wl_connections' ? { ...row, notices: 0, oidc: 0, model: null } : row;
 },
 async validateStaged({ tables, read }) {
  if (!tables.wl_connections) return true;
  const connections = await read('wl_connections');
  if (connections.some(row => row.notices !== 0 || row.oidc !== 0 || row.model !== null)) {
   throw new PortabilityError('restore_connections_require_paused_archive', 409);
  }
  return true;
 },
};
