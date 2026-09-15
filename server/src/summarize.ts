/**
 * Shared summarize logic (pure, unit-tested). The Worker entrypoint
 * (index.ts) must only export a default handler — extra value exports
 * break the runtime — so everything else lives here.
 */

export interface Env {
  OPENROUTER_KEY: string;
  PROXY_TOKEN: string;
  MODEL?: string;
  OPENROUTER_BASE?: string;
}

export const DEFAULT_MODEL = 'google/gemini-3.5-flash-lite';
export const DEFAULT_OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const LEVELS = {
  low: {
    target: 'about half the length of the original text',
    maxTokens: 3000,
  },
  high: {
    target: 'a few sentences capturing only the key points',
    maxTokens: 1000,
  },
  max: {
    target:
      'a single sentence capturing the single most important point of the page',
    maxTokens: 1000,
  },
} as const;

export type Level = keyof typeof LEVELS;

export function isLevel(value: unknown): value is Level {
  return (
    typeof value === 'string' &&
    (value === 'low' || value === 'high' || value === 'max')
  );
}

export function userPrompt(level: Level): string {
  return (
    `Summarize the text on this book page to ${LEVELS[level].target}. ` +
    'Write the summary in the same language as the text on the page. ' +
    "Preserve the author's original style, voice, tone and terminology — " +
    'write the summary as if the author wrote a shorter version themselves. ' +
    'Output ONLY the summary, no preamble, no commentary.'
  );
}

/** Chunked base64 — btoa on one giant string blows the call stack. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function summarize(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.PROXY_TOKEN) {
    return Response.json(
      { error: 'server misconfigured: missing PROXY_TOKEN' },
      { status: 500 },
    );
  }
  if (
    request.headers.get('Authorization') !== `Bearer ${env.PROXY_TOKEN}`
  ) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!env.OPENROUTER_KEY) {
    return Response.json(
      { error: 'server misconfigured: missing OPENROUTER_KEY' },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: 'expected multipart form' },
      { status: 400 },
    );
  }
  const levelRaw = form.get('level');
  if (!isLevel(levelRaw)) {
    return Response.json(
      { error: 'level must be one of low|high|max' },
      { status: 400 },
    );
  }
  const image = form.get('image');
  if (!(image instanceof File)) {
    return Response.json(
      { error: 'missing image file field' },
      { status: 400 },
    );
  }
  if (image.size === 0) {
    return Response.json({ error: 'empty image' }, { status: 400 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: 'image too large' }, { status: 413 });
  }

  const bytes = new Uint8Array(await image.arrayBuffer());
  const cfg = LEVELS[levelRaw];
  const model = env.MODEL || DEFAULT_MODEL;
  const base = env.OPENROUTER_BASE || DEFAULT_OPENROUTER_BASE;

  const upstream = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://diagonal.app',
      'X-Title': 'Diagonal Reader via Cloudflare',
    },
    body: JSON.stringify({
      model,
      stream: true,
      max_tokens: cfg.maxTokens,
      temperature: 0.3,
      reasoning: { effort: 'low' },
      messages: [
        {
          role: 'system',
          content:
            "You are a speed-reading assistant. You compress book pages to the requested length without losing the author's voice.",
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt(levelRaw) },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${toBase64(bytes)}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '');
    const excerpt =
      text.length > 300 ? `${text.slice(0, 300)}…` : text;
    return Response.json(
      { error: `openrouter ${upstream.status}: ${excerpt}` },
      { status: 502 },
    );
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
    },
  });
}
