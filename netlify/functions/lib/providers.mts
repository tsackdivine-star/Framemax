export type Source = { label: string; url: string; kind: 'hls' | 'video' | 'embed' };
export type Title = { id: string; title: string; type: string; year: string; sources: Source[] };

export function providers() {
  return {
    prexzy: { name: 'Prexzy / TMDB', endpoint: 'https://prexzyapis.com/anime/tmdb' },
    pro2: { name: 'MovieBox Pro 2', endpoint: 'https://api.omegatech.app/api/movie/MovieBox-pro2' },
    movie: { name: 'Omega Movie', endpoint: 'https://api.omegatech.app/api/movie/movie' },
    offline: { name: 'Moviebox Off', endpoint: 'https://api.omegatech.app/api/movie/Moviebox_off' },
    lk21: { name: 'LK21 +18', endpoint: 'https://api.omegatech.app/api/movie/lk21-%2B18' },
  };
}

export function publicUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    // Never offer browser playback against local network hosts or IP literals.
    if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || /\.(localhost|local|internal|test|invalid)$/.test(host)) return null;
    return url.href;
  } catch { return null; }
}

export function normalize(payload: unknown) {
  const sources: Source[] = [], titles: Title[] = [];
  const seen = new Set<string>(), ids = new Set<string>();
  function text(value: unknown, max = 200): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, max) : '';
  }
  function walk(value: unknown, key = '', depth = 0, target: Source[] = sources) {
    if (depth > 10 || titles.length >= 40 || sources.length >= 80) return;
    if (/trailer|poster|image|subtitle|thumbnail|avatar/i.test(key)) return;
    if (typeof value === 'string') {
      const url = publicUrl(value);
      if (!url) return;
      const path = new URL(url).pathname;
      const kind = /\.m3u8$/i.test(path) ? 'hls' : /\.(mp4|webm|m4v|mov)$/i.test(path) ? 'video' : /^(embed|embed_url|embedUrl|iframe)$/i.test(key) ? 'embed' : /^(stream_url|streamUrl|video_url|videoUrl|play_url|playUrl)$/i.test(key) ? 'video' : null;
      if (!kind) return;
      const source: Source = { url, kind, label: kind === 'embed' ? 'Provider player' : kind === 'hls' ? 'HLS stream' : 'Video stream' };
      if (!seen.has(url)) { seen.add(url); sources.push(source); }
      if (target !== sources && !target.some(s => s.url === url)) target.push(source);
      return;
    }
    if (Array.isArray(value)) { value.slice(0, 80).forEach(item => walk(item, key, depth + 1, target)); return; }
    if (!value || typeof value !== 'object') return;
    const row = value as Record<string, unknown>;
    const name = text(row.title || row.name || row.original_title || row.original_name);
    const id = text(row.id || row.tmdb_id || row.subjectId || row.slug, 500);
    let own = target;
    if (name && id && !ids.has(id)) {
      ids.add(id); own = [];
      titles.push({ id, title: name, year: text(row.release_date || row.first_air_date || row.year, 10), type: text(row.media_type || row.type, 20), sources: own });
    }
    // Explicit keys only: never echo provider credentials or arbitrary response fields.
    const keys = ['url', 'src', 'file', 'stream_url', 'streamUrl', 'video_url', 'videoUrl', 'play_url', 'playUrl', 'embed', 'embed_url', 'embedUrl', 'iframe', 'sources', 'streams', 'videos', 'links', 'downloads', 'data', 'result', 'results', 'movies', 'items', 'list', 'episodes', 'servers', 'qualities', 'video', 'stream', 'movie', 'subject'];
    for (const field of keys) if (field in row) walk(row[field], field, depth + 1, own);
  }
  walk(payload);
  return { titles: titles.slice(0, 24), sources: sources.slice(0, 40) };
}

export function providerRequest(params: URLSearchParams) {
  const all = providers(), key = params.get('provider') || '';
  if (!Object.hasOwn(all, key)) throw new Error('Choose a valid provider.');
  const provider = all[key as keyof typeof all];
  const action = params.get('action') || 'search';
  if (!['search', 'details', 'watch'].includes(action)) throw new Error('Choose search, details, or watch.');
  const query = (params.get('query') || '').trim(), id = (params.get('id') || '').trim();
  if (query.length > 200 || id.length > 500 || (action === 'search' ? !query : !id)) throw new Error(action === 'search' ? 'Enter a title to search (up to 200 characters).' : 'Enter a provider title ID (up to 500 characters).');
  const url = new URL(provider.endpoint);
  url.searchParams.set('action', action);
  if (query) url.searchParams.set('query', query);
  if (id) url.searchParams.set('id', id);
  const type = params.get('type') === 'tv' ? 'tv' : 'movie';
  url.searchParams.set('type', type);
  url.searchParams.set('limit', '24');
  if (type === 'tv') for (const field of ['season', 'episode']) {
    const number = params.get(field) || '1';
    if (!/^[1-9]\d{0,3}$/.test(number)) throw new Error('Season and episode must be positive numbers.');
    url.searchParams.set(field, number);
  }
  return { url, name: provider.name };
}
