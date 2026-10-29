import type { Photo } from './domain.ts';
import type { DayIndex } from './calendar.ts';
import { chronologicalEntries } from './journal.ts';
import type { PhotoThumbnailCache } from './photo-thumbnails.ts';

export type CalendarPhotos = { days: Map<string, string>; cache: PhotoThumbnailCache };

/** Most recent dated reflection with live photos; its first occupied slot wins. */
export function indexCalendarPhotos(days: DayIndex, photos: Photo[]) {
  const first = new Map<string, Photo>();
  for (const photo of photos) {
    if (photo.removed) continue;
    const previous = first.get(photo.entryId);
    if (!previous || photo.slot < previous.slot) first.set(photo.entryId, photo);
  }
  const result = new Map<string, string>();
  for (const [day, entries] of days) {
    for (const entry of chronologicalEntries(entries)) {
      const photo = first.get(entry.id);
      if (photo) { result.set(day, photo.photoId); break; }
    }
  }
  return result;
}
