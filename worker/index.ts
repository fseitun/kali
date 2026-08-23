/**
 * Kali key broker.
 *
 * The browser must never hold the real Deepgram / DeepInfra keys. This Worker holds them
 * as secrets and hands the browser only what it needs:
 *
 *   POST /api/deepgram-token  -> a short-lived Deepgram JWT (default 30s TTL).
 *                                The browser then opens the websocket to Deepgram DIRECTLY.
 *                                No websocket proxying here: the token only has to be valid
 *                                at handshake time, the stream stays open on its own after.
 *   POST /api/llm             -> plain pass-through to DeepInfra chat completions.
 *
 * Secrets (set with `wrangler secret put <NAME>`):
 *   DEEPGRAM_API_KEY, DEEPINFRA_API_KEY
 * Vars (wrangler.toml):
 *   ALLOWED_ORIGIN — the app origin allowed to call this Worker.
 */

interface Env {
  DEEPGRAM_API_KEY: string;
  DEEPINFRA_API_KEY: string;
  ALLOWED_ORIGIN: string;
}

const DEEPGRAM_GRANT_URL = "https://api.deepgram.com/v1/auth/grant";
const DEEPINFRA_URL = "https://api.deepinfra.com/v1/openai/chat/completions";

/** Seconds the browser token stays valid. Only needs to cover the websocket handshake. */
const TOKEN_TTL_SECONDS = 60;

function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

/** Same-origin check. Without it, anyone can burn your credits through this Worker. */
function originAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  return origin !== null && origin === env.ALLOWED_ORIGIN;
}

async function mintDeepgramToken(env: Env): Promise<Response> {
  const upstream = await fetch(DEEPGRAM_GRANT_URL, {
    method: "POST",
    headers: {
      Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ttl_seconds: TOKEN_TTL_SECONDS }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!upstream.ok) {
    return json({ error: "token grant failed", status: upstream.status }, 502, env);
  }
  // { access_token, expires_in } — pass straight through.
  return json(await upstream.json(), 200, env);
}

async function proxyLlm(request: Request, env: Env): Promise<Response> {
  const upstream = await fetch(DEEPINFRA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.DEEPINFRA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: await request.text(),
    signal: AbortSignal.timeout(30_000),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    if (request.method !== "POST") {
      return json({ error: "method not allowed" }, 405, env);
    }
    if (!originAllowed(request, env)) {
      return json({ error: "forbidden origin" }, 403, env);
    }

    const { pathname } = new URL(request.url);
    if (pathname === "/api/deepgram-token") {
      return mintDeepgramToken(env);
    }
    if (pathname === "/api/llm") {
      return proxyLlm(request, env);
    }
    return json({ error: "not found" }, 404, env);
  },
};
