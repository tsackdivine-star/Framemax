import { normalize, providerRequest } from './lib/providers.mts';

export default async function handler(request: Request) {
  if (request.method !== 'GET') return Response.json({ error: 'Use GET to search or load a title.' }, { status: 405, headers: { Allow: 'GET' } });
  let upstream: ReturnType<typeof providerRequest>;
  try { upstream = providerRequest(new URL(request.url).searchParams); }
  catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    const response = await fetch(upstream.url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(18000), redirect: 'error' });
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? 'The provider denied access. Choose another provider or try again later.'
        : response.status === 429 ? 'The provider is busy. Wait a moment and retry.'
        : 'The provider is unavailable. Try another provider.';
      return Response.json({ error: message }, { status: 502, headers });
    }
    if (!response.body) throw new Error('Empty response');
    const reader = response.body.getReader();
    let length = 0, body = '';
    const decoder = new TextDecoder();
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 2_000_000) { await reader.cancel(); throw new Error('Response too large'); }
      body += decoder.decode(part.value, { stream: true });
    }
    body += decoder.decode();
    const normalized = normalize(JSON.parse(body));
    return Response.json({ provider: upstream.name, ...normalized, message: normalized.titles.length || normalized.sources.length ? '' : 'No playable links or titles were returned. This provider may require different parameters or may only supply metadata.' }, { headers });
  } catch {
    return Response.json({ error: 'The provider could not return a usable response. Try again or choose another provider.' }, { status: 502, headers });
  }
}
