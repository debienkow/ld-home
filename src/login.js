/* Login-Seite mit "Passwort vergessen" */
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebase.js';
import { el } from './dom.js';

const MESSAGES = {
  'auth/invalid-credential': 'E-Mail oder Passwort stimmt nicht.',
  'auth/invalid-email': 'Bitte eine gültige E-Mail-Adresse eingeben.',
  'auth/too-many-requests': 'Zu viele Versuche. Bitte kurz warten.',
  'auth/network-request-failed': 'Keine Verbindung. Bitte Internet prüfen.',
  'auth/missing-password': 'Bitte Passwort eingeben.'
};
const msg = (e) => MESSAGES[e.code] || 'Das hat nicht geklappt. Bitte nochmal versuchen.';

export function renderLogin(root) {
  const email = el('input', { type: 'email', placeholder: 'E-Mail', autocomplete: 'username', required: true });
  const pw = el('input', { type: 'password', placeholder: 'Passwort', autocomplete: 'current-password' });
  const info = el('p', { class: 'form-info', role: 'status' });
  const submit = el('button', { class: 'btn primary wide', type: 'submit' }, 'Anmelden');

  const show = (text, bad) => {
    info.textContent = text;
    info.className = 'form-info' + (bad ? ' bad' : ' good');
  };

  const form = el(
    'form',
    {
      class: 'login-card',
      onsubmit: async (e) => {
        e.preventDefault();
        show('');
        submit.disabled = true;
        try {
          await signInWithEmailAndPassword(auth, email.value.trim(), pw.value);
        } catch (err) {
          show(msg(err), true);
          submit.disabled = false;
        }
      }
    },
    el('img', { class: 'login-logo', src: import.meta.env.BASE_URL + 'icon.svg', alt: 'LD Home' }),
    el('h1', null, 'LD Home'),
    el('label', null, 'E-Mail', email),
    el('label', null, 'Passwort', pw),
    info,
    submit,
    el(
      'button',
      {
        class: 'link-btn',
        type: 'button',
        onclick: async () => {
          if (!email.value.trim()) return show('Bitte oben deine E-Mail eintragen, dann nochmal tippen.', true);
          try {
            await sendPasswordResetEmail(auth, email.value.trim());
            show('Fertig. Falls es ein Konto gibt, ist eine Mail zum Zurücksetzen unterwegs.');
          } catch (err) {
            show(msg(err), true);
          }
        }
      },
      'Passwort vergessen?'
    )
  );

  root.replaceChildren(el('div', { class: 'login-wrap' }, form));
}
