import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PhotoThumbnailCache } from '../../src/lib/photo-thumbnails.ts';

test('thumbnail reads are shared across surfaces and only unused LRU images are evicted', async () => {
  const reads: string[] = [], revoked: string[] = [];
  const cache = new PhotoThumbnailCache(async id => { reads.push(id); return new Blob([id]); }, {
    render: async blob => `blob:${await blob.text()}`, revoke: url => revoked.push(url), limit: 1
  });
  const first = cache.acquire('one'), shared = cache.acquire('one');
  assert.equal(await first.promise, 'blob:one'); assert.equal(await shared.promise, 'blob:one');
  assert.deepEqual(reads, ['one']);
  const two = cache.acquire('two'); await two.promise; two.release();
  const three = cache.acquire('three'); await three.promise; three.release();
  assert.deepEqual(revoked, ['blob:two'], 'An image still used by a date circle cannot be evicted');
  first.release(); shared.release();
  assert.ok(revoked.includes('blob:one'));
  cache.dispose(); assert.ok(revoked.includes('blob:three'));
  assert.throws(() => cache.acquire('another'), /session ended/);
});

test('sign-out discards an in-flight result and never downloads queued photos for the old owner', async () => {
  let finish!: (value: string) => void;
  const reads: string[] = [], revoked: string[] = [];
  const cache = new PhotoThumbnailCache(async id => { reads.push(id); return new Blob([id]); }, {
    render: () => new Promise(resolve => finish = resolve), revoke: url => revoked.push(url), concurrency: 1
  });
  const first = cache.acquire('old-owner'), queued = cache.acquire('queued');
  const rejected = Promise.all([assert.rejects(first.promise, /session ended/), assert.rejects(queued.promise, /session ended/)]);
  await Promise.resolve(); cache.dispose(); finish('blob:late-private-photo');
  await rejected;
  assert.deepEqual(reads, ['old-owner']); assert.deepEqual(revoked, ['blob:late-private-photo']);
});

test('failed reads can be retried without keeping a broken image in the cache', async () => {
  let attempts = 0;
  const cache = new PhotoThumbnailCache(async () => { if (++attempts === 1) throw new Error('Unavailable'); return new Blob(); }, { render: async () => 'blob:retried', revoke: () => {} });
  const failed = cache.acquire('photo'); await assert.rejects(failed.promise, /Unavailable/); failed.release();
  const retried = cache.acquire('photo'); assert.equal(await retried.promise, 'blob:retried');
  retried.release(); cache.dispose(); assert.equal(attempts, 2);
});
