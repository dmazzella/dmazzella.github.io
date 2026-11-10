"use strict";

// ------------------------------------------------------------- highlighting

const KEYWORDS = {
  python: "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield print",
  js: "async await break case catch class const continue default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined using var void while yield",
  cpp: "auto bool break case catch char class const constexpr continue default delete do double else enum explicit false float for if inline int long namespace new noexcept nullptr operator private protected public return short signed sizeof static struct switch template this throw true try typedef typename unsigned using virtual void while std",
};

const COMMENT = {
  python: String.raw`#[^\n]*`,
  js: String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`,
  cpp: String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`,
};

function tokenizer(lang) {
  const parts = [
    lang === "cpp" ? String.raw`(?<pre>#\s*\w+(?:\s*<[^>\n]*>)?)` : null,
    `(?<com>${COMMENT[lang]})`,
    String.raw`(?<str>[bfrBFR]?"(?:\\.|[^"\\\n])*"|[bfrBFR]?'(?:\\.|[^'\\\n])*'|\x60(?:\\.|[^\x60\\])*\x60)`,
    String.raw`(?<num>\b(?:0[xX][\da-fA-F_]+|\d[\d_]*(?:\.\d+)?n?)\b)`,
    String.raw`(?<id>[A-Za-z_$][\w$]*)(?<call>\s*\()?`,
  ];
  return new RegExp(parts.filter(Boolean).join("|"), "g");
}

const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const span = (cls, text) => `<span class="tok-${cls}">${escapeHtml(text)}</span>`;

function highlight(source, lang) {
  const keywords = new Set(KEYWORDS[lang].split(" "));
  let html = "";
  let last = 0;
  for (const m of source.matchAll(tokenizer(lang))) {
    html += escapeHtml(source.slice(last, m.index));
    last = m.index + m[0].length;
    const g = m.groups;
    if (g.pre) {
      const [, directive, rest = ""] = g.pre.match(/^(#\s*\w+)(.*)$/s);
      html += span("pre", directive) + (rest ? span("str", rest) : "");
    } else if (g.com) html += span("com", g.com);
    else if (g.str) html += span("str", g.str);
    else if (g.num) html += span("num", g.num);
    else if (keywords.has(g.id)) html += span("kw", g.id) + escapeHtml(g.call ?? "");
    else if (g.call) html += span("fn", g.id) + escapeHtml(g.call);
    else html += escapeHtml(g.id);
  }
  return html + escapeHtml(source.slice(last));
}

for (const pre of document.querySelectorAll("pre.code[data-lang]")) {
  const code = pre.querySelector("code");
  code.innerHTML = highlight(code.textContent, pre.dataset.lang);
}

// ------------------------------------------------------------------ filters

const chips = [...document.querySelectorAll(".chip[data-filter]")];
const sections = [...document.querySelectorAll(".category[data-category]")];

function applyFilter(filter) {
  for (const chip of chips) chip.setAttribute("aria-pressed", String(chip.dataset.filter === filter));
  for (const section of sections) section.hidden = filter !== "all" && section.dataset.category !== filter;
}

for (const chip of chips) {
  const cards = chip.dataset.filter === "all" ? document.querySelectorAll(".category .card") : document.querySelectorAll(`.category[data-category="${chip.dataset.filter}"] .card`);
  chip.querySelector(".count").textContent = cards.length;
  chip.addEventListener("click", () => applyFilter(chip.dataset.filter));
}

// Navigating to a hidden category (e.g. from the top bar) resets the filter.
window.addEventListener("hashchange", () => {
  const target = document.getElementById(location.hash.slice(1));
  if (target?.hidden) {
    applyFilter("all");
    target.scrollIntoView();
  }
});

// --------------------------------------------------------------- copy install

for (const button of document.querySelectorAll(".install[data-copy]")) {
  const hint = button.querySelector(".install-hint");
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      hint.textContent = "copied!";
    } catch {
      hint.textContent = "press ⌘/Ctrl+C";
    }
    setTimeout(() => (hint.textContent = "copy"), 1600);
  });
}

// -------------------------------------------------------------- github stars

const STARS_KEY = "dmazzella:stars";
const STARS_TTL = 6 * 60 * 60 * 1000;

async function loadStars() {
  try {
    const cached = JSON.parse(localStorage.getItem(STARS_KEY) ?? "null");
    if (cached && Date.now() - cached.at < STARS_TTL) return cached.stars;
  } catch {
    /* ignore corrupted cache */
  }

  const res = await fetch("https://api.github.com/users/dmazzella/repos?per_page=100");
  if (!res.ok) return null;
  const stars = Object.fromEntries((await res.json()).map((r) => [r.name, r.stargazers_count]));
  try {
    localStorage.setItem(STARS_KEY, JSON.stringify({ at: Date.now(), stars }));
  } catch {
    /* storage may be unavailable */
  }
  return stars;
}

loadStars()
  .then((stars) => {
    if (!stars) return;
    for (const card of document.querySelectorAll(".card[data-repo]")) {
      const count = stars[card.dataset.repo];
      const el = card.querySelector(".stars");
      if (!el || !count) continue;
      el.textContent = `★ ${count}`;
      el.title = `${count} stars on GitHub`;
      el.hidden = false;
    }
  })
  .catch(() => {
    /* offline or rate-limited: stars stay hidden */
  });

document.getElementById("year").textContent = new Date().getFullYear();
