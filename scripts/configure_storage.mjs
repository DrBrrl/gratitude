/** Private administrative setup; never run during a public frontend build. */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const target = process.argv[2];
if (!['preview', 'production'].includes(target)) throw new Error('Usage: nix develop -c node scripts/configure_storage.mjs preview|production');
const config = JSON.parse(readFileSync(`config/firebase-${target}.json`, 'utf8'));
const auth = require('firebase-tools/lib/auth');
const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error('Run firebase login first.');
const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
async function api(url, method = 'GET', body, missing = false) {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (missing && response.status === 404) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error?.message ?? 'Storage configuration failed'}`);
  return data;
}
const project = `projects/${config.appId.split(':')[1]}`;
for (const service of ['firebasestorage.googleapis.com', 'storage.googleapis.com']) {
  let operation = await api(`https://serviceusage.googleapis.com/v1/${project}/services/${service}:enable`, 'POST', {});
  for (let attempt = 0; !operation.done; attempt++) {
    if (attempt >= 60) throw new Error('Storage API setup still running; rerun later.');
    await new Promise(resolve => setTimeout(resolve, 1000));
    operation = await api(`https://serviceusage.googleapis.com/v1/${operation.name}`);
  }
  if (operation.error) throw new Error(operation.error.message);
}
const endpoint = `https://firebasestorage.googleapis.com/v1alpha/${project}/defaultBucket`;
let bucket = await api(endpoint, 'GET', undefined, true);
if (!bucket) {
  bucket = await api(endpoint, 'POST', { location: 'australia-southeast1' });
}
const name = `${config.projectId}.firebasestorage.app`;
await api(`https://storage.googleapis.com/storage/v1/b/${name}`, 'PATCH', {
  cors: [{ origin: ['https://drbrrl.github.io', 'http://127.0.0.1:5173', 'http://localhost:5173'], method: ['GET'], responseHeader: ['Content-Type'], maxAgeSeconds: 3600 }]
});
const verified = await api(`https://storage.googleapis.com/storage/v1/b/${name}`);
const policy = await api(`https://storage.googleapis.com/storage/v1/b/${name}/iam`);
if (policy.bindings?.some(binding => binding.members?.some(member => ['allUsers', 'allAuthenticatedUsers'].includes(member)))) throw new Error('Bucket has a public IAM grant; review before use.');
console.log(`${target}: ${verified.name} in ${verified.location}; authenticated browser downloads configured.`);
