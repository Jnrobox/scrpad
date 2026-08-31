# scrpad

GitHub link:
https://github.com/Jnrobox/scrpad

Web app link:
https://jnrobox.github.io/scrpad

# How it works

- Single-page app with no build step: `index.html` + `styles.css` + `app.js` + `storage.js`
  (editor powered by [Quill](https://quilljs.com/) via CDN)
- The note is `{ "timestamp": …, "html": … }` stored through one of two
  pluggable backends, selected per browser in ⚙ Settings:
  - **GitHub** — `note.json` on the `data` branch of this repository
    (a dedicated branch, so app saves never churn `main`). Reads via the
    GitHub Contents REST API (anonymous); writes need a fine-grained
    GitHub Personal Access Token (Contents: Read & Write, scoped to this repo).
  - **Firebase** — a JSON node in a Firebase Realtime Database. No
    credentials: the secret URL path is the access control (free Firebase
    project → Realtime Database → lock rules to a random secret path →
    paste the note URL into ⚙ Settings).
- Autosave: debounced (1 s), with localStorage cache for offline/instant load
- Sync: refresh on tab focus + every 60 s; conflicts detected via ETag
  conditional requests and resolved last-write-wins by timestamp
- Use the same backend on every device to see the same note

# Deploy

1. Push this directory to the `main` branch of `Jnrobox/scrpad`
2. GitHub → repo → Settings → Pages → Source: *Deploy from a branch* →
   Branch: `main` / `/ (root)` → Save
3. The app is served at https://jnrobox.github.io/scrpad
4. Open the app, pick a backend in ⚙ Settings and configure it
   (see "How it works" above)

# Local development

```sh
python3 -m http.server 8080   # then open http://localhost:8080
```

# NOTES
use in the vscode terminal
git status
git pull
git push
