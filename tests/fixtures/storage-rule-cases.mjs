/** Synthetic contexts for the hosted Rules evaluator; never real journal objects. */
export function storageRuleCases(bucket) {
  const uid = 'storage-rule-probe-owner';
  const name = `users/${uid}/v1/metadata-probe`;
  const request = { path: `/b/${bucket}/o/${name}`, method: 'create',
    auth: { uid, token: { firebase: { sign_in_provider: 'google.com' } } },
    resource: { name, size: 4, contentType: 'image/jpeg' } };
  const valid = { importSourceKey: 'a'.repeat(64), sourceDigest: 'b'.repeat(64), storedDigest: 'c'.repeat(64) };
  const cases = [];
  const add = (label, expectation, change = {}, resource = null) => cases.push({ label, expectation, request: { ...request, ...change }, resource, expressionReportLevel: 'FULL' });
  for (const [label, metadata] of [['omitted', undefined], ['empty', {}], ['null', null], ['ordinary', { note: 'fictional fixture' }], ['import', valid]]) {
    add(`allow ${label} metadata`, 'ALLOW', { resource: { ...request.resource, ...(metadata !== undefined ? { metadata } : {}) } });
  }
  for (const key of Object.keys(valid)) {
    add(`deny partial ${key}`, 'DENY', { resource: { ...request.resource, metadata: { [key]: valid[key] } } });
    add(`deny malformed ${key}`, 'DENY', { resource: { ...request.resource, metadata: { ...valid, [key]: 'invalid' } } });
  }
  add('deny non-map metadata', 'DENY', { resource: { ...request.resource, metadata: 'invalid' } });
  add('deny other owner', 'DENY', { auth: { ...request.auth, uid: 'storage-rule-probe-stranger' } });
  add('deny anonymous', 'DENY', { auth: null });
  add('deny non-Google provider', 'DENY', { auth: { uid, token: { firebase: { sign_in_provider: 'password' } } } });
  add('deny overwrite', 'DENY', { method: 'update' }, request.resource);
  add('deny wrong MIME', 'DENY', { resource: { ...request.resource, contentType: 'image/png' } });
  add('deny oversized photo', 'DENY', { resource: { ...request.resource, size: 10 * 1024 * 1024 + 1 } });
  add('deny empty photo', 'DENY', { resource: { ...request.resource, size: 0 } });
  return cases;
}
