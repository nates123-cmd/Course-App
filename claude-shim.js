// Drop-in for the prototype's window.claude.complete().
// Returns the model's text as a string so the existing JSON-extract regex
// in each call site (`raw.match(/\{[\s\S]*\}/)`) continues to work.
//
// The Anthropic key is NO LONGER held client-side. This calls the JWT-gated
// `claude` edge function in the shared Supabase project, which holds the key
// server-side and authorizes by the user's login. Nothing to paste, nothing
// to leak. See supabase/functions/claude/index.ts.
//
// Depends on supabase-client.js (window.SB_URL / window.sbBearer) loaded first.

(function () {
  const ENDPOINT = `${window.SB_URL}/functions/v1/claude`;
  const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
  const DEFAULT_MAX_TOKENS = 1024;

  async function complete(opts) {
    const messages = (opts && opts.messages) || [];
    const model = (opts && opts.model) || DEFAULT_MODEL;
    const max_tokens = (opts && opts.max_tokens) || DEFAULT_MAX_TOKENS;

    const bearer = window.sbBearer ? await window.sbBearer() : window.SB_KEY;
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: window.SB_KEY,
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({ model, max_tokens, messages }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Claude proxy ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = await res.json();
    // Proxy returns { text, content }; prefer text, fall back to joining blocks.
    if (typeof json.text === 'string') return json.text;
    return (json.content || [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }

  window.claude = window.claude || {};
  window.claude.complete = complete;
})();
