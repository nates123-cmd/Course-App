/**
 * Suite Claude proxy — JWT-gated server-side relay to api.anthropic.com.
 *
 * Why: the Anthropic billing key must NOT live in any browser. Every suite app
 * now authenticates (per-user OTP), so this function gates on the Supabase JWT
 * (verify_jwt = true) instead of a pasted client key. Only a logged-in suite
 * user can reach it; the key lives in one place — this function's env.
 *
 * Contract (matches the apps' window.claude.complete shim):
 *   POST { messages: [...], model?, max_tokens?, system? }  ->  { text, content }
 *
 * Secret:
 *   ANTHROPIC_API_KEY  required (project-level; shared with quick-service)
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Allowlist so a leaked endpoint can't be steered onto an arbitrary model.
const MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-haiku-4-5',
  'claude-sonnet-4-6',
  'claude-opus-4-8',
]);
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS_CAP = 4096;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Max-Age': '86400',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'proxy misconfigured: no ANTHROPIC_API_KEY' }, 500);

  let body: {
    messages?: unknown;
    system?: string;
    model?: string;
    max_tokens?: number;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages array is required' }, 400);
  }

  const model = body.model && MODELS.has(body.model) ? body.model : DEFAULT_MODEL;
  const max_tokens = Math.min(
    Math.max(1, Math.floor(body.max_tokens ?? 1024)),
    MAX_TOKENS_CAP,
  );

  const payload: Record<string, unknown> = { model, max_tokens, messages };
  const system = (body.system ?? '').trim();
  if (system) payload.system = system;

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return json({ error: `upstream fetch failed: ${e instanceof Error ? e.message : e}` }, 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return json(
      { error: `anthropic ${res.status}`, detail: detail.slice(0, 500) },
      res.status === 429 ? 429 : 502,
    );
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const content = data.content ?? [];
  const text = content
    .filter((b) => b && b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n');

  return json({ text, content });
});
