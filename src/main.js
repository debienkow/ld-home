/* WombiCoon: Start, Login-Wechsel, Navigation */
import './style.css';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase.js';
import { USERS } from './config.js';
import { el, icon } from './dom.js';
import './pickers.js';
import { renderLogin } from './login.js';
import { startStore, state, stopStore, subscribe } from './store.js';
import { avatar, openProfile } from './profile.js';
import { mountHome } from './home.js';
import { mountShopping } from './shopping.js';
import { mountFinance } from './finance.js';
import { mountEvents, needsAnswer, upcoming } from './events.js';
import { mountDms } from './dms.js';
import { startGcalSync } from './gcal.js';

const root = document.getElementById('app');
const DEMO = import.meta.env.MODE === 'demo';

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'finanzen', label: 'Finanzen' },
  { id: 'events', label: 'Events' },
  { id: 'dms', label: 'DMS' },
  { id: 'einkauf', label: 'Einkauf' }
];
const MOUNT = { home: mountHome, einkauf: mountShopping, finanzen: mountFinance, events: mountEvents, dms: mountDms };

let unmountTab = null;
let unsubHeader = null;

const currentTab = () => {
  const id = location.hash.replace('#', '');
  return TABS.some((t) => t.id === id) ? id : 'home';
};
const go = (id) => {
  if (currentTab() === id) window.scrollTo({ top: 0, behavior: 'smooth' });
  else location.hash = id;
};

const badgeOf = (id) => {
  if (id === 'einkauf') return state.items.filter((i) => !i.done).length;
  if (id === 'events') return upcoming().filter(needsAnswer).length;
  return 0;
};

/* Gerüst mit Kopfzeile, Navigation, Inhalt */
function renderShell() {
  const profileBtn = el('button', { class: 'profile-btn', type: 'button', 'aria-label': 'Profil öffnen', onclick: openProfile });
  const offline = el('div', { class: 'offline hidden', role: 'status' }, 'Offline – Änderungen werden gespeichert und später synchronisiert.');
  const main = el('main', { class: 'content', id: 'inhalt' });
  const nav = el('nav', { class: 'tabbar', 'aria-label': 'Bereiche' });
  const tabs = Object.fromEntries(TABS.map((t) => {
    const badge = el('span', { class: 'tab-badge hidden' });
    const btn = el('button', { class: 'tab', type: 'button', onclick: () => go(t.id) },
      el('span', { class: 'tab-icon' }, icon(t.id), badge), el('span', { class: 'tab-label' }, t.label));
    return [t.id, { btn, badge }];
  }));
  nav.append(...TABS.map((t) => tabs[t.id].btn));

  const drawHeader = () => {
    profileBtn.replaceChildren(avatar(state.user.uid));
    offline.classList.toggle('hidden', state.online);
    for (const t of TABS) {
      const n = badgeOf(t.id);
      tabs[t.id].badge.textContent = n > 99 ? '99+' : String(n);
      tabs[t.id].badge.classList.toggle('hidden', !n);
    }
  };
  unsubHeader = subscribe(drawHeader);
  drawHeader();

  const showTab = () => {
    if (unmountTab) unmountTab();
    const id = currentTab();
    for (const t of TABS) {
      tabs[t.id].btn.classList.toggle('active', t.id === id);
      if (t.id === id) tabs[t.id].btn.setAttribute('aria-current', 'page'); else tabs[t.id].btn.removeAttribute('aria-current');
    }
    main.className = 'content tab-' + id;
    document.title = id === 'home' ? 'WombiCoon' : `${TABS.find((t) => t.id === id).label} · WombiCoon`;
    window.scrollTo(0, 0);
    unmountTab = MOUNT[id](main, go);
  };

  window.onhashchange = showTab;
  root.replaceChildren(
    el('header', { class: 'topbar' },
      el('button', { class: 'brand-btn', type: 'button', 'aria-label': 'Zur Startseite', onclick: () => go('home') },
        el('img', { class: 'logo', src: import.meta.env.BASE_URL + 'icon.svg', alt: '', draggable: 'false' }),
        el('span', { class: 'brand' }, 'WombiCoon'), DEMO ? el('span', { class: 'pill' }, 'Demo') : null),
      el('span', { class: 'grow' }), profileBtn),
    nav, offline, main
  );
  showTab();
}

onAuthStateChanged(auth, (user) => {
  if (unmountTab) unmountTab();
  if (unsubHeader) unsubHeader();
  unmountTab = unsubHeader = null;
  window.onhashchange = null;
  if (!user) {
    stopStore();
    renderLogin(root);
  } else if (!USERS[user.uid]) {
    stopStore();
    root.replaceChildren(el('div', { class: 'login-wrap' }, el('div', { class: 'login-card' },
      el('p', null, 'Dieses Konto ist für WombiCoon nicht freigeschaltet.'),
      el('button', { class: 'btn primary wide', type: 'button', onclick: () => signOut(auth) }, 'Abmelden'))));
  } else {
    startStore(user);
    renderShell();
    startGcalSync();
  }
});

/* Offline-Start: geladene Dateien an den Service Worker melden */
if ('serviceWorker' in navigator && import.meta.env.PROD && !DEMO) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').then(() => navigator.serviceWorker.ready).then((reg) => {
    const urls = [location.href.split('#')[0], ...performance.getEntriesByType('resource').map((r) => r.name).filter((u) => u.startsWith(location.origin))];
    if (reg.active) reg.active.postMessage({ precache: [...new Set(urls)] });
  }).catch(() => {});
}
