/**
 * Ordered history of summarized pages (oldest first). Photos stay in
 * IndexedDB on the device; only the summary text lives in memory.
 */

import { ApiError, summarizeStream } from './api';
import type { Level } from './api';
import { preparePageImage } from './image';

export type PageState = 'streaming' | 'done' | 'error';

export interface SummaryPage {
  id: string;
  level: Level;
  text: string;
  state: PageState;
  error: string | null;
}

export type SessionEvent =
  | { kind: 'pages' }
  | { kind: 'page'; id: string };

interface StoredPhoto {
  blob: Blob;
  level: Level;
  text: string;
}

const DB_NAME = 'diagonal-history';
const STORE = 'photos';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    req.result.createObjectStore(STORE);
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error ?? new Error('indexeddb open failed'));
  return promise;
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  openDb().then(
    (db) => {
      let req: IDBRequest<T>;
      try {
        req = fn(db.transaction(STORE, mode).objectStore(STORE));
      } catch (e) {
        db.close();
        reject(e instanceof Error ? e : new Error(`${e}`));
        return;
      }
      req.onsuccess = () => {
        db.close();
        resolve(req.result);
      };
      req.onerror = () => {
        db.close();
        reject(req.error ?? new Error('indexeddb failed'));
      };
    },
    (e: unknown) => reject(e instanceof Error ? e : new Error(`${e}`)),
  );
  return promise;
}

async function readPhoto(id: string): Promise<StoredPhoto | null> {
  try {
    const row = await tx('readonly', (s) => s.get(id));
    if (!row) return null;
    const candidate = row as Partial<StoredPhoto>;
    if (
      !(candidate.blob instanceof Blob) ||
      typeof candidate.text !== 'string'
    ) {
      return null;
    }
    const level: Level =
      candidate.level === 'low' ||
      candidate.level === 'high' ||
      candidate.level === 'max'
        ? candidate.level
        : 'high';
    return { blob: candidate.blob, level, text: candidate.text };
  } catch {
    return null;
  }
}

function writePhoto(id: string, photo: StoredPhoto): Promise<void> {
  return tx('readwrite', (s) => s.put(photo, id)).then(
    () => undefined,
    () => undefined,
  );
}

function deletePhoto(id: string): Promise<void> {
  return tx('readwrite', (s) => s.delete(id)).then(
    () => undefined,
    () => undefined,
  );
}

/** Quota-denied paths surface denialMessage, never raw status codes. */
function friendlyError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 402) return 'Out of pages — subscribe for unlimited.';
    if (e.status === 429) {
      if (e.excerpt.includes('daily_limit_reached')) {
        return 'Daily limit reached — new pages tomorrow.';
      }
      return 'Monthly cap reached — new pages next month.';
    }
  }
  return e instanceof Error ? e.message : `${e}`;
}

export class ReadingSession {
  readonly pages: SummaryPage[] = [];
  private listeners = new Set<(e: SessionEvent) => void>();

  constructor(readonly userId: string) {}

  onChange(fn: (e: SessionEvent) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(e: SessionEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  private page(id: string): SummaryPage | undefined {
    return this.pages.find((p) => p.id === id);
  }

  /** Load previously saved pages; skips rows with missing blobs. */
  async restore(): Promise<void> {
    let db: IDBDatabase | null = null;
    try {
      db = await openDb();
    } catch {
      return;
    }
    const keys: string[] = await new Promise((resolve) => {
      let done = false;
      const finish = (out: string[]): void => {
        if (!done) {
          done = true;
          resolve(out);
        }
      };
      try {
        const cursor = db
          .transaction(STORE, 'readonly')
          .objectStore(STORE)
          .openCursor();
        const out: string[] = [];
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (c) {
            out.push(`${c.key}`);
            c.continue();
          } else {
            finish(out);
          }
        };
        cursor.onerror = () => finish(out);
      } catch {
        finish([]);
      }
    });
    db.close();
    let added = false;
    for (const id of keys) {
      const photo = await readPhoto(id);
      if (!photo) continue;
      this.pages.push({
        id,
        level: photo.level,
        text: photo.text,
        state: photo.text !== '' ? 'done' : 'error',
        error: photo.text !== '' ? null : 'Empty response from model',
      });
      added = true;
    }
    if (added) this.emit({ kind: 'pages' });
  }

  /**
   * Register a page immediately (UI can navigate to it) and stream
   * the summary in the background.
   */
  async startPage(source: Blob, level: Level): Promise<SummaryPage> {
    const id = crypto.randomUUID();
    const page: SummaryPage = {
      id,
      level,
      text: '',
      state: 'streaming',
      error: null,
    };
    this.pages.push(page);
    this.emit({ kind: 'pages' });
    // Photo persistence failed — the page still streams; a reload
    // just won't restore it.
    await writePhoto(id, { blob: source, level, text: '' });
    void this.run(id);
    return page;
  }

  retry(page: SummaryPage): Promise<void> {
    return this.resummarize(page, page.level);
  }

  /** Resubmits the stored blob (costs quota like a fresh capture). */
  async resummarize(page: SummaryPage, level: Level): Promise<void> {
    page.level = level;
    page.text = '';
    page.state = 'streaming';
    page.error = null;
    this.emit({ kind: 'page', id: page.id });
    const stored = await readPhoto(page.id);
    if (stored) await writePhoto(page.id, { ...stored, level, text: '' });
    return this.run(page.id);
  }

  deletePage(page: SummaryPage): void {
    const idx = this.pages.findIndex((p) => p.id === page.id);
    if (idx < 0) return;
    this.pages.splice(idx, 1);
    this.emit({ kind: 'pages' });
    void deletePhoto(page.id);
  }

  private async run(id: string): Promise<void> {
    const page = this.page(id);
    if (!page) return;
    try {
      const stored = await readPhoto(id);
      if (!stored || stored.blob.size === 0) {
        throw new Error('Photo unavailable — capture the page again.');
      }
      const jpeg = await preparePageImage(stored.blob);
      const stream = summarizeStream(jpeg, page.level, this.userId);
      let yielded = false;
      for await (const delta of stream) {
        const current = this.page(id);
        if (!current) return;
        current.text += delta;
        yielded = true;
        this.emit({ kind: 'page', id });
      }
      const current = this.page(id);
      if (!current) return;
      if (!yielded || current.text === '') {
        current.state = 'error';
        current.error = 'Empty response from model';
      } else {
        current.state = 'done';
        current.error = null;
      }
      this.emit({ kind: 'page', id });
      await writePhoto(id, {
        blob: stored.blob,
        level: current.level,
        text: current.text,
      });
    } catch (e) {
      const current = this.page(id);
      if (!current) return;
      current.state = 'error';
      current.error = friendlyError(e);
      this.emit({ kind: 'page', id });
    }
  }
}
