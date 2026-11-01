# Framemax

Movies and anime catalog with an IPTV player and an on-demand provider search section. Catalog and watchlist cards include **Find streams**, which searches the selected provider without requiring sign-in.

## On-demand providers

The provider selector includes Prexzy / TMDB, MovieBox Pro 2, Omega Movie, Moviebox Off, and LK21 +18. Search results can be selected to request streams, or a provider title ID can be entered directly. Series include season and episode inputs. Returned HTTPS HLS and video links use the video player; explicit embed links use a sandboxed provider frame. A selected stream can also be opened in another tab.

**Live compatibility is not verified.** During implementation all supplied provider URLs, the Omega documentation, and direct route probes returned HTTP 403. No provider documentation or sample JSON was available. The adapters use provisional `search`, `details`, and `watch` actions with `query`, `id`, `type`, `limit`, `season`, and `episode` parameters. These conventions must be checked against accessible provider documentation before successful search or playback can be guaranteed. Omega's `api.html?route=…` URLs are documentation pages; requests target their `/api/movie/…` route paths. Provider mappings and response normalization are isolated in `netlify/functions/lib/providers.mts` for correction when contracts become available.

The function returns only normalized titles and recognized playback links, handles denials/timeouts/non-JSON responses, and never accepts an arbitrary upstream host. Metadata-only responses do not create fake video links. Browser playback still depends on media availability, codec support, CORS permissions, and embed restrictions. Media requiring provider-specific headers or authentication is not proxied or bypassed.

## Development and verification

Install dependencies with `npm install`. Use `netlify dev --port 8889` for the static site and function. Run `npm test` for request validation, response normalization, source association, and upstream error handling. Tests use mocked provider responses and do not establish live provider compatibility.

The existing local profile/watchlist and IPTV functionality remain as before; the new provider flow does not store additional user data.
