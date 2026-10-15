import { entryPhotos, type Projection } from './domain.ts';
import { zipSync, strToU8 } from 'fflate';
import { colours, chronologicalEntries, entryTimestamp } from './journal.ts';
function escapeMarkdown(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}[\]()#+.!|~-]/g, '\\$&').replace(/\n/g, '  \n');
}
function localTimestamp(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
export function exportJournal(state: Projection, format: 'markdown' | 'json') {
  const entries = chronologicalEntries(state.entries).map((entry) => ({ id: entry.id, createdAt: entry.recordedAt, entryAt: entryTimestamp(entry), prompt: entry.prompt, text: entry.text, colour: colours[entry.colour], ...(entryPhotos(state, entry.id).length ? { photos: entryPhotos(state, entry.id).map(photo => ({ path: `attachments/${photo.photoId}.jpg`, summary: photo.summary, summaryOrigin: photo.origin, summaryStatus: photo.status })) } : {}) }));
  if (format === 'json') return { name: 'gratitude-journal.json', type: 'application/json', content: JSON.stringify({ format: 'gratitude-journal', version: 2, throughSequence: state.cursor, entries }, null, 2) + '\n' };
  // Render in the exporting browser’s local timezone, including historical DST.
  const content = ['# Gratitude journal', ...entries.map((entry) =>
    `## ${localTimestamp(entry.entryAt)}\n\n**Prompt**: ${escapeMarkdown(entry.prompt)}\n\n**Reflection**: ${escapeMarkdown(entry.text)}${entry.photos?.map(photo => `\n\n![Attached journal photo](${photo.path})\n\n**Image summary**: ${escapeMarkdown(photo.summary)}`).join('') ?? ''}`)].join('\n\n') + '\n';
  return { name: 'gratitude-journal.md', type: 'text/markdown', content };
}

/** A photo export is complete or fails visibly; never return a journal with missing files. */
export async function exportArchive(state: Projection, format: 'markdown' | 'json', load: (photoId: string) => Promise<Blob>) {
  const journal = exportJournal(state, format);
  const photos = state.entries.flatMap(entry => entryPhotos(state, entry.id));
  if (!photos.length) return { ...journal, content: journal.content as string | Uint8Array<ArrayBuffer> };
  const files: Record<string, Uint8Array> = { [journal.name]: strToU8(journal.content) };
  for (const photo of photos) files[`attachments/${photo.photoId}.jpg`] = new Uint8Array(await (await load(photo.photoId)).arrayBuffer());
  const content = new Uint8Array(zipSync(files, { level: 0 })); // JPEG is already compressed.
  return { name: `gratitude-journal-${format}.zip`, type: 'application/zip', content: content as string | Uint8Array<ArrayBuffer> };
}
