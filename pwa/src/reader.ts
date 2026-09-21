/** Vertical scroll-snap pager over summarized pages (newest last). */

import type { Level } from './api';
import { Billing } from './billing';
import { getTextSize, getVoice, onPrefsChange, TEXT_SIZES } from './prefs';
import { ReadingSession } from './session';
import type { SummaryPage } from './session';
import { snackbar } from './ui';
const LEVELS: Level[] = ['low', 'high', 'max'];

function levelLabel(level: Level): string {
  return level === 'low' ? 'Low' : level === 'high' ? 'High' : 'Max';
}

export class ReaderView {
  private root: HTMLElement;
  private pagesEl: HTMLElement | null = null;
  private counterEl: HTMLElement | null = null;
  private current = 0;
  private pages: SummaryPage[] = [];
  private photoUrls = new Map<string, string>();
  private unsub: (() => void) | null = null;
  private destroyed = false;

  constructor(
    private app: HTMLElement,
    private session: ReadingSession,
    private billing: Billing,
    private initialIndex: number,
    private onEmpty: () => void,
    private onBack: () => void,
    private onLibrary: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'reader';
  }

  mount(): void {
    this.app.appendChild(this.root);
    this.pages = [...this.session.pages];
    this.current = Math.min(
      Math.max(this.initialIndex, 0),
      Math.max(this.pages.length - 1, 0),
    );
    this.render();
    const unsubSession = this.session.onChange((e) => {
      if (this.destroyed) return;
      if (e.kind === 'pages') {
        // Keep the snapshot stable across deletes/added pages.
        const ids = new Set(this.pages.map((p) => p.id));
        for (const p of this.session.pages) {
          if (!ids.has(p.id)) this.pages.push(p);
        }
        if (this.pages.length === 0) {
          this.close();
          return;
        }
        this.current = Math.min(this.current, this.pages.length - 1);
        this.render();
      } else {
        this.renderPage(e.id);
      }
      this.renderCounter();
    });
    // Text-size changes re-render in place (no new quota spent).
    const unsubPrefs = onPrefsChange(() => {
      if (!this.destroyed) this.render();
    });
    this.unsub = () => {
      unsubSession();
      unsubPrefs();
    };
    this.scrollTo(this.current, false);
  }

  destroy(): void {
    this.destroyed = true;
    this.unsub?.();
    this.unsub = null;
    for (const url of this.photoUrls.values()) URL.revokeObjectURL(url);
    this.photoUrls.clear();
    this.root.remove();
  }

  private close(): void {
    this.onEmpty();
  }

  private gated(action: () => Promise<void>): void {
    void (async () => {
      const allowed = await this.billing.ensureAllowance();
      if (!allowed) {
        snackbar(
          this.billing.lastError ??
            'Out of pages — subscribe to keep reading.',
        );
        return;
      }
      await action();
    })();
  }

  private photoUrl(page: SummaryPage): string | null {
    const cached = this.photoUrls.get(page.id);
    if (cached) return cached;
    return null;
  }

  private async loadPhoto(page: SummaryPage, img: HTMLImageElement): Promise<void> {
    if (this.photoUrls.has(page.id)) {
      img.src = this.photoUrls.get(page.id) ?? '';
      return;
    }
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('diagonal-history', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () =>
          reject(req.error ?? new Error('indexeddb open failed'));
      });
      const blob = await new Promise<Blob | null>((resolve) => {
        try {
          const t = db.transaction('photos', 'readonly');
          const req = t.objectStore('photos').get(page.id);
          req.onsuccess = () => {
            const row = req.result as
              | { blob?: unknown }
              | null
              | undefined;
            db.close();
            resolve(
              row && row.blob instanceof Blob ? row.blob : null,
            );
          };
          req.onerror = () => {
            db.close();
            resolve(null);
          };
        } catch {
          db.close();
          resolve(null);
        }
      });
      if (blob && !this.destroyed) {
        const url = URL.createObjectURL(blob);
        this.photoUrls.set(page.id, url);
        if (img.isConnected) img.src = url;
      }
    } catch {
      // Photo missing — text/error states render without it.
    }
  }

  private render(): void {
    if (this.destroyed) return;
    this.root.innerHTML = '';

    const pages = document.createElement('div');
    pages.className = 'reader-pages';
    pages.dataset.testid = 'readerPages';
    pages.addEventListener(
      'scroll',
      () => {
        const h = pages.clientHeight || 1;
        const idx = Math.round(pages.scrollTop / h);
        if (idx !== this.current && idx >= 0 && idx < this.pages.length) {
          this.current = idx;
          this.renderCounter();
        }
      },
      { passive: true },
    );
    this.pagesEl = pages;
    for (let i = 0; i < this.pages.length; i++) {
      pages.appendChild(this.pageEl(this.pages[i], i));
    }
    this.root.appendChild(pages);
    const top = document.createElement('div');
    top.className = 'reader-topbar';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'icon-btn';
    back.dataset.testid = 'readerBack';
    back.textContent = '←';
    back.setAttribute('aria-label', 'Back to camera');
    back.addEventListener('click', () => this.onBack());
    const counter = document.createElement('div');
    counter.className = 'page-counter';
    counter.dataset.testid = 'pageCounter';
    this.counterEl = counter;
    const gear = document.createElement('button');
    gear.type = 'button';
    gear.className = 'icon-btn';
    gear.dataset.testid = 'readerLibrary';
    gear.textContent = '⚙';
    gear.setAttribute('aria-label', 'Open library');
    gear.addEventListener('click', () => this.onLibrary());
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn danger';
    del.dataset.testid = 'deletePageButton';
    del.textContent = '🗑';
    del.setAttribute('aria-label', 'Delete summary');
    del.addEventListener('click', () => this.deleteCurrent());
    top.append(back, counter, gear, del);
    this.root.appendChild(top);
    this.renderCounter();

    const bottom = document.createElement('div');
    bottom.className = 'reader-bottom';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'next-btn';
    next.dataset.testid = 'nextPageButton';
    next.textContent = '📷 Next page';
    next.addEventListener('click', () => this.onBack());
    const menu = document.createElement('div');
    menu.className = 'resum-menu';
    const pop = document.createElement('div');
    pop.className = 'resum-pop';
    for (const level of LEVELS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.dataset.testid = `resummarize_${level}`;
      item.textContent = levelLabel(level);
      item.addEventListener('click', () => {
        pop.classList.remove('open');
        const page = this.pages[this.current];
        if (page) {
          this.gated(() =>
            this.session.resummarize(page, level, getVoice()),
          );
        }
      });
      pop.appendChild(item);
    }
    const resum = document.createElement('button');
    resum.type = 'button';
    resum.className = 'icon-btn';
    resum.dataset.testid = 'resummarizeButton';
    resum.textContent = '↻';
    resum.setAttribute('aria-label', 'Summarize again');
    resum.addEventListener('click', () => pop.classList.toggle('open'));
    menu.append(resum, pop);
    bottom.append(next, menu);
    this.root.appendChild(bottom);
  }

  private renderCounter(): void {
    if (this.counterEl) {
      this.counterEl.textContent = `${this.pages.length === 0 ? 0 : this.current + 1} / ${this.pages.length}`;
    }
  }

  private scrollTo(index: number, smooth = true): void {
    requestAnimationFrame(() => {
      if (!this.pagesEl || this.destroyed) return;
      const h = this.pagesEl.clientHeight;
      this.pagesEl.scrollTo({ top: index * h, behavior: smooth ? 'smooth' : 'auto' });
    });
  }

  private pageEl(page: SummaryPage, index: number): HTMLElement {
    const el = document.createElement('article');
    el.className = 'reader-page';
    el.dataset.testid = `readerPage_${index}`;
    el.dataset.pageId = page.id;
    this.fillPage(el, page);
    return el;
  }

  private fillPage(el: HTMLElement, page: SummaryPage): void {
    el.innerHTML = '';
    const waiting =
      page.state === 'streaming' && page.text === '' && page.error === null;

    const img = document.createElement('img');
    img.className = waiting ? 'reader-photo' : 'reader-photo blurred';
    img.alt = '';
    const cached = this.photoUrl(page);
    if (cached) {
      img.src = cached;
    } else {
      void this.loadPhoto(page, img);
    }
    el.appendChild(img);

    if (waiting) {
      const scan = document.createElement('div');
      scan.className = 'scan-overlay';
      scan.dataset.testid = 'scanOverlay';
      el.appendChild(scan);
    } else {
      const scrim = document.createElement('div');
      scrim.className = 'reader-scrim';
      el.appendChild(scrim);
    }

    const body = document.createElement('div');
    body.className = 'reader-body';
    if (page.error !== null) {
      const wrap = document.createElement('div');
      wrap.className = 'reader-error';
      const cloud = document.createElement('div');
      cloud.className = 'cloud';
      cloud.textContent = '☁';
      const msg = document.createElement('div');
      msg.dataset.testid = 'summaryError';
      msg.textContent = `Summary failed:\n${page.error}`;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'retry';
      retry.dataset.testid = 'retryButton';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => {
        this.gated(() => this.session.retry(page));
      });
      wrap.append(cloud, msg, retry);
      body.appendChild(wrap);
    } else if (page.text !== '') {
      const chip = document.createElement('div');
      chip.className = 'level-chip';
      chip.textContent =
        page.voice === 'plain'
          ? `${levelLabel(page.level)} · plain`
          : levelLabel(page.level);
      const text = document.createElement('div');
      text.className = 'summary-text';
      text.dataset.testid = 'summaryText';
      text.style.fontSize = `${TEXT_SIZES[getTextSize()].px}px`;
      if (page.state === 'streaming') {
        text.textContent = page.text;
        const cursor = document.createElement('span');
        cursor.className = 'cursor';
        text.appendChild(cursor);
      } else {
        text.textContent = page.text;
      }
      body.append(chip, text);
    }
    el.appendChild(body);
  }

  private renderPage(id: string): void {
    const page = this.pages.find((p) => p.id === id);
    if (!page) return;
    const el = this.root.querySelector<HTMLElement>(
      `[data-page-id="${CSS.escape(id)}"]`,
    );
    if (el) this.fillPage(el, page);
  }

  private deleteCurrent(): void {
    const page = this.pages[this.current];
    if (!page) return;
    this.session.deletePage(page);
    this.photoUrls.delete(page.id);
    this.pages.splice(this.current, 1);
    if (this.pages.length === 0) {
      this.close();
      return;
    }
    this.current = Math.min(
      Math.max(this.current, 0),
      this.pages.length - 1,
    );
    this.render();
    this.scrollTo(this.current, false);
  }
}
