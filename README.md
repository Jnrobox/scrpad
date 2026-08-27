# scrpad

GitHub link:
https://github.com/Jnrobox/scrpad

Web app link:
https://jnrobox.github.io/scrpad

# How it works

- Single-page app with no build step: `index.html` + `styles.css` + `app.js` + `storage.js`
  (editor powered by [Quill](https://quilljs.com/) via CDN)
- The note content lives in this repository as `note.json`
- Reads: anonymous, via the GitHub Contents REST API
- Writes: require a fine-grained GitHub Personal Access Token
  (Contents: Read & Write, scoped to this repo), entered once per browser
  in ⚙ Settings — stored only in that browser's localStorage
- Autosave: debounced (1 s), with localStorage cache for offline/instant load
- Sync: refresh on tab focus + every 60 s; conflicts resolved last-write-wins

# Deploy

1. Push this directory to the `main` branch of `Jnrobox/scrpad`
2. GitHub → repo → Settings → Pages → Source: *Deploy from a branch* →
   Branch: `main` / `/ (root)` → Save
3. The app is served at https://jnrobox.github.io/scrpad
4. To enable editing from a browser: create a fine-grained PAT
   (Settings → Developer settings → Fine-grained tokens; repository access:
   `Jnrobox/scrpad`; permission: Contents — Read and Write) and paste it
   in the app's ⚙ Settings dialog

# Local development

```sh
python3 -m http.server 8080   # then open http://localhost:8080
```

