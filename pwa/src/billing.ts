/** Quota gate + Stripe entry points (PWA equivalent of BillingApi). */

import { fetchQuota, openPortal, startCheckout } from './api';
import { QuotaStatus } from './quota';

export class Billing {
  quota: QuotaStatus | null = null;
  ready = false;
  lastError: string | null = null;
  quotaError: string | null = null;
  private refreshing = false;
  private listeners = new Set<() => void>();

  constructor(readonly userId: string) {}

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  async refreshQuota(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      this.quota = await fetchQuota(this.userId);
      this.quotaError = null;
    } catch (e) {
      this.quotaError = `quota failed: ${e instanceof Error ? e.message : `${e}`}`;
    } finally {
      this.refreshing = false;
      if (!this.ready) this.ready = true;
      this.emit();
    }
  }

  /**
   * True when the user may summarize now. Free exhaustion and
   * subscriber guardrails deny with denialMessage (never a raw
   * status); checkout is entered via the pill, never auto-redirected
   * here so background retries can't yank the page away.
   */
  async ensureAllowance(): Promise<boolean> {
    await this.refreshQuota();
    const quota = this.quota;
    if (quota !== null && quota.canSummarize) {
      this.lastError = null;
      this.emit();
      return true;
    }
    if (quota !== null) {
      this.lastError = quota.denialMessage;
    } else {
      this.lastError = this.quotaError ?? 'quota unavailable';
    }
    this.emit();
    return false;
  }

  /** Pill tap: subscribers manage, everyone else subscribes. */
  async pillAction(): Promise<void> {
    if (this.quota?.unlimited) {
      await openPortal(this.userId);
    } else {
      await startCheckout(this.userId);
    }
  }
}
