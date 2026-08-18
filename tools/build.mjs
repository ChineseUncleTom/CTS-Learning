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
 * It also injects the site chrome — the sticky top bar and the previous/next
 * chapter footer — because that navigation is a property of the *site*, not of
 * any one page. Deriving it from CHAPTERS below means adding a chapter updates
 * the nav on every other page automatically, and the Artifact versions of these
 * pages stay standalone and nav-free.
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

/**
 * The chapters, in reading order. Order here *is* the prev/next order.
 * `url` is both the output filename (minus .html) and the clean URL.
 */
const CHAPTERS = [
  {
    src: "cafe-nyquist.html",
    url: "cafe-nyquist",
    n: 3,
    cafe: "Café Nyquist",
    topic: "Analog & digital signals",
    icon: "☕",
    desc: "CTS Chapter 3 — analog and digital signals, taught by two café cats. 8 levels, 3 interactive gadgets and a 7-HP boss.",
  },
  {
    src: "cafe-decibel.html",
    url: "cafe-decibel",
    n: 4,
    cafe: "Café Decibel",
    topic: "Audio systems",
    icon: "🔊",
    desc: "CTS Chapter 4 — audio systems from sound waves to loudspeakers. 11 levels, 5 interactive gadgets and a 15-HP boss.",
  },
  {
    src: "cafe-lumen.html",
    url: "cafe-lumen",
    n: 5,
    cafe: "Café Lumen",
    topic: "Video systems",
    icon: "💡",
    desc: "CTS Chapter 5 — video systems from photon to pixel. 11 levels, 5 interactive gadgets and a 15-HP boss.",
  },
];

/** Pages that are not chapters. `chrome: "plain"` = top bar with the home link only. */
const EXTRAS = [
  {
    src: "home.html",
    url: "index",
    chrome: "none",
    icon: "☕",
    desc: "Study notes for the AVIXA CTS exam — every chapter as a café, every concept as a mnemonic, every quiz as a boss fight.",
  },
  {
    src: "sunbeam-and-whiskers.html",
    url: "design-system",
    chrome: "plain",
    here: "The design system",
    icon: "🐾",
    desc: "The Neko Notes Kit — the design system every CTS Café chapter is built from.",
  },
];

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const titleOf = (html, fallback) => {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : fallback;
};
const stripTitle = (html) => html.replace(/<title>[\s\S]*?<\/title>\s*/i, "");

/** Inline SVG favicon — no extra request, no binary file in the repo. */
const favicon = (emoji) =>
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`
  );

/* ─────────────────────────── site chrome ─────────────────────────── */

/**
 * Uses the kit's own custom properties, so it inherits light/dark automatically.
 * This <style> is injected into <body>, i.e. *after* the page's own <style>, so
 * the `.boss` rule here wins on document order and shifts the sticky HP bar down
 * below the top bar instead of colliding with it.
 */
const NAV_CSS = `
:root{--navh:46px}
.topbar{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:var(--sp-3);
  height:var(--navh);padding:0 var(--sp-4);background:var(--paper);
  border-bottom:var(--bw) solid var(--line);box-shadow:0 3px 0 var(--stamp);
  font-family:var(--f-mono);font-size:var(--t-xs);font-weight:700}
.tb-home{display:inline-flex;align-items:center;gap:.4rem;text-decoration:none;color:var(--ink);
  background:var(--sun);border:2px solid var(--line);border-radius:var(--r-pill);
  padding:.25rem .7rem;box-shadow:2px 2px 0 var(--stamp);white-space:nowrap;
  transition:transform .12s ease}
.tb-home:hover{transform:translate(-1px,-1px)}
.tb-here{color:var(--ink-soft);letter-spacing:.08em;text-transform:uppercase;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tb-links{margin-left:auto;display:flex;gap:var(--sp-2);flex:none}
.tb-arrow{text-decoration:none;color:var(--ink);background:var(--paper-2);
  border:2px solid var(--line);border-radius:var(--r-pill);padding:.25rem .6rem;
  white-space:nowrap;transition:transform .12s ease,background .14s ease}
.tb-arrow:hover{transform:translate(-1px,-1px);background:var(--sun-soft)}
.tb-arrow.is-off{opacity:.45;background:transparent;border-style:dashed;pointer-events:none}
@media (max-width:620px){
  .tb-home span{display:none}
  .tb-here{font-size:.66rem}
}
/* The chapter page's sticky boss bar must clear the sticky top bar.
   Specificity is deliberate: this style block is injected before the page's own
   style block (to avoid a flash of unstyled nav), so a bare .boss selector would
   lose on document order. "body .boss" outranks the kit regardless of order. */
body .boss{top:calc(var(--navh) + var(--sp-2))}

.chapnav{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);
  gap:var(--sp-4);align-items:stretch;margin-top:var(--sp-16)}
@media (max-width:760px){.chapnav{grid-template-columns:1fr}}
.cn-card{display:flex;flex-direction:column;gap:.2rem;text-decoration:none;color:inherit;
  background:var(--paper);border:var(--bw) solid var(--line);border-radius:var(--r-lg);
  box-shadow:var(--pop);padding:var(--sp-4) var(--sp-6);
  border-top:6px solid var(--tone,var(--sakura));transition:transform .16s ease,box-shadow .16s ease}
a.cn-card:hover{transform:translate(-3px,-3px);box-shadow:7px 7px 0 var(--stamp)}
.cn-next{text-align:right}
.cn-dir{font-family:var(--f-mono);font-size:var(--t-xs);font-weight:700;letter-spacing:.14em;
  text-transform:uppercase;color:var(--tone,var(--sakura))}
.cn-name{font-family:var(--f-display);font-size:var(--t-md);line-height:1.2}
.cn-topic{font-family:var(--f-mono);font-size:var(--t-xs);color:var(--ink-soft)}
.cn-card.is-off{opacity:.6;border-style:dashed;box-shadow:none;background:transparent}
.cn-home{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.2rem;
  text-decoration:none;color:var(--tag-ink);background:var(--sun);
  border:var(--bw) solid var(--line);border-radius:var(--r-lg);box-shadow:var(--pop);
  padding:var(--sp-4) var(--sp-6);font-family:var(--f-mono);font-size:var(--t-xs);
  font-weight:700;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;
  transition:transform .16s ease}
.cn-home:hover{transform:translate(-3px,-3px);background:var(--sakura)}
.cn-home i{font-style:normal;font-size:1.6rem;line-height:1}
`;

const TONES = ["var(--lav)", "var(--mint)", "var(--sun)", "var(--sakura)", "var(--sky)"];
const toneFor = (i) => TONES[i % TONES.length];

function topBar({ here, prev, next }) {
  const arrow = (ch, dir) =>
    ch
      ? `<a class="tb-arrow" href="/${ch.url}" title="Chapter ${ch.n} · ${esc(ch.cafe)}">${
          dir === "prev" ? `◂ Ch.${ch.n}` : `Ch.${ch.n} ▸`
        }</a>`
      : `<span class="tb-arrow is-off" aria-hidden="true">${dir === "prev" ? "◂ start" : "next ▸"}</span>`;
  const links =
    prev === undefined && next === undefined
      ? ""
      : `<span class="tb-links">${arrow(prev, "prev")}${arrow(next, "next")}</span>`;
  return `<nav class="topbar" aria-label="Site">
<a class="tb-home" href="/">☕ <span>CTS Café</span></a>
<span class="tb-here">${esc(here)}</span>
${links}
</nav>
`;
}

function chapterNav({ prev, next, prevTone, nextTone }) {
  const card = (ch, dir, tone) => {
    const label = dir === "prev" ? "◂ Previous" : "Next ▸";
    if (!ch) {
      const msg =
        dir === "prev"
          ? ["This is the first one", "Start of the series"]
          : ["Not written yet", "More cafés are coming"];
      return `<span class="cn-card cn-${dir} is-off"><span class="cn-dir">${label}</span>
<span class="cn-name">${msg[0]}</span><span class="cn-topic">${msg[1]}</span></span>`;
    }
    return `<a class="cn-card cn-${dir}" href="/${ch.url}" style="--tone:${tone}"><span class="cn-dir">${label}</span>
<span class="cn-name">${ch.icon} ${esc(ch.cafe)}</span><span class="cn-topic">Ch.${ch.n} · ${esc(ch.topic)}</span></a>`;
  };
  return `<nav class="chapnav" aria-label="Chapters">
${card(prev, "prev", prevTone)}
<a class="cn-home" href="/"><i>☕</i>All chapters</a>
${card(next, "next", nextTone)}
</nav>
`;
}

/* ─────────────────────────── document shell ─────────────────────────── */

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

/** Put the footer nav inside <main>, just before the page's own <footer>. */
function insertBeforeFooter(html, block) {
  const i = html.search(/<footer[\s>]/i);
  if (i === -1) return html.replace(/<\/main>/i, `${block}</main>`);
  return html.slice(0, i) + block + html.slice(i);
}

/* ─────────────────────────── build ─────────────────────────── */

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith(".html")) rmSync(join(OUT, f));

let built = 0;
const emit = (outName, title, desc, icon, body) => {
  writeFileSync(join(OUT, outName), shell({ title, desc, body, icon }), "utf8");
  console.log(`  ${outName.padEnd(24)} ${title}`);
  built++;
};

// chapters — full chrome, prev/next derived from CHAPTERS order
CHAPTERS.forEach((ch, i) => {
  const prev = CHAPTERS[i - 1] ?? null;
  const next = CHAPTERS[i + 1] ?? null;
  const raw = readFileSync(join(SRC, ch.src), "utf8");
  let body = `<style>${NAV_CSS}</style>\n`;
  body += topBar({ here: `Ch.${ch.n} · ${ch.topic}`, prev, next });
  body += stripTitle(raw);
  body = insertBeforeFooter(
    body,
    chapterNav({ prev, next, prevTone: toneFor(i - 1), nextTone: toneFor(i + 1) })
  );
  emit(`${ch.url}.html`, titleOf(raw, ch.cafe), ch.desc, ch.icon, body);
});

// extras
for (const p of EXTRAS) {
  const raw = readFileSync(join(SRC, p.src), "utf8");
  let body = "";
  if (p.chrome === "plain") {
    body += `<style>${NAV_CSS}</style>\n` + topBar({ here: p.here });
  }
  body += stripTitle(raw);
  emit(`${p.url}.html`, titleOf(raw, p.url), p.desc, p.icon, body);
}

// 404, in the same style
const kit = readFileSync(join(SRC, "home.html"), "utf8");
const kitCss = kit.match(/<style>([\s\S]*?)<\/style>/)[1];
const sprites = kit.match(/<svg width="0" height="0"[\s\S]*?<\/svg>/)[0];
emit(
  "404.html",
  "Lost in the café",
  "That page isn't on the menu.",
  "🐈",
  `<style>${kitCss}${NAV_CSS}</style>
${topBar({ here: "Page not found" })}
<div class="wrap lost"><div class="lost-in">
  <svg viewBox="0 0 120 120" aria-hidden="true"><use href="#anna"/></svg>
  <h1>404</h1>
  <p class="lede" style="text-align:center">That page isn't on the menu. Anna has looked behind the
    espresso machine and everything.</p>
  <a class="chip" href="/" style="font-size:1rem;padding:.5rem 1.1rem">☕ back to the café</a>
</div></div>
${sprites}`
);

console.log(`\n✓ built ${built} pages into public/`);
