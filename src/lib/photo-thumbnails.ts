type Thumbnail = { references: number; promise: Promise<string>; url: string };
type Options = { render?: (blob: Blob) => Promise<string>; revoke?: (url: string) => void; limit?: number; concurrency?: number };

async function renderThumbnail(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Thumbnail rendering unavailable');
    const scale = Math.max(96 / bitmap.width, 96 / bitmap.height);
    context.drawImage(bitmap, (96 - bitmap.width * scale) / 2, (96 - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
    const small = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Thumbnail rendering unavailable')), 'image/jpeg', .8));
    return URL.createObjectURL(small);
  } finally { bitmap.close(); }
}

/** Owner-bound, memory-only thumbnails. No private bytes enter the public shell cache. */
export class PhotoThumbnailCache {
  private entries = new Map<string, Thumbnail>();
  private queue: (() => Promise<void>)[] = [];
  private running = 0;
  private closed = false;
  private render: (blob: Blob) => Promise<string>;
  private revoke: (url: string) => void;
  private limit: number;
  private concurrency: number;
  private read: (id: string) => Promise<Blob>;
  constructor(read: (id: string) => Promise<Blob>, options: Options = {}) {
    this.read = read;
    this.render = options.render ?? renderThumbnail;
    this.revoke = options.revoke ?? (url => URL.revokeObjectURL(url));
    this.limit = options.limit ?? 64;
    this.concurrency = options.concurrency ?? 2;
  }
  acquire(id: string) {
    if (this.closed) throw new Error('Photo session ended');
    let entry = this.entries.get(id);
    if (entry) { this.entries.delete(id); this.entries.set(id, entry); entry.references++; }
    else {
      let resolve!: (url: string) => void, reject!: (error: unknown) => void;
      entry = { references: 1, url: '', promise: new Promise<string>((yes, no) => { resolve = yes; reject = no; }) };
      const item = entry;
      this.entries.set(id, item);
      this.queue.push(async () => {
        try {
          if (this.closed) throw new Error('Photo session ended');
          const blob = await this.read(id);
          if (this.closed) throw new Error('Photo session ended');
          const url = await this.render(blob);
          if (this.closed) { this.revoke(url); throw new Error('Photo session ended'); }
          item.url = url; resolve(url); this.trim();
        } catch (error) {
          if (this.entries.get(id) === item) this.entries.delete(id);
          reject(error);
        }
      });
      this.pump();
    }
    const item = entry;
    let released = false;
    return { promise: item.promise, release: () => {
      if (released) return;
      released = true; item.references--; this.trim();
    } };
  }
  private pump() {
    while (this.queue.length && this.running < this.concurrency) {
      const task = this.queue.shift()!; this.running++;
      void task().finally(() => { this.running--; this.pump(); });
    }
  }
  private trim() {
    let unused = [...this.entries.values()].filter(entry => !entry.references && entry.url).length;
    for (const [id, entry] of this.entries) {
      if (unused <= this.limit) break;
      if (!entry.references && entry.url) { this.revoke(entry.url); this.entries.delete(id); unused--; }
    }
  }
  dispose() {
    this.closed = true;
    for (const entry of this.entries.values()) if (entry.url) this.revoke(entry.url);
    this.entries.clear();
    // Drain queued tasks without downloading them, rejecting their waiting consumers.
    this.pump();
  }
}
