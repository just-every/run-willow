import { localPortability } from '@runeditrun/rer/portability';

const ownerReauthorizationRequired = ['notices', 'oidc', 'model', 'businessImport', 'policyAssistant', 'workflowAssistant', 'oktaProvisioning','signing','agentDoor'];
const pauseConnections = (table, row) => {
 if (table === 'agent_door_state') return {...row,envelope:null,local_document:null,local_revision:0,local_paused:1,decision_lock:null,decision_until:null};
 if (table === 'agent_door_approvals' && ['pending','executing'].includes(row.state)) return {...row,state:'expired'};
 if (table === 'bs_settings') return {...row,stopped:0,owner_id:null,document:null,rev:0,token:'',applied_at:null};
 if (table === 'agent_door_agents') return {...row,revoked:1};
 if (table === 'wl_sign_reviews') return {...row,used_at:row.used_at??Date.now()};
 if (table === 'wl_sign_requests' && ['sent','viewed'].includes(row.state)) return {...row,state:'voided',closure_reason:'restored',revision:row.revision+1};
 if (table === 'wl_sign_cohorts') return {...row,future_joiners:0,notify:0,stopped_at:row.stopped_at??Date.now()};
 if (table === 'wl_okta_reviews') return { ...row, status: row.status === 'verified' ? 'verified' : 'closed' };
 if (table === 'wl_okta_settings') return { ...row, enabled: 0 };
 if (table === 'wl_ai_settings') return { ...row, enabled: 0, policies: 0, workflows: 0, provider_retention: 'unapproved', consent_version: '' };
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
 excludeTables: ['wl_agent_installation_owner','wl_agent_people','bs_team','wl_sign_payloads','wl_identity_token_health','wl_api_credentials','wl_api_credential_limits','wl_oauth_tokens','wl_oauth_codes','wl_oauth_refresh','wl_webhooks','wl_webhook_deliveries','wl_ai_workflow_step_approvals'],
 buckets: { files: { prefix: 'sha256/' } },
 requiredConfiguration: ['OWNER_EMAIL', 'SESSION_SECRET', 'SETUP_TOKEN', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'],
 exportRow: pauseConnections,
 importSafety: {
  agent_door_state:{envelope:[null],local_document:[null],local_revision:[0],local_paused:[1]},
  agent_door_approvals:{state:['executed','refused','expired','rejected']},
  bs_settings:{stopped:[0],owner_id:[null],document:[null],rev:[0]},
  agent_door_agents:{revoked:[1]},
  wl_sign_cohorts: { future_joiners:[0],notify:[0] },
  wl_sign_requests: { state:['signed','declined','expired','voided','withdrawn'] },
  wl_okta_settings: { enabled: [0] },
  wl_okta_reviews: { status: ['verified','closed'] },
  wl_ai_settings: { enabled: [0], policies: [0], workflows: [0], provider_retention: ['unapproved'], consent_version: [''] },
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
   context.store.report('Owner reauthorization required for notices, OIDC, model connections, policy answers, workflow assistance, Okta account work and Business imports. Review provider handling and consent in Connections, relink identity and enable Business imports in Import settings when ready. Privileged workflow steps need fresh signoffs. Unsigned signature requests and cohort enrollment remain stopped; reissue requires fresh review and consent.');
   return { ...result, ownerReauthorizationRequired: [...ownerReauthorizationRequired] };
  },
 };
}
