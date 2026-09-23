/**
 * Library sheet: usage, subscription, reading preferences, device.
 * Opened from the quota pill (cog) on camera and the gear in reader.
 * Checkout/portal are explicit buttons here — never auto-redirects.
 *
 * Rendering: the sheet is built once. Billing/prefs updates patch the
 * live DOM in place (scroll position preserved); only the mount-time
 * error→loaded transition rebuilds. Policy pages open in the system
 * browser (target _blank is unreliable inside installed standalone).
 */

import { fetchRecoveryCode, openPortal, recoverSubscription, requestCheckout } from './api';
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
import { showDialog, snackbar } from './ui';

const PENDING_RECOVERY_KEY = 'diagonal_pending_recovery';

function nextResetLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1));
  const name = d.toLocaleString('en', { month: 'long', timeZone: 'UTC' });
  return `Resets 1 ${name}`;
}

export class LibraryView {
  private root: HTMLElement;
  private sheet: HTMLElement | null = null;
  private voiceNote: HTMLElement | null = null;
  private sizePreview: HTMLElement | null = null;
  private built = false;
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
      if (!this.destroyed) this.update();
    });
    this.unsubPrefs = onPrefsChange(() => {
      if (!this.destroyed) this.updatePrefs();
    });
    this.render();
    void this.billing.refreshQuota();
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubBilling?.();
    this.unsubPrefs?.();
    this.root.remove();
    this.sheet = null;
    this.voiceNote = null;
    this.sizePreview = null;
    this.built = false;
  }

  private async subscribe(): Promise<void> {
    try {
      const { url, recoveryCode } = await requestCheckout(this.userId);
      try {
        localStorage.setItem(PENDING_RECOVERY_KEY, recoveryCode);
      } catch {
        // Private mode: the success screen just skips the save-again copy.
      }
      window.location.href = url;
    } catch (e) {
      snackbar(e instanceof Error ? e.message : `${e}`);
    }
  }

  private async mintAndShowCode(): Promise<void> {
    try {
      const { recoveryCode } = await fetchRecoveryCode(this.userId);
      showDialog(
        'New recovery code',
        [
          recoveryCode,
          'Save it somewhere safe — email it to yourself. The old code, including any emailed copy, no longer works.',
        ],
        [
          {
            label: 'Copy',
            onClick: () => {
              void navigator.clipboard
                ?.writeText(recoveryCode)
                .catch(() => undefined);
            },
          },
          { label: 'Done' },
        ],
      );
    } catch (e) {
      snackbar(e instanceof Error ? e.message : `${e}`);
    }
  }

  private async showMintedCode(): Promise<void> {
    showDialog(
      'Generate a new code?',
      [
        'This invalidates your current code, including the copy at the bottom of your purchase confirmation email.',
        'Only do this if you lost your code.',
      ],
      [{ label: 'Cancel' }, { label: 'Generate new code', onClick: () => void this.mintAndShowCode() }],
    );
  }

  private openRestoreDialog(): void {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    const box = document.createElement('div');
    box.className = 'dialog';
    box.setAttribute('role', 'dialog');
    const heading = document.createElement('h2');
    heading.textContent = 'Restore access';
    const email = document.createElement('input');
    email.className = 'library-input';
    email.type = 'email';
    email.placeholder = 'Purchase email';
    email.autocomplete = 'email';
    const code = document.createElement('input');
    code.className = 'library-input';
    code.type = 'text';
    code.placeholder = 'Recovery code';
    code.autocomplete = 'one-time-code';
    const row = document.createElement('div');
    row.className = 'dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'dialog-btn';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => overlay.remove());
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'dialog-btn';
    restore.textContent = 'Restore';
    restore.addEventListener('click', () => {
      void (async () => {
        try {
          const { recoveryCode } = await recoverSubscription(
            email.value,
            code.value,
            this.userId,
          );
          overlay.remove();
          showDialog('Subscription restored', [
            'Unlimited is active on this device.',
            `New recovery code: ${recoveryCode} — save it; the old code no longer works.`,
          ], [{ label: 'Done' }]);
          await this.billing.refreshQuota();
        } catch (e) {
          snackbar(e instanceof Error ? e.message : `${e}`);
        }
      })();
    });
    row.append(cancel, restore);
    box.append(heading, email, code, row);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
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

  /**
   * Policy pages (plain server HTML) must escape the standalone PWA:
   * in `display: standalone` there is no address bar, so in-app
   * navigation strands the user. An anchor with target _blank asks
   * the OS to use the system browser (Android Chrome: always;
   * iOS standalone: opens Safari). window.open is popup-blocked
   * outside real tap handlers — hence a real link click, not a
   * script open.
   */
  private openPolicy(path: '/privacy-policy' | '/data-deletion'): void {
    const a = document.createElement('a');
    a.href = `${window.location.origin}${path}`;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** Full build once; afterwards patch live regions in place. */
  private render(): void {
    if (this.destroyed) return;
    this.root.innerHTML = '';

    const sheet = document.createElement('div');
    sheet.className = 'library';
    this.sheet = sheet;

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

    // Header is fixed flex chrome; only this region scrolls, so
    // content can never slide under the Library title.
    const scroll = document.createElement('div');
    scroll.className = 'library-scroll';
    scroll.appendChild(this.usageCard());
    scroll.appendChild(this.subscriptionCard());
    scroll.appendChild(this.readingCard());
    scroll.appendChild(this.deviceCard());
    scroll.appendChild(this.footnote());
    sheet.appendChild(scroll);

    this.root.appendChild(sheet);
    this.root.onclick = (e) => {
      if (e.target === this.root) this.onClose();
    };
    this.built = true;
  }

  /**
   * Billing updates (quota fetch landing, subscribe state): patch the
   * two billing card bodies in place. Refs are looked up from the
   * live DOM on every call, so nothing goes stale across renders;
   * segmented controls and scroll position are never touched.
   */
  private update(): void {
    if (this.destroyed || !this.built || !this.sheet) return;
    const usage = this.sheet.querySelector<HTMLElement>(
      '[data-testid="usageCard"]',
    );
    if (usage) this.fillUsage(usage);
    const sub = this.sheet.querySelector<HTMLElement>(
      '[data-testid="subCard"]',
    );
    if (sub) this.fillSubscription(sub);
  }
  /** Prefs updates: pressed states + notes, never a rebuild. */
  private updatePrefs(): void {
    if (this.destroyed || !this.built || !this.sheet) return;
    const voice = getVoice();
    const size = getTextSize();
    const buttons = this.sheet.querySelectorAll<HTMLButtonElement>(
      '.library-seg button',
    );
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const testid = btn.dataset.testid ?? '';
      const value =
        testid === 'voiceFaithful'
          ? 'faithful'
          : testid === 'voicePlain'
            ? 'plain'
            : testid === 'sizeSmall'
              ? 'small'
              : testid === 'sizeMedium'
                ? 'medium'
                : testid === 'sizeLarge'
                  ? 'large'
                  : null;
      if (value !== null) {
        btn.setAttribute(
          'aria-pressed',
          `${value === voice || value === size}`,
        );
      }
    }
    if (this.voiceNote) {
      this.voiceNote.textContent =
        voice === 'plain'
          ? 'Retells the same ideas in simple, everyday language — best for dense, old, or technical books.'
          : 'Keeps the author’s style, tone and words — reads like a shorter version of the page.';
    }
    if (this.sizePreview) {
      this.sizePreview.style.fontSize = `${TEXT_SIZES[size].px}px`;
    }
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
    const filled = this.fillUsage(body);
    if (filled !== body) {
      body.replaceWith(filled);
      return el;
    }
    return el;
  }

  private fillUsage(body: HTMLElement): HTMLElement {
    const quota = this.billing.quota;
    const state = this.billing.ready
      ? quota
        ? 'loaded'
        : 'error'
      : 'loading';
    body.dataset.state = state;
    body.innerHTML = '';

    if (!this.billing.ready) {
      body.textContent = 'Checking usage…';
      return body;
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
      return body;
    }

    const big = document.createElement('div');
    big.className = 'library-big';
    big.textContent = quota.pillLabel;
    body.appendChild(big);

    const bar = document.createElement('div');
    bar.className = 'library-bar';
    const fill = document.createElement('div');
    fill.className = 'library-bar-fill';
    const pct =
      quota.unlimited || quota.freeTotal <= 0
        ? 0
        : Math.min(100, (quota.freeUsed / quota.freeTotal) * 100);
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);
    body.appendChild(bar);

    const sub = document.createElement('p');
    sub.className = 'library-muted';
    if (quota.unlimited) {
      // Subscribers don't ration pages — no counters, just the state.
      sub.textContent = 'Unlimited* is active on this device.';
    } else {
      const reset = nextResetLabel(quota.month);
      sub.textContent =
        `${quota.freeUsed} of ${quota.freeTotal} free pages used` +
        (reset ? ` · ${reset}` : '');
      body.appendChild(sub);
      if (!quota.canSummarize) {
        const deny = document.createElement('p');
        deny.className = 'library-warn';
        deny.textContent = quota.denialMessage;
        body.appendChild(deny);
        return body;
      }
      return body;
    }
    body.appendChild(sub);
    return body;
  }

  private subscriptionCard(): HTMLElement {
    const { el, body } = this.card('Subscription');
    body.dataset.testid = 'subCard';
    this.fillSubscription(body);
    return el;
  }

  private fillSubscription(body: HTMLElement): HTMLElement {
    const quota = this.billing.quota;
    body.innerHTML = '';
    if (quota?.unlimited) {
      body.appendChild(this.manageBlock());
      return body;
    }
    body.appendChild(this.freeBlock());
    body.appendChild(this.subscribeBlock());
    return body;
  }

  /** Free tier, framed as the product — not a trial of the paid one. */
  private freeBlock(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.dataset.testid = 'freeTier';
    wrap.className = 'library-tier';
    const title = document.createElement('div');
    title.className = 'library-tier-title';
    title.textContent = 'Free — 100 pages every month';
    const p = document.createElement('p');
    p.className = 'library-muted';
    p.textContent =
      'No account, no card. Photograph a page, get a summary. ' +
      'Resets on the 1st; unused pages don’t roll over.';
    wrap.append(title, p);
    return wrap;
  }

  private subscribeBlock(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'library-tier';
    const title = document.createElement('div');
    title.className = 'library-tier-title';
    const star = document.createElement('span');
    star.textContent = 'Unlimited';
    const sup = document.createElement('a');
    sup.className = 'library-star';
    sup.href = '#unlimited-note';
    sup.textContent = '*';
    sup.setAttribute('aria-label', 'See Unlimited footnote');
    sup.addEventListener('click', (e) => {
      e.preventDefault();
      this.sheet
        ?.querySelector('#unlimited-note')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    title.append(star, sup);
    const p = document.createElement('p');
    p.textContent = 'Read without counting. One monthly plan.';
    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'library-btn primary';
    cta.dataset.testid = 'librarySubscribe';
    cta.textContent = 'Subscribe for unlimited';
    cta.addEventListener('click', () => void this.subscribe());
    const note = document.createElement('p');
    note.className = 'library-muted';
    note.textContent = 'Cancel anytime in the portal.';
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'library-btn secondary';
    restore.dataset.testid = 'libraryRestore';
    restore.textContent = 'Already subscribed? Restore access';
    restore.addEventListener('click', () => this.openRestoreDialog());
    wrap.append(title, p, cta, note, restore);
    return wrap;
  }

  private manageBlock(): HTMLElement {
    const wrap = document.createElement('div');
    const p = document.createElement('p');
    p.textContent =
      'Unlimited* is active on this device. Read without counting.';
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
    wrap.append(p, manage, note);
    wrap.appendChild(this.recoverySection());
    return wrap;
  }

  private recoverySection(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.dataset.testid = 'recoverySection';
    const title = document.createElement('div');
    title.className = 'library-tier-title';
    title.textContent = 'Recovery code';
    const p = document.createElement('p');
    p.className = 'library-muted';
    p.textContent =
      'Your subscription is tied to this device. Save the code somewhere safe — email it to yourself ' +
      'so you can restore Unlimited if you lose this device. Only the latest code works.';
    const codeBtn = document.createElement('button');
    codeBtn.type = 'button';
    codeBtn.className = 'library-btn secondary';
    codeBtn.dataset.testid = 'libraryRecoveryCode';
    codeBtn.textContent = 'Generate new recovery code';
    codeBtn.addEventListener('click', () => void this.showMintedCode());
    wrap.append(title, p, codeBtn);
    return wrap;
  }

  private footnote(): HTMLElement {
    const foot = document.createElement('p');
    foot.className = 'library-footnote';
    foot.id = 'unlimited-note';
    foot.textContent =
      '*Unlimited means 5,000 pages a month guaranteed; beyond that, ' +
      'availability depends on system load. Designed for human reading — ' +
      'if you can outread it, congratulations.';
    return foot;
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
    const note = document.createElement('p');
    note.className = 'library-muted';
    note.textContent =
      getVoice() === 'plain'
        ? 'Retells the same ideas in simple, everyday language — best for dense, old, or technical books.'
        : 'Keeps the author’s style, tone and words — reads like a shorter version of the page.';
    this.voiceNote = note;
    const applies = document.createElement('p');
    applies.className = 'library-muted';
    applies.textContent = 'Applies to new pages, and to re-summaries from ↻.';

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
    const preview = document.createElement('p');
    preview.className = 'library-preview';
    preview.style.fontSize = `${TEXT_SIZES[getTextSize()].px}px`;
    preview.textContent = 'The organization man wants to belong together.';
    this.sizePreview = preview;

    body.append(voiceLabel, voice, note, applies);
    body.append(sizeLabel, size, preview);
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
    const priv = document.createElement('button');
    priv.type = 'button';
    priv.className = 'library-link';
    priv.textContent = 'Privacy';
    priv.addEventListener('click', () => this.openPolicy('/privacy-policy'));
    const sep = document.createTextNode(' · ');
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'library-link';
    del.textContent = 'Data deletion';
    del.addEventListener('click', () => this.openPolicy('/data-deletion'));
    links.append(priv, sep, del);
    body.append(row, links);
    return el;
  }
}
