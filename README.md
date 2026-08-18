# CTS Café ☕

Study notes for the AVIXA **CTS** exam, built as a small static site.
Every chapter is a café, every concept is a mnemonic, and every quiz is a boss fight.

Live: **https://cts-cafe.web.app**

| Page | Chapter | URL |
| --- | --- | --- |
| Café Nyquist | 3 — Analog & digital signals | `/cafe-nyquist` |
| Café Decibel | 4 — Audio systems | `/cafe-decibel` |
| Café Lumen | 5 — Video systems | `/cafe-lumen` |
| Neko Notes Kit | the design system | `/design-system` |

## How it's put together

```
src/        page sources  (authored as Claude Artifacts — fragments, no <html> wrapper)
tools/      build.mjs     (wraps each fragment in a real HTML document)
public/     generated     (what Firebase actually serves — committed on purpose)
```

`src/*.html` start at `<title>` and have no `<!DOCTYPE>`, `<head>` or `<body>`, because the
Artifact host adds those at publish time. Firebase does not — served raw they'd land in quirks
mode with no viewport meta, so phones would render them at ~980px and zoom out.
`tools/build.mjs` adds the document shell: doctype, `charset=utf-8`, viewport, description,
theme-color and an inline SVG favicon.

## Working on it

```bash
node tools/build.mjs                  # rebuild public/ from src/
firebase emulators:start --only hosting   # preview at http://127.0.0.1:5000
```

Edit **`src/`**, never `public/` — the build wipes and regenerates every `.html` in there.

`public/` is committed so deployment needs no build step in CI. Rebuild and commit both
whenever you change a page.

## Deploying

Push to `main` and GitHub Actions deploys to the live channel. Opening a PR deploys a
temporary preview channel and comments the URL on the PR.

To deploy by hand instead:

```bash
firebase deploy --only hosting
```

## Adding a chapter

1. Put the new page fragment in `src/` (no `<html>` wrapper — match the existing files).
2. Add an entry to the `CHAPTERS` array in `tools/build.mjs`, in reading order.
3. Add a card to the shelf in `src/home.html`.
4. `node tools/build.mjs`, then commit `src/` and `public/` together.

The top bar and the previous/next footer are **generated from `CHAPTERS`**, so step 2 wires up
the navigation on every other chapter automatically — you never edit nav markup by hand.
