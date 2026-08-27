# scrpad

GitHub link:
https://github.com/Jnrobox/scrpad

web app link:
https://jnrobox.github.io/scrpad

Make a web app which implements basic scratchpad with text and images.
Usage:
- user opens this web app link in any web browser
- this is single page web site
- the page contains simple editor (example: https://anotepad.com/richtext)
- user can edit content inside editor window (text, images)
- all changes are saved automatically (like in Google docs, no need to click SAVE)
- when user opens this link on any other device or browser - web page looks the same (text, images)

## How it works

- Single-page app with no build step: `index.html` + `styles.css` + `app.js` + `storage.js`
  (editor powered by [Quill](https://quilljs.com/) via CDN)
- The note content lives in this repository as `note.json`
- Reads: anonymous, via the GitHub Contents REST API
- Writes: require a fine-grained GitHub Personal Access Token
  (Contents: Read & Write, scoped to this repo), entered once per browser
  in ⚙ Settings — stored only in that browser's localStorage
- Autosave: debounced (1 s), with localStorage cache for offline/instant load
- Sync: refresh on tab focus + every 60 s; conflicts resolved last-write-wins

## Deploy

1. Push this directory to the `main` branch of `Jnrobox/scrpad`
2. GitHub → repo → Settings → Pages → Source: *Deploy from a branch* →
   Branch: `main` / `/ (root)` → Save
3. The app is served at https://jnrobox.github.io/scrpad
4. To enable editing from a browser: create a fine-grained PAT
   (Settings → Developer settings → Fine-grained tokens; repository access:
   `Jnrobox/scrpad`; permission: Contents — Read and Write) and paste it
   in the app's ⚙ Settings dialog

## Local development

```sh
python3 -m http.server 8080   # then open http://localhost:8080
```

