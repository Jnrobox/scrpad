/* scrpad storage: GitHub repository-backed note storage via the Contents REST API. */
(function () {
  'use strict';

  var API_URL = 'https://api.github.com/repos/Jnrobox/scrpad/contents/note.json';
  var TOKEN_KEY = 'scrpad_token';
  var ETAG_KEY = 'scrpad_etag';

  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    var CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  function base64ToUtf8(b64) {
    var bin = atob(b64.replace(/\n/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  /**
   * Fetch the note from the repo.
   * Returns { notModified: true } | { note: object|null, sha: string|null }.
   * A 404 (note file missing, or private repo without token) yields
   * { note: null, sha: null }.
   * Conditional requests with ETag keep us within GitHub's rate limits.
   */
  async function fetchNote(force) {
    var headers = { Accept: 'application/vnd.github+json' };
    var token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    var etag = localStorage.getItem(ETAG_KEY);
    if (!force && etag) headers['If-None-Match'] = etag;

    var res = await fetch(API_URL + '?t=' + Date.now(), { headers: headers, cache: 'no-store' });

    if (res.status === 304) return { notModified: true };
    if (res.status === 404) return { note: null, sha: null };
    if (!res.ok) throw new Error('GitHub API error ' + res.status);

    var data = await res.json();
    var newEtag = res.headers.get('ETag');
    if (newEtag) localStorage.setItem(ETAG_KEY, newEtag);

    var note = null;
    try {
      note = JSON.parse(base64ToUtf8(data.content));
    } catch (e) {
      note = { timestamp: '', html: '' };
    }
    return { note: note, sha: data.sha };
  }

  /**
   * Save the note to the repo. Returns the new file sha.
   * Throws an Error with .conflict = true on 409 (stale sha).
   */
  async function saveNote(note, sha) {
    var token = getToken();
    if (!token) throw new Error('Read-only mode: no GitHub token configured.');

    var body = {
      message: 'scrpad: update note (' + new Date().toISOString() + ')',
      content: utf8ToBase64(JSON.stringify(note)),
    };
    if (sha) body.sha = sha;

    var res = await fetch(API_URL, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (res.status === 409) {
      var err = new Error('Conflict: the note changed on the server.');
      err.conflict = true;
      throw err;
    }
    if (res.status === 401) throw new Error('Invalid or expired GitHub token (401).');
    if (res.status === 403) throw new Error('GitHub rejected the write (403): check token permissions or rate limit.');
    if (!res.ok) throw new Error('GitHub API error ' + res.status);

    var data = await res.json();
    return data.content ? data.content.sha : null;
  }

  window.ScrpadStorage = { getToken: getToken, setToken: setToken, fetchNote: fetchNote, saveNote: saveNote };
})();
