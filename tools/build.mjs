#!/usr/bin/env node
/**
 * CTS Café — static site build
 *
 * The pages in src/ are authored as Claude Artifacts, which means they are page
 * *fragments*: they start at <title> and have no <!DOCTYPE>, <html>, <head> or
 * <body>, because the Artifact host adds those at publish time.
 *
 * Firebase Hosting does not. Served raw, those files would land in quirks mode
 * with no viewport meta, so every phone would render them at ~980px and zoom
 * out. This script wraps each fragment in a real HTML document and writes the
 * result to public/.
 *
 * Run:  node tools/build.mjs
 * No dependencies, no install step.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = join(ROOT, "public");

/** src filename -> { out, desc, theme } — `out` also defines the public URL. */
const PAGES = {
  "home.html": {
    out: "index.html",
    desc: "Study notes for the AVIXA CTS exam — every chapter as a café, every concept as a mnemonic, every quiz as a boss fight.",
  },
  "cafe-nyquist.html": {
    out: "cafe-nyquist.html",
    desc: "CTS Chapter 3 — analog and digital signals, taught by two café cats. 8 levels, 3 interactive gadgets and a 7-HP boss.",
  },
  "cafe-decibel.html": {
    out: "cafe-decibel.html",
    desc: "CTS Chapter 4 — audio systems from sound waves to loudspeakers. 11 levels, 5 interactive gadgets and a 15-HP boss.",
  },
  "cafe-lumen.html": {
    out: "cafe-lumen.html",
    desc: "CTS Chapter 5 — video systems from photon to pixel. 11 levels, 5 interactive gadgets and a 15-HP boss.",
  },
  "sunbeam-and-whiskers.html": {
    out: "design-system.html",
    desc: "The Neko Notes Kit — the design system every CTS Café chapter is built from.",
  },
};

/** Pull the <title> out of a fragment so we don't have to duplicate it here. */
function titleOf(html, fallback) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : fallback;
}

/** The fragment carries its own <title>; strip it so the shell owns the head. */
function stripTitle(html) {
  return html.replace(/<title>[\s\S]*?<\/title>\s*/i, "");
}

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** An inline SVG favicon, so the tab icon needs no extra request or binary file. */
const favicon = (emoji) =>
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`
  );

const FAVICONS = {
  "index.html": "☕",
  "cafe-nyquist.html": "☕",
  "cafe-decibel.html": "🔊",
  "cafe-lumen.html": "💡",
  "design-system.html": "🐾",
};

function shell({ title, desc, body, icon }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#FFF3E4" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#241823" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<link rel="icon" href="${favicon(icon)}">
<style>*,*::before,*::after{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0}img,svg,canvas{max-width:100%}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

mkdirSync(OUT, { recursive: true });

// Clear previously generated html so a renamed page can't linger and get served.
for (const f of readdirSync(OUT)) {
  if (f.endsWith(".html")) rmSync(join(OUT, f));
}

let n = 0;
for (const [srcName, cfg] of Object.entries(PAGES)) {
  const raw = readFileSync(join(SRC, srcName), "utf8");
  const title = titleOf(raw, cfg.out);
  const html = shell({
    title,
    desc: cfg.desc,
    body: stripTitle(raw),
    icon: FAVICONS[cfg.out] ?? "☕",
  });
  writeFileSync(join(OUT, cfg.out), html, "utf8");
  console.log(`  ${srcName.padEnd(28)} -> public/${cfg.out.padEnd(22)} ${title}`);
  n++;
}

// A 404 in the same style, built from a tiny inline fragment.
const kit = readFileSync(join(SRC, "home.html"), "utf8");
const kitCss = kit.match(/<style>([\s\S]*?)<\/style>/)[1];
const sprites = kit.match(/<svg width="0" height="0"[\s\S]*?<\/svg>/)[0];
writeFileSync(
  join(OUT, "404.html"),
  shell({
    title: "Lost in the café",
    desc: "That page isn't on the menu.",
    icon: "🐈",
    body: `<style>${kitCss}</style>
<div class="wrap lost"><div class="lost-in">
  <svg viewBox="0 0 120 120" aria-hidden="true"><use href="#anna"/></svg>
  <h1>404</h1>
  <p class="lede" style="text-align:center">That page isn't on the menu. Anna has looked behind the
    espresso machine and everything.</p>
  <a class="chip" href="/" style="font-size:1rem;padding:.5rem 1.1rem">☕ back to the café</a>
</div></div>
${sprites}`,
  }),
  "utf8"
);
console.log(`  (generated)                  -> public/404.html`);

console.log(`\n✓ built ${n + 1} pages into public/`);
