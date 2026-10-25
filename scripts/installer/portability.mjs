import { localPortability } from '@runeditrun/rer/portability';

const ownerReauthorizationRequired = ['notices', 'oidc', 'model', 'businessImport'];
const pauseConnections = (table, row) => {
 if (table === 'wl_connections') return { ...row, notices: 0, oidc: 0, model: null };
 if (table === 'ik_door_settings') return { ...row, enabled: 0 };
 return row;
};

// Base loads this seed-owned policy in both preflight and the native transfer
// worker. Consent is paused in exported snapshots and verified import staging;
// source rows, archive bytes and every other business field stay unchanged.
export default {
 product: 'people/willow',
 // Door grants record consumed nonces: retain replay protection, permanent
 // revoked keys, approvals and custody; pause only Business enablement.
 excludeTables: ['wl_identity_token_health','wl_api_credentials','wl_api_credential_limits','wl_oauth_tokens','wl_webhooks','wl_webhook_deliveries'],
 buckets: { files: { prefix: 'sha256/' } },
 requiredConfiguration: ['OWNER_EMAIL', 'SESSION_SECRET', 'SETUP_TOKEN', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'],
 exportRow: pauseConnections,
 importSafety: {
  wl_connections: { notices: [0], oidc: [0], model: [null] },
  ik_door_settings: { enabled: [0] },
 },
 importRow: pauseConnections,
};

export function willowPortability() {
 const transfer = localPortability({
  database: 'willow', buckets: { files: 'FILES' },
  policyModule: new URL('./portability.mjs', import.meta.url),
  transient: ['local runtime caches and logs'],
 });
 return { ...transfer,
  async import(context) {
   const result = await transfer.import(context);
   context.store.report('Owner reauthorization required for notices, OIDC, model connections and Business imports. Enable notices, relink identity or select a model in Connections, and enable Business imports in Import settings when ready.');
   return { ...result, ownerReauthorizationRequired: [...ownerReauthorizationRequired] };
  },
 };
}
