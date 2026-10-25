import { ref, uploadBytes, getBlob, getBytes, getMetadata, deleteObject } from 'firebase/storage';
import type { FirebaseClient } from './firebase/client';
import { sha256 } from './import-archive.ts';
import { GENERATION } from './domain.ts';
export type StagedPhoto = { photoId: string; eventId: string; blob: Blob; slot: number; previousEventId: string | null };
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export function photoPath(uid: string, photoId: string) { return `users/${uid}/${GENERATION}/${photoId}`; }
/** Decode orientation, downsize large camera images and re-encode: no EXIF/GPS leaves the device. */
export async function preparePhoto(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP photo.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Choose a photo smaller than 10 MB.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('This photo could not be opened. Try another image.'); }
  try {
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo processing is unavailable in this browser.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not prepare this photo.')), 'image/jpeg', .9));
    if (blob.size > MAX_PHOTO_BYTES) throw new Error('This photo is still too large. Choose a smaller image.');
    return blob;
  } finally { bitmap.close(); }
}
export async function uploadPhoto(client: FirebaseClient, uid: string, photoId: string, blob: Blob) {
  const object = ref(client.storage, photoPath(uid, photoId));
  // Objects are immutable; a retry acknowledges a completed upload instead of overwriting it.
  try { await getMetadata(object); return; }
  catch (cause) { if ((cause as { code?: string }).code !== 'storage/object-not-found') throw cause; }
  await uploadBytes(object, blob, { contentType: 'image/jpeg', cacheControl: 'private, max-age=0' });
}
export function readPhoto(client: FirebaseClient, uid: string, photoId: string) {
  // Authenticated bytes, never a permanent bearer-token download URL in the DOM or exports.
  return getBlob(ref(client.storage, photoPath(uid, photoId)), MAX_PHOTO_BYTES);
}
export async function erasePhoto(client: FirebaseClient, uid: string, photoId: string) {
  try { await deleteObject(ref(client.storage, photoPath(uid, photoId))); }
  catch (cause) { if ((cause as { code?: string }).code !== 'storage/object-not-found') throw cause; }
}

/** Import retries verify identity and bytes; existence alone is never an acknowledgement. */
export async function uploadImportedPhoto(client: FirebaseClient, uid: string, photoId: string, sourceKey: string, sourceDigest: string, blob: Blob) {
  const object = ref(client.storage, photoPath(uid, photoId));
  const verify = async () => {
    const metadata = await getMetadata(object);
    const custom = metadata.customMetadata;
    if (metadata.contentType !== 'image/jpeg' || !metadata.size || metadata.size > MAX_PHOTO_BYTES || custom?.importSourceKey !== sourceKey || custom.sourceDigest !== sourceDigest || !/^[a-f0-9]{64}$/.test(custom.storedDigest ?? '')) throw new Error('An existing import photo has different identity or integrity metadata. Nothing was overwritten.');
    const stored = await getBytes(object, MAX_PHOTO_BYTES);
    if (await sha256(new Uint8Array(stored)) !== custom.storedDigest) throw new Error('An existing import photo failed its integrity check. Nothing was overwritten.');
  };
  try { await verify(); return; }
  catch (cause) { if ((cause as { code?: string }).code !== 'storage/object-not-found') throw cause; }
  const storedDigest = await sha256(new Uint8Array(await blob.arrayBuffer()));
  try { await uploadBytes(object, blob, { contentType: 'image/jpeg', cacheControl: 'private, max-age=0', customMetadata: { importSourceKey: sourceKey, sourceDigest, storedDigest } }); }
  catch (cause) {
    // A concurrent immutable create may win with another valid JPEG encoding.
    // Acknowledge only a complete, authenticated, verified winning object.
    try { await verify(); return; } catch (verification) {
      if ((verification as { code?: string }).code === 'storage/object-not-found') throw cause;
      throw verification;
    }
  }
  await verify();
}
