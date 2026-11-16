/* LD Home: Start, Login-Wechsel, Tabs */
import './style.css';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase.js';
import { USERS } from './config.js';
import { el } from './dom.js';
import { renderLogin } from './login.js';
import { startStore, state, stopStore, subscribe } from './store.js';
import { avatar, openProfile } from './profile.js';
import { mountHome, mountSoon } from './home.js';
import { mountShopping } from './shopping.js';
import { mountFinance } from './finance.js';
import { mountEvents } from './events.js';
import { mountDms } from './dms.js';
import { startGcalSync } from './gcal.js';

const root = document.getElementById('app');

const TABS = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'finanzen', label: 'Finanzen', icon: '💶' },
  { id: 'events', label: 'Events', icon: '📅' },
  { id: 'dms', label: 'DMS', icon: '🗂' },
  { id: 'einkauf', label: 'Einkauf', icon: '🛒' }
];

let unmountTab = null;
let unsubHeader = null;

const currentTab = () => {
  const id = location.hash.replace('#', '');
  return TABS.some((t) => t.id === id) ? id : 'home';
};
const go = (id) => {
  location.hash = id;
};

/* Gerüst mit Kopfzeile, Inhalt, Tab-Leiste */
function renderShell() {
  const profileBtn = el('button', { class: 'profile-btn', 'aria-label': 'Profil', onclick: openProfile });
  const offline = el('div', { class: 'offline hidden' }, 'Offline: Änderungen werden später synchronisiert.');
  const main = el('main', { class: 'content' });
  const nav = el('nav', { class: 'tabbar' });

  const drawHeader = () => {
    profileBtn.replaceChildren(avatar(state.user.uid));
    offline.classList.toggle('hidden', state.online);
  };
  unsubHeader = subscribe(drawHeader);
  drawHeader();

  const drawTabs = () => {
    const cur = currentTab();
    nav.replaceChildren(
      ...TABS.map((t) =>
        el('button', { class: 'tab' + (t.id === cur ? ' active' : ''), onclick: () => go(t.id) },
          el('span', { class: 'tab-icon' }, t.icon), el('span', null, t.label))
      )
    );
  };

  const showTab = () => {
    if (unmountTab) unmountTab();
    const id = currentTab();
    drawTabs();
    window.scrollTo(0, 0);
    if (id === 'home') unmountTab = mountHome(main, go);
    else if (id === 'einkauf') unmountTab = mountShopping(main);
    else if (id === 'finanzen') unmountTab = mountFinance(main);
    else if (id === 'events') unmountTab = mountEvents(main);
    else unmountTab = mountDms(main);
  };

  window.onhashchange = showTab;
  root.replaceChildren(
    el('header', { class: 'topbar' },
      el('img', { class: 'logo', src: import.meta.env.BASE_URL + 'icon.svg', alt: '' }),
      el('span', { class: 'brand' }, import.meta.env.MODE === 'demo' ? 'LD Home (Demo)' : 'LD Home'), profileBtn),
    offline, main, nav
  );
  showTab();
}

onAuthStateChanged(auth, (user) => {
  if (unmountTab) unmountTab();
  if (unsubHeader) unsubHeader();
  unmountTab = unsubHeader = null;
  if (!user) {
    stopStore();
    renderLogin(root);
  } else if (!USERS[user.uid]) {
    root.replaceChildren(el('p', { class: 'empty' }, 'Dieses Konto ist für LD Home nicht freigeschaltet.'));
  } else {
    startStore(user);
    renderShell();
    startGcalSync();
  }
});

if ('serviceWorker' in navigator && import.meta.env.PROD && import.meta.env.MODE !== 'demo') {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {});
}
