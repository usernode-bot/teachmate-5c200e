// The app shell: token handling, the API helper, the hash router, the tab
// bar, and the shared loading/empty/error renderers.

import { ICONS } from './icons.js';

const page = new URLSearchParams(location.search);
export const TOKEN = page.get('token') || '';
export const DEMO = page.get('demo') === '1';

if (DEMO) document.getElementById('demo-line').hidden = false;

// The AI error messages, fixed and neutral — never model text.
export const AI_MESSAGES = {
  ai_unavailable: "AI writing isn't available here right now.",
  declined: "TeachMate can't write about that topic. Try a different one.",
  app_cap_exceeded: "Today's AI limit for TeachMate is used up. It resets at midnight UTC.",
  budget_exceeded: "Today's AI limit for TeachMate is used up. It resets at midnight UTC.",
  ai_failed: "TeachMate couldn't finish writing that. Try again.",
  grant_required: "AI writing isn't available here right now.",
};

export async function api(path, opts = {}) {
  const url = new URL(path, location.origin);
  if (DEMO) url.searchParams.set('demo', '1');
  const headers = { ...(opts.headers || {}) };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (TOKEN) headers['x-usernode-token'] = TOKEN;
  try {
    if (window.usernode && typeof usernode.now === 'function') headers['x-usernode-now'] = usernode.now();
  } catch {}
  const res = await fetch(url, { ...opts, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data && (data.code || data.error)) || 'error');
    err.code = data && (data.code || data.error);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Wraps an AI call: on grant_required, ask the shell for access and retry
// once. A decline or a shell-less environment is treated like ai_unavailable.
export async function withAi(run) {
  try {
    return await run();
  } catch (err) {
    if (err.code !== 'grant_required') throw err;
    try {
      const granted = await usernode.requestLlmAccess();
      if (granted && granted.granted) return await run();
    } catch {}
    const wrapped = new Error(AI_MESSAGES.ai_unavailable);
    wrapped.code = 'ai_unavailable';
    throw wrapped;
  }
}

export function toast(message) {
  try {
    if (window.unNative) return unNative.toast(message);
  } catch {}
  console.log('[toast]', message);
}

export function confirmDialog({ title, message, confirmLabel = 'OK', destructive = false }) {
  return new Promise(resolve => {
    try {
      if (window.unNative) {
        unNative.alert({
          title,
          message,
          buttons: [
            { label: 'Cancel', style: 'cancel', handler: () => resolve(false) },
            { label: confirmLabel, style: destructive ? 'destructive' : 'default', handler: () => resolve(true) },
          ],
        });
        return;
      }
    } catch {}
    resolve(window.confirm(message ? `${title}\n${message}` : title));
  });
}

export function fmtWhen(iso) {
  const d = new Date(iso);
  const now = Date.now();
  const days = Math.floor((now - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Shared renderers ───────────────────────────────────────────────────────
export const skeletons = (n = 2) =>
  `<div class="flex flex-col gap-3 px-1">${Array.from({ length: n }, (_, i) =>
    `<div class="flex items-center gap-3"><div class="skeleton h-10 w-10"></div><div class="flex-1"><div class="skeleton h-4 w-2/3"></div><div class="skeleton mt-1.5 h-3 w-1/3"></div></div></div>`).join('')}</div>`;

export const stateEmpty = (title, line, actionHtml = '') =>
  `<div class="state-empty text-muted"><p class="text-body font-semibold text-fg">${esc(title)}</p><p class="text-small">${esc(line)}</p>${actionHtml}</div>`;

export const stateError = (line, retryId = 'retry') =>
  `<div class="state-error text-muted"><p class="text-body text-fg">${esc(line)}</p><button id="${retryId}" class="btn-secondary mt-1">Retry</button></div>`;

export const stateGuest = (title, line) =>
  `<div class="state-empty text-muted"><p class="text-body font-semibold text-fg">${esc(title)}</p><p class="text-small">${esc(line)}</p></div>`;

// ── Router ─────────────────────────────────────────────────────────────────
const view = document.getElementById('view');
const chrome = document.getElementById('chrome');
const tabs = [...document.querySelectorAll('.tab')];

let renderRoutes = [];
let prevDetail = false;

export function register(routes) { renderRoutes.push(...routes); }

export function navigate(hash, { replace = false } = {}) {
  if (replace) location.replace(location.pathname + location.search + hash);
  else location.hash = hash;
}

export function hashPath() {
  const raw = location.hash.replace(/^#/, '') || '/lessons';
  const q = raw.indexOf('?');
  return { path: q === -1 ? raw : raw.slice(0, q), query: new URLSearchParams(q === -1 ? '' : raw.slice(q + 1)) };
}

function match(path) {
  for (const r of renderRoutes) {
    const m = path.match(r.pattern);
    if (m) return { route: r, m };
  }
  return null;
}

export async function render() {
  const { path, query } = hashPath();
  const found = match(path) || { route: renderRoutes[0], m: [] };
  const route = found.route;
  const isDetail = route.detail === true;
  chrome.hidden = isDetail;
  const section = path.split('/')[1];
  tabs.forEach(t => {
    const on = !isDetail && t.dataset.nav === '#/' + section;
    t.classList.toggle('is-on', on);
    t.setAttribute('aria-selected', String(on));
  });
  // Pattern captures first, then the hash query (?from=… on #/quizzes).
  const args = [...found.m.slice(1).map(s => s && decodeURIComponent(s)), query];
  // Push on the way in, pop on the way back, instant cut between tabs.
  const type = isDetail ? 'push' : (prevDetail ? 'pop' : 'none');
  prevDetail = isDetail;
  const paint = async () => {
    view.innerHTML = '';
    try {
      await route.render(view, ...args);
    } catch (err) {
      console.warn('render failed', err);
      view.innerHTML = stateError('Something went wrong. Nothing you saved is lost.');
      const retry = document.getElementById('retry');
      if (retry) retry.addEventListener('click', () => render());
    }
    window.scrollTo(0, 0);
  };
  if (type === 'none' || !(window.unNative && unNative.transition)) {
    await paint();
    return;
  }
  try {
    await unNative.transition(paint, { type });
  } catch {
    await paint();
  }
}

tabs.forEach(t => t.addEventListener('click', () => {
  if (t.dataset.nav !== '#/' + hashPath().path.split('/')[1]) location.hash = t.dataset.nav;
}));
