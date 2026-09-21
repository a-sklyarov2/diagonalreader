/**
 * Library sheet: usage, subscription, reading preferences, device.
 * Opened from the quota pill (cog) on camera and the gear in reader.
 * Checkout/portal are explicit buttons here — never auto-redirects.
 */

import { openPortal, startCheckout } from './api';
import type { Billing } from './billing';
import {
  getTextSize,
  getVoice,
  onPrefsChange,
  setTextSize,
  setVoice,
  TEXT_SIZES,
} from './prefs';
import type { TextSize, Voice } from './prefs';
import { snackbar } from './ui';

function nextResetLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1));
  const name = d.toLocaleString('en', { month: 'long', timeZone: 'UTC' });
  return `Resets 1 ${name}`;
}

export class LibraryView {
  private root: HTMLElement;
  private unsubBilling: (() => void) | null = null;
  private unsubPrefs: (() => void) | null = null;
  private destroyed = false;

  constructor(
    private app: HTMLElement,
    private billing: Billing,
    private userId: string,
    private onClose: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'library-overlay';
    this.root.dataset.testid = 'libraryView';
  }

  mount(): void {
    this.app.appendChild(this.root);
    this.unsubBilling = this.billing.onChange(() => {
      if (!this.destroyed) this.render();
    });
    this.unsubPrefs = onPrefsChange(() => {
      if (!this.destroyed) this.render();
    });
    this.render();
    void this.billing.refreshQuota();
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubBilling?.();
    this.unsubPrefs?.();
    this.root.remove();
  }

  private async subscribe(): Promise<void> {
    try {
      await startCheckout(this.userId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : `${e}`;
      if (msg.startsWith('redirecting')) return;
      snackbar(msg);
    }
  }

  private async manage(): Promise<void> {
    try {
      await openPortal(this.userId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : `${e}`;
      if (msg.startsWith('redirecting')) return;
      snackbar(msg);
    }
  }

  private render(): void {
    if (this.destroyed) return;
    this.root.innerHTML = '';

    const sheet = document.createElement('div');
    sheet.className = 'library';

    const head = document.createElement('div');
    head.className = 'library-head';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'icon-btn';
    back.dataset.testid = 'libraryBack';
    back.textContent = '←';
    back.setAttribute('aria-label', 'Back');
    back.addEventListener('click', () => this.onClose());
    const title = document.createElement('div');
    title.className = 'library-title';
    title.textContent = 'Library';
    head.append(back, title);
    sheet.appendChild(head);

    sheet.appendChild(this.usageCard());
    sheet.appendChild(this.subscriptionCard());
    sheet.appendChild(this.readingCard());
    sheet.appendChild(this.deviceCard());

    this.root.appendChild(sheet);
    this.root.onclick = (e) => {
      if (e.target === this.root) this.onClose();
    };
  }

  private card(title: string): { el: HTMLElement; body: HTMLElement } {
    const el = document.createElement('section');
    el.className = 'library-card';
    const h = document.createElement('h2');
    h.textContent = title;
    const body = document.createElement('div');
    el.append(h, body);
    return { el, body };
  }

  private usageCard(): HTMLElement {
    const { el, body } = this.card('Usage');
    body.dataset.testid = 'usageCard';
    const quota = this.billing.quota;

    if (!this.billing.ready) {
      body.textContent = 'Checking usage…';
      el.appendChild(body);
      return el;
    }
    if (!quota) {
      const p = document.createElement('p');
      p.className = 'library-muted';
      p.textContent = this.billing.quotaError ?? 'Usage unavailable.';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'library-btn secondary';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => void this.billing.refreshQuota());
      body.append(p, retry);
      return el;
    }

    const big = document.createElement('div');
    big.className = 'library-big';
    big.textContent = quota.pillLabel;
    body.appendChild(big);

    const bar = document.createElement('div');
    bar.className = 'library-bar';
    const fill = document.createElement('div');
    fill.className = 'library-bar-fill';
    const pct = quota.unlimited
      ? Math.min(100, (quota.paidUsed / quota.paidCap) * 100)
      : quota.freeTotal > 0
        ? Math.min(100, (quota.freeUsed / quota.freeTotal) * 100)
        : 0;
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);
    body.appendChild(bar);

    const sub = document.createElement('p');
    sub.className = 'library-muted';
    if (quota.unlimited) {
      sub.textContent =
        `Unlimited · ${quota.paidUsed} pages this month · ` +
        `${quota.dailyUsed} of ${quota.dailyCap} today`;
    } else {
      const reset = nextResetLabel(quota.month);
      sub.textContent =
        `${quota.freeUsed} of ${quota.freeTotal} free pages used` +
        (reset ? ` · ${reset}` : '');
      if (!quota.canSummarize) {
        const deny = document.createElement('p');
        deny.className = 'library-warn';
        deny.textContent = quota.denialMessage;
        body.appendChild(sub);
        body.appendChild(deny);
        return el;
      }
    }
    body.appendChild(sub);
    return el;
  }

  private subscriptionCard(): HTMLElement {
    const { el, body } = this.card('Subscription');
    const quota = this.billing.quota;

    if (quota?.unlimited) {
      const p = document.createElement('p');
      p.textContent =
        'Unlimited is active on this device. Summarize as much as you read.';
      const manage = document.createElement('button');
      manage.type = 'button';
      manage.className = 'library-btn secondary';
      manage.dataset.testid = 'libraryManage';
      manage.textContent = 'Manage subscription';
      manage.addEventListener('click', () => void this.manage());
      const note = document.createElement('p');
      note.className = 'library-muted';
      note.textContent =
        'Cancel anytime — access runs to the end of the paid period.';
      body.append(p, manage, note);
      return el;
    }

    const p = document.createElement('p');
    p.textContent =
      '100 free pages every month. Unlimited removes the counter: ' +
      'summarize as much as you read, with fair guardrails ' +
      '(500 pages a day, 10,000 a month) so one account can’t resell the model.';
    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'library-btn primary';
    cta.dataset.testid = 'librarySubscribe';
    cta.textContent = 'Subscribe for unlimited';
    cta.addEventListener('click', () => void this.subscribe());
    const note = document.createElement('p');
    note.className = 'library-muted';
    note.textContent = 'One monthly plan · cancel anytime in the portal.';
    body.append(p, cta, note);
    return el;
  }

  private segmented<T extends string>(
    options: Array<{ value: T; label: string; testid: string }>,
    current: T,
    onPick: (v: T) => void,
  ): HTMLElement {
    const seg = document.createElement('div');
    seg.className = 'segmented library-seg';
    seg.setAttribute('role', 'group');
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opt.label;
      btn.dataset.testid = opt.testid;
      btn.setAttribute('aria-pressed', `${current === opt.value}`);
      btn.addEventListener('click', () => onPick(opt.value));
      seg.appendChild(btn);
    }
    return seg;
  }

  private readingCard(): HTMLElement {
    const { el, body } = this.card('Reading');

    const voiceLabel = document.createElement('div');
    voiceLabel.className = 'library-label';
    voiceLabel.textContent = 'Summary voice';
    const voice = this.segmented<Voice>(
      [
        { value: 'faithful', label: "Author's voice", testid: 'voiceFaithful' },
        { value: 'plain', label: 'Plain language', testid: 'voicePlain' },
      ],
      getVoice(),
      (v) => setVoice(v),
    );
    const voiceNote = document.createElement('p');
    voiceNote.className = 'library-muted';
    voiceNote.textContent =
      getVoice() === 'plain'
        ? 'Retells the same ideas in simple, everyday language — best for dense, old, or technical books.'
        : 'Keeps the author’s style, tone and words — reads like a shorter version of the page.';
    const voiceNote2 = document.createElement('p');
    voiceNote2.className = 'library-muted';
    voiceNote2.textContent =
      'Applies to new pages, and to re-summaries from ↻.';

    const sizeLabel = document.createElement('div');
    sizeLabel.className = 'library-label';
    sizeLabel.textContent = 'Text size';
    const size = this.segmented<TextSize>(
      [
        { value: 'small', label: 'Small', testid: 'sizeSmall' },
        { value: 'medium', label: 'Medium', testid: 'sizeMedium' },
        { value: 'large', label: 'Large', testid: 'sizeLarge' },
      ],
      getTextSize(),
      (v) => setTextSize(v),
    );
    const sizePreview = document.createElement('p');
    sizePreview.className = 'library-preview';
    sizePreview.style.fontSize = `${TEXT_SIZES[getTextSize()].px}px`;
    sizePreview.textContent = 'The organization man wants to belong together.';

    body.append(voiceLabel, voice, voiceNote, voiceNote2);
    body.append(sizeLabel, size, sizePreview);
    return el;
  }

  private deviceCard(): HTMLElement {
    const { el, body } = this.card('This device');
    const row = document.createElement('div');
    row.className = 'library-row';
    const id = document.createElement('code');
    id.className = 'library-id';
    id.textContent = this.userId;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'library-btn secondary';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => {
      void navigator.clipboard
        ?.writeText(this.userId)
        .catch(() => undefined);
    });
    row.append(id, copy);
    const links = document.createElement('p');
    links.className = 'library-muted';
    const priv = document.createElement('a');
    priv.href = '/privacy-policy';
    priv.target = '_blank';
    priv.rel = 'noopener';
    priv.textContent = 'Privacy';
    const sep = document.createTextNode(' · ');
    const del = document.createElement('a');
    del.href = '/data-deletion';
    del.target = '_blank';
    del.rel = 'noopener';
    del.textContent = 'Data deletion';
    links.append(priv, sep, del);
    body.append(row, links);
    return el;
  }
}
