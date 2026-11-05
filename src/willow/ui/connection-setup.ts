import { h } from './html'

const guide = 'https://github.com/just-every/run-willow/blob/main/CONNECTIONS.md'

export function runtimeSetup() {
  return h`<details class="card" id="runtime-setup"><summary>Where to configure connections</summary>
<p>These settings belong to the installation runtime. This page saves your choices and consent; it never accepts provider keys.</p>
<ul><li><strong>Local:</strong> add optional bindings to the checkout’s private <code>.dev.vars</code> file. Keep it private and outside version control, then restart <code>rer dev</code>. Local mail is suppressed without sending or storing messages, even when mail credentials are present. Open the <code>RER_OPEN</code> link printed by <code>rer dev</code> to sign in locally.</li>
<li><strong>Deployed:</strong> add public settings under <code>vars</code> in <code>deploy.json</code>. Add each secret under <code>secrets</code> as <code>{ "binding": "BINDING_NAME", "environment": "BINDING_NAME" }</code>, supply its value through that deployment environment, then run <code>rer deploy</code>. Never put secret values in <code>deploy.json</code>.</li></ul>
<p>Return here after the runtime restarts to enable each connection. Configuration alone does not prove a provider accepted a request. After restoring an installation, supply runtime bindings again and relink sign-in providers.</p>
<p><a href="${guide}#runtime-configuration-and-activation">Full connection setup guide</a></p></details>`
}

export function emailSetup() {
  return h`<details><summary>Email setup guide</summary><p><a href="#runtime-setup">Where to save runtime bindings</a></p>
<ol><li>For deployed email, set <code>MAIL_PROVIDER</code> to <code>resend</code>, <code>sendgrid</code>, <code>cloudflare</code> or <code>rer</code>, and set <code>MAIL_FROM</code> to your provider-approved sender address.</li>
<li>Supply secret <code>MAIL_API_KEY</code>. Cloudflare also needs <code>MAIL_ACCOUNT_ID</code>, its 32-character hexadecimal account ID. RER managed mail also needs <code>MAIL_RELAY_URL</code> supplied by your managed mail service.</li>
<li>Restart or deploy, then turn notices on below. Complete a task, decide leave or prepare a payroll handoff to generate an eligible notice, and check Notice history. “Accepted by provider” confirms submission, not inbox delivery.</li></ol>
<p>Local runs suppress mail automatically. A “Suppressed in local development” history result means no message was sent or stored.</p><p><a href="${guide}#runtime-configuration-and-activation">Email runtime reference</a></p></details>`
}

export function identitySetup(origin: string) {
  return h`<details><summary>Sign-in setup guide</summary><p><a href="#runtime-setup">Where to save runtime bindings</a></p>
<ol><li>Register an OIDC client with your provider. Set secret <code>OIDC_PROVIDERS</code> to a JSON array. Each entry needs <code>id</code>, <code>preset</code> and <code>clientId</code>. Supported presets are <code>auth</code>, <code>google</code>, <code>microsoft</code>, <code>okta</code> and the explicit incumbent <code>legacy-rs256</code>.</li>
<li>Google has a fixed issuer. Microsoft requires your specific <code>tenant</code>; Auth, Okta and the incumbent preset require the exact <code>issuer</code>. For shared-secret authentication, explicitly set <code>tokenAuthMethod</code> to <code>client_secret_basic</code> or <code>client_secret_post</code> and supply <code>clientSecret</code>. The default is <code>private_key_jwt</code>, requiring a private JWK in <code>privateKey</code> with a <code>kid</code> and its public key registered at the provider. Auth supports only this private-key method. The incumbent preset also requires exact <code>endpointPins</code> for authorization, token and JWKS URLs.</li>
<li>Microsoft and Okta require <code>subjectEmails</code>: a trusted map from each provider subject ID to that existing member’s email. Provider email claims do not establish membership for these presets.</li>
<li>Supply secret <code>OIDC_TRANSACTION_SECRET</code>, at least 32 characters and different from <code>SESSION_SECRET</code>. Register the callback <code>${origin}/auth/oidc/ID/callback</code>, replacing <code>ID</code> with the entry’s <code>id</code>. A configured <code>redirectUri</code> overrides this default and must use the same app origin.</li>
<li>Deploy with working email delivery. Local development suppresses confirmation mail. Request the link confirmation email below, open its confirmation link in this browser, then return here and apply the matching provider change. Use the separate unlink confirmation email before unlinking. Test a sign-in through each linked provider; email-link sign-in remains available.</li></ol>
<p><a href="${guide}#runtime-configuration-and-activation">Sign-in runtime reference</a> · <a href="https://github.com/just-every/run-willow/blob/main/src/modules/operator-auth/identity/oidc/README.md">Complete OIDC configuration and preset guide</a></p></details>`
}

export function modelSetup() {
  return h`<details><summary>Model setup guide</summary><p><a href="#runtime-setup">Where to save runtime bindings</a></p>
<ol><li>Set public <code>MODELS_ENDPOINT</code> to the provider’s HTTPS endpoint with the exact path <code>/v1/chat/completions</code>, without URL credentials, query or fragment. Local development also accepts HTTP on <code>localhost</code> or <code>127.0.0.1</code>.</li>
<li>Supply secret <code>MODELS_KEY</code>. Willow sends it as a Bearer key. Restart or deploy, then save a model identifier supported by that provider below.</li>
<li>Open Proposals and request a checklist draft from an active template. Check its cited source and result before accepting it. Turn model drafts off below to stop new checklist requests.</li></ol>
<p>The policy and workflow assistant has separate controls and consent below. It uses these same bindings, but requires <code>MODELS_ENDPOINT=https://api.openai.com/v1/chat/completions</code> and its supported model.</p>
<p><a href="${guide}#draft-boundary">Checklist draft guide</a> · <a href="${guide}#policy-and-workflow-assistants">Assistant setup guide</a></p></details>`
}
