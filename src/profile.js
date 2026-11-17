/* Profil-Fenster: Bild, Name, Abmelden */
import { signOut } from 'firebase/auth';
import { auth } from './firebase.js';
import { confirmSheet, el, openSheet, shrinkImage } from './dom.js';
import { exportAll } from './dataio.js';
import { usageCard } from './usage.js';
import { saveProfile, saveProfilePhoto, state, uidOfKey, userName } from './store.js';

export function avatar(uid, size = '') {
  const photo = state.profiles[uid] && state.profiles[uid].photo;
  const name = userName(uid);
  return photo
    ? el('img', { class: 'avatar ' + size, src: photo, alt: name })
    : el('span', { class: 'avatar ' + size }, name.charAt(0));
}

export const keyAvatar = (key, size = '') => avatar(uidOfKey(key), size);

export function openProfile() {
  const u = state.user;
  openSheet('Profil', (body, close) => {
    const holder = el('div', { class: 'avatar-holder' }, avatar(u.uid, 'big'));
    const file = el('input', {
      type: 'file',
      accept: 'image/*',
      class: 'hidden',
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        await saveProfilePhoto(await shrinkImage(f, 200, 0.85));
        holder.replaceChildren(avatar(u.uid, 'big'));
      }
    });
    const nameInput = el('input', { type: 'text', value: userName(u.uid), maxlength: '24' });
    body.append(
      el('div', { class: 'profile-top' }, holder,
        el('h3', null, userName(u.uid)), el('p', { class: 'hint' }, u.email)),
      file,
      el('button', { class: 'btn ghost wide', onclick: () => file.click() }, 'Profilbild ändern'),
      el('label', null, 'Anzeigename', nameInput),
      el('button', {
        class: 'btn primary wide',
        onclick: async () => {
          await saveProfile({ displayName: nameInput.value.trim() });
          close();
        }
      }, 'Namen speichern'),
      usageCard(),
      el('button', { class: 'btn ghost wide', onclick: exportAll }, 'Alle Daten sichern (Download)'),
      el('button', {
        class: 'btn danger wide',
        onclick: async () => {
          if (await confirmSheet('Abmelden?', 'Möchtest du dich wirklich abmelden?', 'Abmelden')) {
            close();
            await signOut(auth);
          }
        }
      }, 'Abmelden')
    );
  });
}
