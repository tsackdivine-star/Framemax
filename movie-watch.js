(function () {
  'use strict';
  var el = function (id) { return document.getElementById('movie-' + id); };
  var video = el('video'), frame = el('embed'), hls = null, controller = null, generation = 0;
  var titles = [], selected = null, playback = 0;
  function message(text, error) { el('status').textContent = text; el('status').dataset.error = String(!!error); }
  function clearMedia() {
    playback++;
    if (hls) { hls.destroy(); hls = null; }
    video.pause(); video.removeAttribute('src'); video.load(); video.classList.add('hidden');
    frame.removeAttribute('src'); frame.classList.add('hidden');
    el('external').removeAttribute('href'); el('external').classList.add('hidden');
  }
  function clearResults() {
    clearMedia(); el('results').replaceChildren(); el('sources').replaceChildren();
    el('player').classList.add('hidden'); titles = []; selected = null;
  }
  function cancel() {
    generation++; if (controller) controller.abort();
    el('results').removeAttribute('aria-busy');
  }
  function play(source, button) {
    clearMedia();
    var current = playback;
    document.querySelectorAll('#movie-sources button').forEach(function (item) { item.setAttribute('aria-pressed', String(item === button)); });
    var iptv = document.getElementById('stream-stop');
    if (!iptv.classList.contains('hidden')) iptv.click();
    el('external').href = source.url; el('external').classList.remove('hidden');
    if (source.kind === 'embed') {
      frame.src = source.url; frame.classList.remove('hidden');
      message('Provider player opened. Press Play inside it. If embedding is blocked, open the selected stream in a new tab.'); return;
    }
    video.classList.remove('hidden'); message('Loading video…');
    function start() {
      video.play().catch(function () { if (current === playback) message('Ready. Press Play in the video player.'); });
    }
    if (source.kind === 'hls' && !video.canPlayType('application/vnd.apple.mpegurl')) {
      if (!window.Hls || !window.Hls.isSupported()) { message('This browser cannot play HLS. Try Safari or open the stream in a new tab.', true); return; }
      hls = new Hls(); hls.loadSource(source.url); hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, start);
      hls.on(Hls.Events.ERROR, function (_, data) {
        if (data.fatal && current === playback) {
          if (hls) { hls.destroy(); hls = null; }
          message('Playback failed. Try another stream or provider. The source may restrict browser access.', true);
        }
      });
    } else { video.src = source.url; video.load(); start(); }
  }
  function showSources(sources, name) {
    el('player').classList.remove('hidden'); el('playing').textContent = name || 'Available streams';
    el('sources').replaceChildren();
    sources.forEach(function (source, index) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'chip';
      button.textContent = (index + 1) + ' · ' + source.label; button.setAttribute('aria-pressed', 'false');
      button.onclick = function () { play(source, button); }; el('sources').appendChild(button);
    });
    message('Choose a stream to watch.');
  }
  async function request(action, id) {
    cancel(); clearMedia(); el('player').classList.add('hidden'); el('results').replaceChildren(); titles = [];
    if (action === 'search') selected = null;
    var current = generation;
    var params = new URLSearchParams({ provider: el('provider').value, action: action, type: el('type').value });
    if (action === 'search') params.set('query', el('query').value.trim());
    else params.set('id', id || '');
    if (el('type').value === 'tv') {
      if (!el('season').checkValidity() || !el('episode').checkValidity()) {
        message('Enter a valid season and episode number.', true); return;
      }
      params.set('season', el('season').value); params.set('episode', el('episode').value);
    }
    controller = new AbortController();
    var timer = setTimeout(function () { if (current === generation) controller.abort(); }, 23000);
    message(action === 'search' ? 'Searching the selected provider…' : 'Finding this title and its streams…');
    el('results').setAttribute('aria-busy', 'true');
    try {
      var response = await fetch('/.netlify/functions/movie-providers?' + params, { signal: controller.signal });
      var data = await response.json();
      if (current !== generation) return;
      if (!response.ok) throw new Error(data.error || 'The provider is unavailable. Try another provider.');
      titles = data.titles || [];
      titles.forEach(function (title) {
        var button = document.createElement('button'); button.type = 'button'; button.className = 'movie-result';
        var name = document.createElement('strong'); name.textContent = title.title;
        var meta = document.createElement('small'); meta.textContent = [title.year, title.type, title.sources.length ? 'Streams available' : 'Find streams'].filter(Boolean).join(' · ');
        button.append(name, meta); button.onclick = function () {
          selected = title; el('id').value = title.id;
          if (title.sources.length) { clearMedia(); showSources(title.sources, title.title); }
          else request('watch', title.id);
        };
        el('results').appendChild(button);
      });
      if ((data.sources || []).length && (!titles.length || action !== 'search')) showSources(data.sources, selected && selected.title);
      else if (titles.length) message('Choose a title to find available streams.');
      else message(data.message || 'No titles or playable streams were returned. Try a different provider or title.');
    } catch (error) {
      if (current === generation) message(error.name === 'AbortError' ? 'The request timed out. Try again or choose another provider.' : error instanceof SyntaxError ? 'The movie service is unavailable. Try again after deployment.' : error.message, true);
    } finally {
      clearTimeout(timer); if (current === generation) el('results').removeAttribute('aria-busy');
    }
  }
  el('search').onsubmit = function (event) { event.preventDefault(); request('search'); };
  el('lookup').onsubmit = function (event) { event.preventDefault(); selected = null; request('details', el('id').value.trim()); };
  el('resolve').onclick = function () { if (el('id').reportValidity()) { selected = null; request('watch', el('id').value.trim()); } };
  function changed() {
    cancel(); clearResults(); el('id').value = '';
    el('episodes').classList.toggle('hidden', el('type').value !== 'tv');
    message('Search the selected provider or enter its title ID.');
  }
  el('provider').onchange = changed; el('type').onchange = changed;
  [el('season'), el('episode')].forEach(function (input) { input.onchange = function () { cancel(); clearMedia(); titles.forEach(function (title) { title.sources = []; }); el('player').classList.add('hidden'); message('Season or episode changed. Choose the title again or press Find streams.'); }; });
  el('stop').onclick = function () { cancel(); clearMedia(); message('Playback stopped. Choose a stream to watch again.'); };
  video.addEventListener('playing', function () { message('Now playing.'); });
  video.addEventListener('waiting', function () { message('Buffering…'); });
  video.addEventListener('error', function () { if (video.getAttribute('src')) message('This stream could not play. Try another stream or open it in a new tab.', true); });
  document.getElementById('stream-load').addEventListener('click', function () { cancel(); clearMedia(); });
  ['grid', 'mine'].forEach(function (id) {
    document.getElementById(id).addEventListener('click', function (event) {
      var button = event.target.closest('[data-watch]'); if (!button) return;
      document.getElementById('home').click();
      el('query').value = button.dataset.watch;
      var title = window.D.find(function (item) { return item[0] === button.dataset.watch; });
      el('type').value = title && title[4] === 'Series' ? 'tv' : 'movie';
      changed(); document.getElementById('movie-watch').scrollIntoView({ behavior: 'smooth', block: 'start' });
      request('search');
    });
  });
  window.addEventListener('pagehide', function () { cancel(); clearMedia(); });
})();
