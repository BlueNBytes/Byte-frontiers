/* Browser-only account storage. Works on static hosting; no Node.js required.
   Accounts and progress remain on this browser/device, not a remote cloud. */
(function () {
  const DB_KEY = 'byte_frontiers_accounts_v1';
  const enc = new TextEncoder();
  function readDB() {
    try { return JSON.parse(localStorage.getItem(DB_KEY) || '{}'); }
    catch (_) { return {}; }
  }
  function writeDB(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  function normalize(name) { return String(name || '').trim().toLowerCase(); }
  function bytesToBase64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
  function base64ToBytes(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
  async function derive(password, salt) {
    if (!crypto.subtle) throw new Error('Password security requires HTTPS or localhost. Host these files on a static HTTPS site (for example GitHub Pages).');
    const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, material, 256);
    return bytesToBase64(bits);
  }
  async function register(username, password, email) {
    const key = normalize(username);
    if (!/^[a-z0-9_-]{3,20}$/.test(key)) throw new Error('Username must be 3–20 characters (letters, numbers, _ or -).');
    if (String(password).length < 8) throw new Error('Password must be at least 8 characters.');
    const db = readDB();
    if (db[key]) throw new Error('That username already exists in this browser.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    db[key] = { username: String(username).trim(), email: String(email || ''), salt: bytesToBase64(salt), passwordHash: await derive(password, salt), createdAt: new Date().toISOString(), gameState: null, inventory: { money: 50 } };
    writeDB(db); return db[key];
  }
  async function login(username, password) {
    const key = normalize(username), account = readDB()[key];
    if (!account) throw new Error('Account not found in this browser. Sign up here first.');
    const valid = await derive(password, base64ToBytes(account.salt));
    if (valid !== account.passwordHash) throw new Error('Incorrect username or password.');
    return account;
  }
  function currentKey() { return normalize(localStorage.getItem('bf_auth_token')); }
  function getCurrent() { const key = currentKey(); return key ? readDB()[key] || null : null; }
  function saveGame(gameState) {
    const key = currentKey(); if (!key) throw new Error('Please sign in first.');
    const db = readDB(); if (!db[key]) throw new Error('Account not found. Please sign in again.');
    db[key].gameState = gameState; db[key].inventory = db[key].inventory || {}; db[key].inventory.money = gameState.money;
    db[key].updatedAt = new Date().toISOString(); writeDB(db); return true;
  }
  window.BFAccounts = { register, login, getCurrent, saveGame };
})();
