/* scrpad storage: pluggable backends storing the note { timestamp, html }.
 *
 * Backends (selected in ⚙ Settings, stored in localStorage per browser):
 *  - GitHubStorage — note.json via the GitHub Contents REST API
 *    (read: anonymous or with token; write: needs a fine-grained PAT)
 *  - FirebaseStorage — raw JSON node via Firebase Realtime Database REST
 *    (no credentials: the secret URL path is the access control)
 *
 * Both expose: isConfigured(), fetchNote(force), saveNote(note, etag).
 * Both throw an Error with .conflict = true when the remote copy changed
 * since we last read it (GitHub: 409, Firebase: 412).
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'scrpad_token';
  var ETAG_KEY = 'scrpad_etag';

  // ---------- shared helpers ----------
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

  // ---------- GitHub backend ----------
  var GitHubStorage = {
    name: 'github',
    apiUrl: 'https://api.github.com/repos/Jnrobox/scrpad/contents/note.json',

    getToken: function () {
      return localStorage.getItem(TOKEN_KEY) || '';
    },

    setToken: function (token) {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    },

    isConfigured: function () {
      return !!this.getToken();
    },

    /* Returns { notModified } | { note: object|null, etag: string|null }.
     * A 404 (note file missing, or access denied) yields { note: null, etag: null }.
     * Conditional requests with ETag keep us within GitHub's rate limits. */
    fetchNote: async function (force) {
      var headers = { Accept: 'application/vnd.github+json' };
      var token = this.getToken();
      if (token) headers.Authorization = 'Bearer ' + token;
      var etag = localStorage.getItem(ETAG_KEY);
      if (!force && etag) headers['If-None-Match'] = etag;

      var res = await fetch(this.apiUrl, { headers: headers, cache: 'no-store' });

      if (res.status === 304) return { notModified: true };
      if (res.status === 404) return { note: null, etag: null };
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
      return { note: note, etag: data.sha };
    },


    /* Saves the note; returns the new file sha. */
    saveNote: async function (note, sha) {
      var token = this.getToken();
      if (!token) throw new Error('Read-only mode: no GitHub token configured.');

      var body = {
        message: 'scrpad: update note (' + new Date().toISOString() + ')',
        content: utf8ToBase64(JSON.stringify(note)),
      };
      if (sha) body.sha = sha;

      var res = await fetch(this.apiUrl, {
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
    },
  };

  // ---------- Firebase backend ----------
  var FIREBASE_URL_KEY = 'scrpad_firebase_url';

  var FirebaseStorage = {
    name: 'firebase',

    getUrl: function () {
      return localStorage.getItem(FIREBASE_URL_KEY) || '';
    },

    setUrl: function (url) {
      if (url) localStorage.setItem(FIREBASE_URL_KEY, url);
      else localStorage.removeItem(FIREBASE_URL_KEY);
    },

    isConfigured: function () {
      return !!this.getUrl();
    },

    /* Returns { notModified } | { note: object|null, etag: string|null }.
     * Firebase answers 200 "null" for a missing node. The X-Firebase-ETag
     * request header makes the server return + expose the ETag to JS. */
    fetchNote: async function (force) {
      var url = this.getUrl();
      if (!url) throw new Error('Firebase URL not configured.');

      var headers = { Accept: 'application/json', 'X-Firebase-ETag': 'true' };
      var etag = localStorage.getItem(ETAG_KEY);
      if (!force && etag) headers['If-None-Match'] = etag;

      var res = await fetch(url, { headers: headers, cache: 'no-store' });

      if (res.status === 304) return { notModified: true };
      if (!res.ok) throw new Error('Firebase API error ' + res.status);

      var newEtag = res.headers.get('ETag');
      if (newEtag) localStorage.setItem(ETAG_KEY, newEtag);

      var data = await res.json();
      if (data == null) return { note: null, etag: null };
      return { note: data, etag: newEtag };
    },

    /* Saves the note; returns the new ETag. Sends If-Match so a stale
     * copy is rejected with 412 (conflict) instead of silently overwriting. */
    saveNote: async function (note, etag) {
      var url = this.getUrl();
      if (!url) throw new Error('Firebase URL not configured.');

      var headers = { 'Content-Type': 'application/json', 'X-Firebase-ETag': 'true' };
      if (etag) headers['If-Match'] = etag;

      var res = await fetch(url, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(note),
      });

      if (res.status === 412) {
        var err = new Error('Conflict: the note changed on the server.');
        err.conflict = true;
        throw err;
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error('Firebase rejected the write (' + res.status + '): check database rules and URL.');
      }
      if (!res.ok) throw new Error('Firebase API error ' + res.status);

      return res.headers.get('ETag');
    },
  };

  window.ScrpadStorage = { github: GitHubStorage, firebase: FirebaseStorage };
})();
