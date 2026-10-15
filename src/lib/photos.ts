import { ref, uploadBytes, getBlob, getMetadata, deleteObject } from 'firebase/storage';
import type { FirebaseClient } from './firebase/client';
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
