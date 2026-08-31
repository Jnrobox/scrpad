/* scrpad app: editor wiring, autosave, and cross-device sync. */
(function () {
  'use strict';

  var AUTOSAVE_DELAY = 1000; // ms after last edit before saving
  var POLL_INTERVAL = 60000; // ms between background sync checks
  var CACHE_KEY = 'scrpad_cache';

  var Storage = window.ScrpadStorage;

  var BACKEND_KEY = 'scrpad_backend';
  var ETAG_KEY = 'scrpad_etag';

  var statusEl = document.getElementById('status');
  var bannerEl = document.getElementById('readonly-banner');
  var modalEl = document.getElementById('settings-modal');
  var tokenInput = document.getElementById('token-input');
  var backendSelect = document.getElementById('backend-select');
  var firebaseUrlInput = document.getElementById('firebase-url-input');
  var githubSettingsEl = document.getElementById('github-settings');
  var firebaseSettingsEl = document.getElementById('firebase-settings');

  function getBackendName() {
    return localStorage.getItem(BACKEND_KEY) === 'firebase' ? 'firebase' : 'github';
  }

  function getBackend() {
    return Storage[getBackendName()];
  }

  var currentSha = null;   // sha of the note file we last read/wrote
  var suppressChange = false;
  var saveTimer = null;
  var dirty = false;

  // ---------- Editor ----------
  var quill = new Quill('#editor', {
    theme: 'snow',
    placeholder: 'Start typing your scratchpad…',
    modules: {
      toolbar: {
        container: '#toolbar',
        handlers: { image: imageButtonHandler },
      },
      // Quill's built-in uploader handles dropped image files natively
      // (default mimetypes are only png/jpeg — extend the list).
      uploader: {
        mimetypes: [
          'image/png', 'image/jpeg', 'image/gif',
          'image/webp', 'image/svg+xml', 'image/bmp', 'image/avif',
        ],
      },
    },
  });

  function imageButtonHandler() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = function () {
      insertImageFiles(Array.prototype.slice.call(input.files || []));
    };
    input.click();
  }

  function insertImageFiles(files, index) {
    var images = files.filter(function (f) { return f.type.indexOf('image/') === 0; });
    if (!images.length) return;
    var i = (typeof index === 'number') ? index
      : (quill.getSelection(true) || { index: quill.getLength() }).index;
    images.forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function (e) {
        quill.insertEmbed(i, 'image', e.target.result, 'user');
        i += 1;
      };
      reader.readAsDataURL(file);
    });
  }

  // Note: pasted images (Ctrl+V) are handled natively by Quill, which inserts
  // image files from the clipboard as base64 — no custom handler needed.
  // Drag & drop is likewise handled natively by Quill's built-in uploader
  // module (configured above with extended mimetypes), which places the caret
  // at the drop position and inserts the image. Adding our own drop handler
  // would insert the image a second time.

  // ---------- Status & persistence ----------
  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = 'status ' + (kind || '');
  }

  function updateBanner() {
    bannerEl.hidden = getBackend().isConfigured();
  }

  function cacheNote(note) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(note));
    } catch (e) { /* localStorage quota exceeded — ignore */ }
  }

  function cacheCurrentNote() {
    cacheNote({ timestamp: new Date().toISOString(), html: quill.root.innerHTML });
  }

  function applyNote(note) {
    suppressChange = true;
    try {
      quill.setContents([]);
      if (note && note.html) quill.clipboard.dangerouslyPasteHTML(note.html, 'api');
    } finally {
      suppressChange = false;
    }
  }

  // ---------- Autosave ----------
  quill.on('text-change', function () {
    if (suppressChange) return;
    dirty = true;
    setStatus('Saving…', 'saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, AUTOSAVE_DELAY);
  });

  async function doSave() {
    if (!dirty) return;
    var backend = getBackend();
    if (!backend.isConfigured()) {
      cacheCurrentNote();
      setStatus('Saved locally — open ⚙ Settings to configure sync', 'local');
      return;
    }
    var note = { timestamp: new Date().toISOString(), html: quill.root.innerHTML };
    setStatus('Saving…', 'saving');
    try {
      currentSha = await backend.saveNote(note, currentSha);
      dirty = false;
      cacheNote(note);
      setStatus('Saved ✓', 'saved');
    } catch (err) {
      if (err.conflict) {
        await resolveConflict(note);
      } else {
        cacheCurrentNote();
        setStatus('Offline — saved locally', 'error');
      }
    }
  }

  async function resolveConflict(note) {
    try {
      var backend = getBackend();
      var remote = await backend.fetchNote(true);
      var remoteTs = (remote.note && remote.note.timestamp) || '';
      if (!remoteTs || remoteTs < note.timestamp) {
        // Local edit is newer: overwrite the older remote version.
        currentSha = await backend.saveNote(note, remote.etag);
        dirty = false;
        cacheNote(note);
        setStatus('Saved ✓', 'saved');
      } else {
        // Remote is newer: last write wins, accept the remote version.
        currentSha = remote.etag;
        dirty = false;
        applyNote(remote.note);
        cacheNote(remote.note);
        setStatus('Synced — newer version from another device loaded', 'saved');
      }
    } catch (err2) {
      setStatus('Sync error: ' + err2.message, 'error');
    }
  }

  // ---------- Background sync ----------
  async function refreshFromRemote(force) {
    if (dirty || document.hidden) return;
    try {
      var res = await getBackend().fetchNote(force);
      if (res.notModified) return;
      currentSha = res.etag;
      if (!res.note) return;
      var cached = null;
      try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { /* ignore */ }
      if (!cached || (res.note.timestamp || '') !== (cached.timestamp || '')) {
        applyNote(res.note);
        cacheNote(res.note);
        setStatus('Updated from remote ✓', 'saved');
      }
    } catch (err) { /* offline — keep showing cached content */ }
  }

  // ---------- Settings modal ----------
  function showSettingsSections() {
    var isFirebase = backendSelect.value === 'firebase';
    githubSettingsEl.hidden = isFirebase;
    firebaseSettingsEl.hidden = !isFirebase;
  }

  document.getElementById('settings-btn').addEventListener('click', function () {
    backendSelect.value = getBackendName();
    tokenInput.value = Storage.github.getToken();
    firebaseUrlInput.value = Storage.firebase.getUrl();
    showSettingsSections();
    modalEl.hidden = false;
  });

  backendSelect.addEventListener('change', showSettingsSections);

  document.getElementById('settings-close').addEventListener('click', function () {
    modalEl.hidden = true;
  });

  document.getElementById('settings-save').addEventListener('click', function () {
    var previousBackend = getBackendName();
    Storage.github.setToken(tokenInput.value.trim());
    Storage.firebase.setUrl(firebaseUrlInput.value.trim());
    localStorage.setItem(BACKEND_KEY, backendSelect.value === 'firebase' ? 'firebase' : 'github');
    if (previousBackend !== getBackendName()) {
      localStorage.removeItem(ETAG_KEY); // cached ETag belongs to the old backend
      currentSha = null;
    }
    updateBanner();
    modalEl.hidden = true;
    if (dirty) doSave();
  });

  document.getElementById('settings-remove').addEventListener('click', function () {
    Storage.github.setToken('');
    Storage.firebase.setUrl('');
    updateBanner();
    modalEl.hidden = true;
  });

  modalEl.addEventListener('click', function (e) {
    if (e.target === modalEl) modalEl.hidden = true;
  });

  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- Init ----------
  function init() {
    updateBanner();
    try {
      var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached && cached.html) {
        applyNote(cached);
        setStatus('Loaded from cache…', '');
      }
    } catch (e) { /* corrupt cache — start empty */ }

    refreshFromRemote(true);
    setInterval(function () { refreshFromRemote(false); }, POLL_INTERVAL);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refreshFromRemote(true);
    });
  }

  init();
})();
