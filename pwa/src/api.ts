/** Same-origin API: quota, streaming summarize, Stripe redirects. */

import { QuotaStatus } from './quota';
import type { QuotaJson } from './quota';

export type Level = 'low' | 'high' | 'max';
export type Voice = 'faithful' | 'plain';
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly excerpt: string,
  ) {
    super(`request failed (${status}): ${excerpt}`);
    this.name = 'ApiError';
  }
}

function excerpt(text: string): string {
  const cut = text.slice(0, 300);
  return text.length > 300 ? `${cut}…` : text;
}

async function throwForStatus(res: Response): Promise<never> {
  const text = await res.text().catch(() => '');
  throw new ApiError(res.status, excerpt(text));
}

export async function fetchQuota(userId: string): Promise<QuotaStatus> {
  const res = await fetch(`/quota?user=${encodeURIComponent(userId)}`);
  if (!res.ok) await throwForStatus(res);
  const json = (await res.json()) as QuotaJson;
  return QuotaStatus.fromJson(json);
}

interface SseChoice {
  choices?: Array<{ delta?: { content?: unknown } }>;
}

/**
 * POST /summarize multipart (image=page.jpg, field level), yields
 * OpenRouter-compatible SSE text deltas. Throws ApiError on HTTP
 * errors, Error('Empty response from model') on zero deltas.
 */
export async function* summarizeStream(
  jpeg: Blob,
  level: Level,
  voice: Voice,
  userId: string,
): AsyncGenerator<string> {
  const form = new FormData();
  form.set('level', level);
  form.set('voice', voice);
  form.set('image', jpeg, 'page.jpg');
  const res = await fetch('/summarize', {
    method: 'POST',
    headers: { 'X-User-Id': userId },
    body: form,
  });
  if (!res.ok) await throwForStatus(res);
  if (!res.body) throw new Error('Empty response from model');

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  let yielded = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += value;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        let parsed: SseChoice | null = null;
        try {
          parsed = JSON.parse(data) as SseChoice;
        } catch {
          continue;
        }
        const content = parsed?.choices?.[0]?.delta?.content;
        if (typeof content === 'string' && content !== '') {
          yielded++;
          yield content;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (yielded === 0) throw new Error('Empty response from model');
}

async function redirectTo(url: string): Promise<never> {
  window.location.href = url;
  throw new Error(`redirecting to ${url}`);
}

export interface CheckoutResult {
  url: string;
  recoveryCode: string;
}

export async function requestCheckout(userId: string): Promise<CheckoutResult> {
  const res = await fetch('/stripe/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) await throwForStatus(res);
  const body = (await res.json()) as { url?: unknown; recoveryCode?: unknown };
  if (typeof body.url !== 'string' || body.url === '') {
    throw new Error('checkout failed: missing url');
  }
  if (typeof body.recoveryCode !== 'string' || body.recoveryCode === '') {
    throw new Error('checkout failed: missing recovery code');
  }
  return { url: body.url, recoveryCode: body.recoveryCode };
}

export async function fetchRecoveryCode(userId: string): Promise<{ recoveryCode: string }> {
  const res = await fetch('/stripe/recovery-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) await throwForStatus(res);
  const body = (await res.json()) as { recoveryCode?: unknown };
  if (typeof body.recoveryCode !== 'string' || body.recoveryCode === '') {
    throw new Error('recovery code failed: missing code');
  }
  return { recoveryCode: body.recoveryCode };
}

export async function recoverSubscription(
  email: string,
  code: string,
  newUserId: string,
): Promise<{ recoveryCode: string }> {
  const res = await fetch('/stripe/recover', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, code, newUserId }),
  });
  if (!res.ok) await throwForStatus(res);
  const body = (await res.json()) as { recoveryCode?: unknown };
  if (typeof body.recoveryCode !== 'string' || body.recoveryCode === '') {
    throw new Error('restore failed: missing recovery code');
  }
  return { recoveryCode: body.recoveryCode };
}

export async function openPortal(userId: string): Promise<never> {
  const res = await fetch('/stripe/portal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) await throwForStatus(res);
  const body = (await res.json()) as { url?: unknown };
  if (typeof body.url !== 'string' || body.url === '') {
    throw new Error('portal failed: missing url');
  }
  return redirectTo(body.url);
}
