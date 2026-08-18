# Marginalia

**A small notebook that follows the reader.**

Marginalia is a quiet writing companion for people who read books, poetry,
philosophy, and anything else, and want to capture what they notice while
reading. A small pen floats on the left edge of the screen, above every other
window. Click it, pick a category, write, save, and keep reading.

The philosophy: **Observe → Connect → Write → Save → Return later.**

The app never forces you to write poetry. It collects the raw material: the
observations, images, connections, feelings, ideas, and stray lines from which
poetry and other writing can later emerge. It is not an AI generator, and it
never will be.

Marginalia ships as a Windows desktop app and as an installable phone app
(progressive web app). Both share the same storage format, so a backup made on
one device can be restored on the other. The landing page includes a QR code
so phones can open the app page and install it directly.

## Features

- **Floating pen widget** (Windows). A frameless, transparent, always-on-top
  pen icon pinned to the left edge of the screen. Draggable vertically. Stays
  visible while you read a PDF, browser page, ebook, or document.
- **Quick capture**. Click the pen, click a category, type, save. Seconds.
  No required fields.
- **Eight categories**. Observe, Images, Connections, Feelings, Ideas, Lines,
  Drafts, and Poems, each with a gentle prompt.
- **Optional context**. Title, book/source, author, page, date, and tags are
  all optional, never required.
- **Automatic timestamps**. Created and modified times are recorded for every
  note, always.
- **Local persistent storage**. Everything lives in one versioned JSON
  document. On Windows it is a file written atomically with a rolling backup;
  on a phone it lives in the browser's IndexedDB. Fully offline. Survives
  restarts and updates.
- **Organization**. All notes, by category, by book, by tag, plus reading
  sessions.
- **Search**. Across note content, titles, books, authors, and tags.
- **Linking**. Link related notes together, so an observation can grow into a
  connection, a line, and eventually a poem.
- **Reading sessions**. Start a session with a book/author/chapter; every note
  captured during it is attached automatically, and you can revisit the whole
  session later.
- **Review**. Filter by today / this week / this month / older, plus
  "Give me something to revisit", which resurfaces a random old observation,
  image, connection, or line.
- **Any language**. Full Unicode support. Mix English, Nepali, Hindi,
  Cyrillic, Arabic, Chinese, Japanese, Korean, whatever you like. Nothing is
  translated or corrected.
- **Export**. Individual notes, categories, books, sessions, or the entire
  library to TXT, Markdown, JSON, or PDF (rendered locally, no servers).
- **Backup & restore**. One-click full backups and restores.
- **Privacy**. Local-only. No analytics, no accounts, no network calls.
- **Configurable shortcuts** (Windows). Ctrl+Shift+P (toggle), Ctrl+Shift+O
  (new observation), Ctrl+Shift+L (new line), all changeable in Settings.

## Running from source

Requires Node.js 20+.

```bash
npm install
npm start
```

Other commands:

```bash
npm run check    # syntax-check every JS file
npm test         # unit tests for the storage layer
npm run smoke    # launch the app and auto-quit after 5s (verifies it boots)
npm run dist     # build the Windows installer with electron-builder
npm run icons    # regenerate the app icons (PNG for the PWA, ICO for Windows)
```

The Windows installer appears in `dist/` as `Marginalia Setup 1.0.0.exe`.

## The phone app (PWA)

The phone version lives in `website/app/` and installs like a normal app:

1. Serve the `website/` folder (or deploy it), or open the site on your phone.
2. In Chrome, use Install app. In Safari, use Add to Home Screen.
3. It opens standalone, works offline, and stores notes in the browser.

The phone build reuses the exact same library UI and the same storage logic
(`src/main/store.js` is loaded directly by the browser build with an
IndexedDB persistence adapter). It needs HTTPS or localhost to install, as all
service workers do. There is no floating pen on a phone; the app opens
straight into the notebook. An "Install app" bar appears when the browser
supports it (Android/Chrome), and on iPhone the bar explains how to add to
Home Screen.

## Where your writing lives

On Windows, data is stored in Electron's user-data directory:

```
%APPDATA%\Marginalia\data\library.json
```

You can see and open this folder from Settings → Your writing. The file is a
plain UTF-8 JSON document (easy to back up or inspect), written atomically
with a `.bak` copy kept alongside. On a phone the same document is stored in
IndexedDB under the `marginalia` database.

## Keyboard shortcuts (Windows)

| Action | Default |
| --- | --- |
| Open / collapse widget | `Ctrl + Shift + P` |
| New observation | `Ctrl + Shift + O` |
| New line | `Ctrl + Shift + L` |

All three are configurable in Settings → Keyboard shortcuts. The widget also
has a right-click menu (open library, always-on-top, pin, quit).

## Architecture

```
src/
  main/                 Electron main process
    main.js             app entry, window wiring, lifecycle
    store.js            shared local store (UMD: Electron + browser builds)
    widget-window.js    floating pen/panel window (frameless, transparent, on-top)
    library-window.js   main library window
    shortcuts.js        global keyboard shortcuts
    ipc.js              all IPC handlers
    export.js           TXT/MD/JSON/PDF export + backup/restore (Electron)
  preload/              contextBridge APIs exposed to each renderer
  renderer/
    widget/             floating pen icon + quick-capture panel
    library/            full library: search, editor, sessions, books, tags, review, settings
  shared/
    categories.json     the eight categories (labels, prompts, hints)
    export-formats.js   TXT/Markdown/PDF serializers (UMD, shared with the web)
website/
  index.html            landing page with download buttons
  app/                  phone PWA (same UI, IndexedDB storage, service worker)
test/                   storage-layer unit tests (node:test)
scripts/check.js        syntax checker
scripts/make-icons.js   icon generator (Electron)
build/                  generated Windows icon (icon.ico)
```

The storage layer (`store.js`) has no Electron dependency and is covered by
unit tests. It uses injectable IO, so the same logic runs against files on
Windows and IndexedDB in the browser. The document carries a schema version
(`SCHEMA_VERSION`) with a `migrate()` entry point so future app updates can
migrate user data safely.
