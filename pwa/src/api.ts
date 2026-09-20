/** Same-origin API: quota, streaming summarize, Stripe redirects. */

import { QuotaStatus } from './quota';
import type { QuotaJson } from './quota';

export type Level = 'low' | 'high' | 'max';

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
  userId: string,
): AsyncGenerator<string> {
  const form = new FormData();
  form.set('level', level);
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

export async function startCheckout(userId: string): Promise<never> {
  const res = await fetch('/stripe/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) await throwForStatus(res);
  const body = (await res.json()) as { url?: unknown };
  if (typeof body.url !== 'string' || body.url === '') {
    throw new Error('checkout failed: missing url');
  }
  return redirectTo(body.url);
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
