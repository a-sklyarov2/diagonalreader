/**
 * Page allowance for one user, as reported by the Worker.
 * Field-for-field port of the old QuotaStatus — the server is source
 * of truth, these strings are the UX contract. Copy, don't reinterpret.
 *
 * Free: 100 pages per calendar month (reset, no rollover).
 * Subscribed: unlimited* — 5000 guaranteed/month with 500/day and
 * 10000/month guardrails.
 */

export type Denial = 'free' | 'daily' | 'monthly';

export interface QuotaJson {
  freeUsed: unknown;
  freeTotal: unknown;
  paidBalance: unknown;
  pro: unknown;
  unlimited: unknown;
  paidUsed: unknown;
  paidCap: unknown;
  dailyUsed: unknown;
  dailyCap: unknown;
  month: unknown;
}

function asInt(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  const n = parseInt(`${v ?? ''}`, 10);
  return Number.isFinite(n) ? n : 0;
}

export class QuotaStatus {
  constructor(
    readonly freeUsed: number,
    readonly freeTotal: number,
    readonly paidBalance: number,
    readonly pro: boolean,
    readonly unlimited: boolean,
    readonly paidUsed: number,
    readonly paidCap: number,
    readonly dailyUsed: number,
    readonly dailyCap: number,
    readonly month: string,
  ) {}

  static fromJson(json: QuotaJson): QuotaStatus {
    return new QuotaStatus(
      asInt(json.freeUsed),
      asInt(json.freeTotal),
      asInt(json.paidBalance),
      json.pro === true,
      json.unlimited === true,
      asInt(json.paidUsed),
      asInt(json.paidCap),
      asInt(json.dailyUsed),
      asInt(json.dailyCap),
      `${json.month ?? ''}`,
    );
  }

  get freeLeft(): number {
    const left = this.freeTotal - this.freeUsed;
    return left < 0 ? 0 : left;
  }

  get canSummarize(): boolean {
    if (this.unlimited) {
      return this.dailyUsed < this.dailyCap && this.paidUsed < this.paidCap;
    }
    return this.freeLeft > 0;
  }

  /** Why summarizing is blocked right now (null when allowed). */
  get denial(): Denial | null {
    if (this.canSummarize) return null;
    if (!this.unlimited) return 'free';
    if (this.dailyUsed >= this.dailyCap) return 'daily';
    return 'monthly';
  }

  get denialMessage(): string {
    if (this.denial === null) return '';
    switch (this.denial) {
      case 'daily':
        return 'Daily limit reached — new pages tomorrow.';
      case 'monthly':
        return 'Monthly cap reached — new pages next month.';
      default:
        return 'Out of pages — subscribe for unlimited.';
    }
  }

  /** Pill label: used/total — "5/100" free, "5/∞" unlimited. */
  get pillLabel(): string {
    return this.unlimited ? `${this.paidUsed}/∞` : `${this.freeUsed}/${this.freeTotal}`;
  }
}
