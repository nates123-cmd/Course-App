// Course — Notion proxy Edge Function
//
// Thin pass-through to the Notion API. Action-routed via the request body.
// Used by:
//   • Setup Flow (read-heavy: list dbs, fetch schemas, query pages)
//   • Setup Flow step 6 only (writes: mark pages Archived/Dropped)
//   • Selective Import (read a single page by ID)
//
// Auth: NOTION_TOKEN is set as an Edge Function secret; clients pass only the
// shared Supabase anon key (handled by the platform).

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  const token = Deno.env.get('NOTION_TOKEN');
  if (!token) {
    return json({
      error: 'NOTION_TOKEN secret not set. In Supabase Dashboard → Project Settings → Edge Functions → Secrets, add NOTION_TOKEN with your Notion internal integration token, then retry.',
    }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const action = body.action as string | undefined;
  if (!action) return json({ error: 'action required' }, 400);

  try {
    const result = await dispatch(action, body, token);
    return json(result, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Surface upstream status when available (set on the thrown error)
    const status = (err as { status?: number }).status ?? 502;
    return json({ error: msg }, status);
  }
});

async function dispatch(action: string, params: Record<string, unknown>, token: string) {
  switch (action) {
    case 'verify':
      // Proves the token works. Returns the bot user's basic info.
      return await notion('/users/me', { method: 'GET' }, token);

    case 'search_databases': {
      // Lists databases the integration has been shared with.
      // Supports cursor for large workspaces.
      const reqBody: Record<string, unknown> = {
        filter: { property: 'object', value: 'database' },
        page_size: 100,
      };
      if (params.start_cursor) reqBody.start_cursor = params.start_cursor;
      return await notion('/search', {
        method: 'POST',
        body: JSON.stringify(reqBody),
      }, token);
    }

    case 'fetch_db_schema': {
      const id = params.database_id as string | undefined;
      if (!id) throw httpErr('database_id required', 400);
      return await notion(`/databases/${id}`, { method: 'GET' }, token);
    }

    case 'query_db': {
      const id = params.database_id as string | undefined;
      if (!id) throw httpErr('database_id required', 400);
      const reqBody: Record<string, unknown> = {
        page_size: (params.page_size as number) || 100,
      };
      if (params.filter) reqBody.filter = params.filter;
      if (params.sorts) reqBody.sorts = params.sorts;
      if (params.start_cursor) reqBody.start_cursor = params.start_cursor;
      return await notion(`/databases/${id}/query`, {
        method: 'POST',
        body: JSON.stringify(reqBody),
      }, token);
    }

    case 'fetch_page': {
      const id = params.page_id as string | undefined;
      if (!id) throw httpErr('page_id required', 400);
      return await notion(`/pages/${id}`, { method: 'GET' }, token);
    }

    case 'update_page': {
      // Used only during Setup Flow step 6 — to mark items Archived/Dropped.
      // Caller supplies the full Notion patch body (e.g. { archived: true } or
      // { properties: { Status: { select: { name: 'Dropped' } } } }).
      const id = params.page_id as string | undefined;
      if (!id) throw httpErr('page_id required', 400);
      const patch = (params.body as Record<string, unknown>) || {};
      return await notion(`/pages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }, token);
    }

    default:
      throw httpErr(`Unknown action: ${action}`, 400);
  }
}

async function notion(path: string, init: RequestInit, token: string) {
  const res = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw httpErr(
      `Notion ${res.status}: ${data?.message || data?.code || 'unknown error'}`,
      res.status,
    );
  }
  return data;
}

function httpErr(message: string, status: number): Error & { status: number } {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  return e;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
