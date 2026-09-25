// Pantalla de créditos del arte: autores, licencias y enlaces de cada obra usada
// (lo exigen las licencias CC-BY, OGA-BY, CC-BY-SA y GPL). Sale de art/credits.json,
// que genera tools/art/build.mjs.

import { el, esc } from './screens.ts';

interface CreditItem {
  pack: string;
  title: string;
  authors: string[];
  licenses: string[];
  urls: string[];
  notes: string;
}

interface CreditsFile {
  note: string;
  packs: Record<string, { title: string; url: string; version?: string }>;
  items: Record<string, CreditItem>;
}

const BASE = import.meta.env.BASE_URL ?? '/';

export function setupCredits(): void {
  const panel = el('credits-panel');
  panel.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-close]') || e.target === panel) panel.classList.add('hidden');
  });
  document.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-credits]')) {
      e.preventDefault();
      void showCredits();
    }
  });
}

async function showCredits(): Promise<void> {
  const panel = el('credits-panel');
  panel.classList.remove('hidden');
  const box = panel.querySelector('.credits-box')!;
  box.innerHTML = '<p class="muted">Loading…</p>';
  let data: CreditsFile;
  let licenses: string[];
  try {
    data = (await (await fetch(`${BASE}art/credits.json`)).json()) as CreditsFile;
    const units = (await (await fetch(`${BASE}art/units.json`)).json()) as { sheets: Record<string, { license: string }> };
    licenses = [...new Set(Object.values(units.sheets).map((s) => s.license))];
  } catch {
    box.innerHTML = '<p class="error">Could not load the credits.</p><button data-close>Close</button>';
    return;
  }
  const link = (url: string, text: string) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
  const groups = Object.entries(data.packs)
    .map(([key, pack]) => {
      const items = Object.values(data.items).filter((i) => i.pack === key);
      if (!items.length) return '';
      const rows = items
        .sort((a, b) => a.title.localeCompare(b.title))
        .map(
          (i) => `<li><b>${esc(i.title)}</b> — ${esc(i.authors.join(', '))}
            <span class="lic">${esc(i.licenses.join(' / '))}</span>
            ${i.urls.map((u, n) => link(u, n ? `[${n + 1}]` : 'source')).join(' ')}
            ${i.notes ? `<div class="muted">${esc(i.notes)}</div>` : ''}</li>`,
        )
        .join('');
      return `<h4>${link(pack.url, pack.title)}</h4><ul>${rows}</ul>`;
    })
    .join('');
  box.innerHTML = `<div class="dp-head"><h3>Art credits</h3><button data-close title="Close">✕</button></div>
    <p>Game code and rules: original, public domain (CC0). Unit art: made from these open works,
    thank you to all their authors! The combined pictures are shared under <b>${esc(licenses.join(' / '))}</b>.</p>
    ${groups}`;
}
