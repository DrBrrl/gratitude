/** Administrative setup. Run deliberately; never part of a public Pages build. */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const target = process.argv[2];
if (!['preview', 'production'].includes(target)) throw new Error('Usage: nix develop -c node scripts/configure_ai.mjs preview|production');
const file = `config/firebase-${target}.json`;
const config = JSON.parse(readFileSync(file, 'utf8'));
const project = `projects/${config.appId.split(':')[1]}`;
const auth = require('firebase-tools/lib/auth');
const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error('Run firebase login first.');
await require('firebase-tools/lib/requireAuth').requireAuth({ project: config.projectId, nonInteractive: true, ...account });
await require('firebase-tools/lib/management/provisioning/provision').provisionFirebaseApp({
  project: { parent: { type: 'existing_project', projectId: config.projectId } },
  app: { platform: 'WEB', appId: config.appId }, features: { firebaseAiLogicInput: {} }
});
const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
async function api(url, method = 'GET', body) {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error?.message ?? 'Administrative request failed'}`);
  return data;
}
async function operation(value) {
  for (let attempt = 0; !value.done; attempt++) {
    if (attempt >= 60) throw new Error('Setup is still running; rerun after the API operation finishes.');
    await new Promise(resolve => setTimeout(resolve, 1000));
    value = await api(`https://serviceusage.googleapis.com/v1/${value.name}`);
  }
  if (value.error) throw new Error(value.error.message);
}
for (const service of ['recaptchaenterprise.googleapis.com', 'firebaseappcheck.googleapis.com']) {
  await operation(await api(`https://serviceusage.googleapis.com/v1/${project}/services/${service}:enable`, 'POST', {}));
}
const keysUrl = `https://recaptchaenterprise.googleapis.com/v1/projects/${config.projectId}/keys`;
const keys = await api(keysUrl);
const label = `Gratitude ${target} App Check`;
const key = keys.keys?.find(item => item.displayName === label) ?? await api(keysUrl, 'POST', {
  displayName: label, webSettings: { allowedDomains: ['drbrrl.github.io'], integrationType: 'SCORE' }
});
const siteKey = key.name.split('/').at(-1);
const appName = `${project}/apps/${config.appId}/recaptchaEnterpriseConfig`;
await api(`https://firebaseappcheck.googleapis.com/v1/${appName}?updateMask=siteKey,tokenTtl`, 'PATCH', { name: appName, siteKey, tokenTtl: '3600s' });
const serviceName = `${project}/services/firebaseml.googleapis.com`;
await api(`https://firebaseappcheck.googleapis.com/v1/${serviceName}?updateMask=enforcementMode`, 'PATCH', { name: serviceName, enforcementMode: 'ENFORCED' });
await api(`https://firebasevertexai.googleapis.com/v1beta/projects/${config.projectId}/locations/global/config?updateMask=trafficFilter.firebaseAuthRequired`, 'PATCH', { trafficFilter: { firebaseAuthRequired: true } });
const metric = 'firebasevertexai.googleapis.com%2Fgenerate_content_requests_per_minute_per_project_per_user';
const limitUrl = `https://serviceusage.googleapis.com/v1beta1/${project}/services/firebasevertexai.googleapis.com/consumerQuotaMetrics/${metric}/limits/%2Fmin%2Fproject%2Fregion%2Fuser`;
const limit = await api(limitUrl);
const existing = limit.quotaBuckets?.find(bucket => !bucket.dimensions)?.consumerOverride;
if (existing) await api(`https://serviceusage.googleapis.com/v1beta1/${existing.name}?force=true`, 'PATCH', { overrideValue: '5' });
else await api(`${limitUrl}/consumerOverrides?force=true`, 'POST', { overrideValue: '5' });
// Setup never links billing or enables sharing of personal context.
config.appCheckSiteKey = siteKey;
config.aiDataMode ??= 'generic';
writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
console.log(`${target}: AI Logic configured with App Check, Firebase Auth, 5 requests/minute/user and ${config.aiDataMode} context.`);
