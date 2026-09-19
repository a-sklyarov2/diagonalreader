import { beforeEach, describe, expect, it, vi } from 'vitest';

import worker from '../src/index';
import {
  LEVELS,
  isLevel,
  toBase64,
  userPrompt,
  type Env,
} from '../src/summarize';

const env: Env = {
  OPENROUTER_KEY: 'or-test-key',
  PROXY_TOKEN: 'proxy-test-token',
};

const sseBody =
  'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
  'data: {"choices":[{"delta":{"content":" world"}}]}\n\n' +
  'data: [DONE]\n\n';

function formRequest(fields: {
  level?: string;
  image?: Uint8Array;
}): Request {
  const form = new FormData();
  if (fields.level !== undefined) form.set('level', fields.level);
  if (fields.image !== undefined) {
    form.set(
      'image',
      new File([fields.image as Uint8Array<ArrayBuffer>], 'page.jpg', {
        type: 'image/jpeg',
      }),
    );
  }
  return new Request('https://api.test/summarize', {
    method: 'POST',
    headers: { Authorization: 'Bearer proxy-test-token' },
    body: form,
  });
}

describe('levels + prompt', () => {
  it('accepts only low|high|max', () => {
    expect(isLevel('low')).toBe(true);
    expect(isLevel('high')).toBe(true);
    expect(isLevel('max')).toBe(true);
    expect(isLevel('mid')).toBe(false);
    expect(isLevel('')).toBe(false);
    expect(isLevel(undefined)).toBe(false);
  });

  it('pins language + style in the prompt', () => {
    const prompt = userPrompt('high');
    expect(prompt).toContain(LEVELS.high.target);
    expect(prompt).toContain('same language as the text on the page');
    expect(prompt).toContain("author's original style");
    expect(prompt).toContain('ONLY the summary');
  });

  it('base64 round-trips', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(Buffer.from(toBase64(bytes), 'base64')).toEqual(
      Buffer.from(bytes),
    );
  });
});

describe('fetch router', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('GET /health reports the model', async () => {    const res = await worker.fetch(
      new Request('https://api.test/health'),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      model: 'google/gemini-3.5-flash-lite',
    });
  });

  it('serves the privacy policy + landing as HTML', async () => {
    const policy = await worker.fetch(
      new Request('https://diagonalreader.com/privacy-policy'),
      env,
    );
    expect(policy.status).toBe(200);
    expect(policy.headers.get('content-type')).toContain('text/html');
    const policyText = await policy.text();
    expect(policyText).toContain('Privacy Policy — Diagonal Reader');
    expect(policyText).toContain('not stored on our servers');
    expect(policyText).toContain('sklyarovaleksandar@gmail.com');

    const landing = await worker.fetch(
      new Request('https://diagonalreader.com/'),
      env,
    );
    expect(landing.status).toBe(200);
    expect(await landing.text()).toContain('/privacy-policy');
  });

  it('rejects missing/bad auth', async () => {
    const noAuth = await worker.fetch(
      new Request('https://api.test/summarize', { method: 'POST' }),
      env,
    );
    expect(noAuth.status).toBe(401);
  });

  it('validates level + image', async () => {
    const badLevel = await worker.fetch(
      formRequest({ level: 'mid', image: new Uint8Array([1]) }),
      env,
    );
    expect(badLevel.status).toBe(400);

    const noImage = await worker.fetch(
      formRequest({ level: 'high' }),
      env,
    );
    expect(noImage.status).toBe(400);

    const tooBig = await worker.fetch(
      formRequest({
        level: 'high',
        image: new Uint8Array(6 * 1024 * 1024),
      }),
      env,
    );
    expect(tooBig.status).toBe(413);
  });

  it('forwards prompt+image to OpenRouter and streams SSE back', async () => {
    let seenUrl = '';
    let seenBody: Record<string, unknown> = {};
    let seenAuth = '';
    vi.stubGlobal(
      'fetch',
      async (url: string, init: RequestInit) => {
        seenUrl = url;
        seenAuth =
          (init.headers as Record<string, string>)['Authorization'];
        seenBody = JSON.parse(init.body as string) as Record<
          string,
          unknown
        >;
        return new Response(sseBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      },
    );

    const res = await worker.fetch(
      formRequest({ level: 'max', image: new Uint8Array([1, 2, 3]) }),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain(
      'text/event-stream',
    );
    expect(seenUrl).toBe(
      'https://openrouter.ai/api/v1/chat/completions',
    );
    expect(seenAuth).toBe('Bearer or-test-key');
    expect(seenBody['model']).toBe('google/gemini-3.5-flash-lite');
    expect(seenBody['stream']).toBe(true);
    expect(seenBody['max_tokens']).toBe(LEVELS.max.maxTokens);
    const messages = seenBody['messages'] as Array<{
      content: unknown;
    }>;
    expect(JSON.stringify(messages)).toContain('single sentence');
    expect(await res.text()).toBe(sseBody);
  });

  it('maps upstream failures to 502', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response('{"error":"overloaded"}', { status: 503 }),
    );
    const res = await worker.fetch(
      formRequest({ level: 'low', image: new Uint8Array([1]) }),
      env,
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: 'openrouter 503: {"error":"overloaded"}',
    });
  });
});
