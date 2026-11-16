/* Demo-Modus: Anmeldung ersetzt */
const subs = [];
let user = { uid: 'In3JXPoEyMPJz2BmUdZBNLJOqHK2', email: 'demo@example.com' };
const fire = () => subs.forEach((f) => f(user));
export const getAuth = () => ({ demo: true });
export const onAuthStateChanged = (_a, cb) => { subs.push(cb); setTimeout(() => cb(user), 0); return () => {}; };
export const signOut = async () => { user = null; fire(); };
export const signInWithEmailAndPassword = async () => { user = { uid: 'In3JXPoEyMPJz2BmUdZBNLJOqHK2', email: 'demo@example.com' }; fire(); };
export const sendPasswordResetEmail = async () => {};
