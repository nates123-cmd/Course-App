// Drop-in for the prototype's window.claude.complete().
// Returns the model's text as a string so the existing JSON-extract regex
// in each call site (`raw.match(/\{[\s\S]*\}/)`) continues to work.
//
// Key source: localStorage.getItem('anthropic_api_key') — see dev-config.js.example.
// Loaded via raw <script> (not Babel) so the API is in place before .jsx modules run.

(function () {
  const ENDPOINT = 'https://api.anthropic.com/v1/messages';
  const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
  const DEFAULT_MAX_TOKENS = 1024;

  async function complete(opts) {
    const key = (typeof localStorage !== 'undefined' && localStorage.getItem('anthropic_api_key')) || '';
    if (!key) {
      throw new Error('No Anthropic API key. Set localStorage.anthropic_api_key (see dev-config.js.example).');
    }

    const messages = (opts && opts.messages) || [];
    const model = (opts && opts.model) || DEFAULT_MODEL;
    const max_tokens = (opts && opts.max_tokens) || DEFAULT_MAX_TOKENS;

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model, max_tokens, messages }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Anthropic ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = await res.json();
    const text = (json.content || [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return text;
  }

  window.claude = window.claude || {};
  window.claude.complete = complete;
})();
