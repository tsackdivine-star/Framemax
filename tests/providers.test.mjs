import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/movie-providers.mts';
import { normalize, providerRequest, publicUrl } from '../netlify/functions/lib/providers.mts';

test('requests remain on the five supplied provider routes and encode searches', () => {
  for (const key of ['prexzy', 'pro2', 'movie', 'offline', 'lk21']) {
    const { url } = providerRequest(new URLSearchParams({ provider: key, query: 'Dune & action=watch' }));
    assert.ok(['prexzyapis.com', 'api.omegatech.app'].includes(url.hostname));
    assert.equal(url.searchParams.get('action'), 'search');
    assert.equal(url.searchParams.get('query'), 'Dune & action=watch');
    assert.equal(url.pathname.includes('api.html'), false);
  }
  assert.throws(() => providerRequest(new URLSearchParams({ provider: 'https://localhost', query: 'x' })));
  assert.throws(() => providerRequest(new URLSearchParams({ provider: '__proto__', query: 'x' })));
  assert.throws(() => providerRequest(new URLSearchParams({ provider: 'prexzy', action: 'watch', id: '1', type: 'tv', season: '-1' })));
});

test('normalization preserves title association and excludes artwork, trailers and unsafe links', () => {
  const result = normalize({ data: [
    { id: 1, title: 'First', sources: [{ file: 'https://media.example.com/first.m3u8' }], trailer: { url: 'https://media.example.com/trailer.mp4' } },
    { id: 2, name: 'Second', poster: 'https://media.example.com/poster.mp4', sources: [{ url: 'https://media.example.com/second.mp4' }] },
  ], api_key: 'redacted', embed: 'javascript:alert(1)' });
  assert.equal(result.titles.length, 2);
  assert.equal(result.sources.length, 2);
  assert.equal(result.titles[0].sources[0].kind, 'hls');
  assert.equal(result.titles[1].sources[0].url, 'https://media.example.com/second.mp4');
  assert.equal(JSON.stringify(result).includes('redacted'), false);
  for (const url of ['http://example.com/a.mp4', 'https://localhost/a.mp4', 'https://127.0.0.1/a.mp4', 'https://192.168.1.2/a.mp4', 'https://[::1]/a.mp4', 'https://user:password@example.com/a.mp4']) assert.equal(publicUrl(url), null);
});

test('metadata does not become a playable movie and only explicit embed fields become frames', () => {
  assert.deepEqual(normalize({ results: [{ id: 1, title: 'Metadata only' }] }).sources, []);
  assert.deepEqual(normalize({ url: 'https://example.com/details/1' }).sources, []);
  assert.equal(normalize({ embed_url: 'https://player.example.com/embed/1' }).sources[0].kind, 'embed');
});

test('handler reports upstream denial without returning upstream content', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('private provider content', { status: 403 });
    const response = await handler(new Request('https://framemax.example/.netlify/functions/movie-providers?provider=prexzy&query=Dune'));
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.match(body.error, /denied access/);
    assert.equal(JSON.stringify(body).includes('private provider content'), false);
  } finally { globalThis.fetch = original; }
});

test('handler normalizes JSON and rejects HTML and arbitrary destinations', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ data: { stream_url: 'https://media.example.com/watch.mp4' } });
    const url = 'https://framemax.example/.netlify/functions/movie-providers?provider=pro2&action=watch&id=1';
    const response = await handler(new Request(url));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).sources[0].kind, 'video');
    globalThis.fetch = async () => new Response('<html>Blocked</html>');
    assert.equal((await handler(new Request(url))).status, 502);
    assert.equal((await handler(new Request(url.replace('provider=pro2', 'provider=unknown')))).status, 400);
    assert.equal((await handler(new Request(url, { method: 'POST' }))).status, 405);
  } finally { globalThis.fetch = original; }
});
